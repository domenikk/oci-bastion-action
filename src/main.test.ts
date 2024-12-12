import { describe, it, expect, mock, afterEach, spyOn } from 'bun:test';
import * as main from './main.js';
import { BASTION_PLUGIN_NAME } from './constants.js';

mock.module('oci-bastion', () => {
  return {
    BastionClient: mock(() => {
      return {
        getBastion: mock(),
        updateBastion: mock(),
        listSessions: mock(),
        getSession: mock(),
        createSession: mock()
      };
    })
  };
});

mock.module('oci-core', () => {
  return {
    ComputeClient: mock(() => {
      return {
        getInstance: mock(),
        updateInstance: mock()
      };
    })
  };
});

mock.module('oci-computeinstanceagent', () => {
  return {
    PluginClient: mock(() => {
      return {
        getInstanceAgentPlugin: mock()
      };
    })
  };
});

describe('main', () => {
  describe('allowCurrentIp', () => {
    const publicIp = '192.168.1.10';
    const logger = { info: mock(), debug: mock() };
    const ipProvider = mock(async () => publicIp);
    const saveState = mock();

    it('should throw an error if bastion is not found', async () => {
      const { BastionClient } = await import('oci-bastion');
      // @ts-ignore
      const client = new BastionClient();
      // @ts-ignore
      client.getBastion.mockResolvedValue({ bastion: null });

      await expect(
        main.allowCurrentIp(client, 'bastionId', ipProvider, logger, saveState)
      ).rejects.toThrow();
    });

    it('should take no action if the current IP is already allowed', async () => {
      const { BastionClient } = await import('oci-bastion');
      // @ts-ignore
      const client = new BastionClient();
      // @ts-ignore
      client.getBastion.mockResolvedValue({
        bastion: {
          clientCidrBlockAllowList: ['192.168.1.1/26']
        }
      });

      await main.allowCurrentIp(client, 'bastionId', ipProvider, logger, saveState);

      expect(saveState).toHaveBeenCalledWith('currentPublicIp', publicIp);
      expect(logger.info).toHaveBeenCalledWith(`Current IP ${publicIp} is already allowed`);
      expect(client.updateBastion).not.toHaveBeenCalled();
    });

    it('should add the current IP to the allow list', async () => {
      const { BastionClient } = await import('oci-bastion');
      // @ts-ignore
      const client = new BastionClient();
      // @ts-ignore
      client.getBastion.mockResolvedValue({
        bastion: {
          clientCidrBlockAllowList: ['10.0.1.1/26']
        }
      });

      await main.allowCurrentIp(client, 'bastionId', ipProvider, logger, saveState);

      expect(saveState).toHaveBeenCalledWith('currentPublicIp', publicIp);
      expect(logger.info).toHaveBeenCalledWith(
        `Current IP ${publicIp} is not allowed, adding to the list`
      );
      expect(client.updateBastion).toHaveBeenCalledWith({
        bastionId: 'bastionId',
        updateBastionDetails: { clientCidrBlockAllowList: ['10.0.1.1/26', `${publicIp}/32`] }
      });
    });
  });

  describe('enableBastionPlugin', () => {
    const logger = { debug: mock(), info: mock(), warning: mock() };

    it('should throw an error if instance not found', async () => {
      const { ComputeClient } = await import('oci-core');
      const { PluginClient } = await import('oci-computeinstanceagent');
      // @ts-ignore
      const computeClient = new ComputeClient();
      // @ts-ignore
      computeClient.getInstance.mockRejectedValue(new Error('Instance not found'));
      // @ts-ignore
      const pluginClient = new PluginClient();
      // @ts-ignore
      pluginClient.getInstanceAgentPlugin.mockResolvedValue({ instanceAgentPlugin: {} });

      await expect(
        main.enableBastionPlugin(computeClient, pluginClient, 'instanceId', logger)
      ).rejects.toThrow('Instance not found');
    });

    it('should throw an error if bastion plugin not found', async () => {
      const { ComputeClient } = await import('oci-core');
      const { PluginClient } = await import('oci-computeinstanceagent');
      // @ts-ignore
      const computeClient = new ComputeClient();
      // @ts-ignore
      computeClient.getInstance.mockResolvedValue({ instance: {} });
      // @ts-ignore
      const pluginClient = new PluginClient();
      // @ts-ignore
      pluginClient.getInstanceAgentPlugin.mockRejectedValue(new Error('Plugin not found'));

      await expect(
        main.enableBastionPlugin(computeClient, pluginClient, 'instanceId', logger)
      ).rejects.toThrow('Plugin not found');
    });

    it('should throw an error if bastion plugin is not supported', async () => {
      const { ComputeClient } = await import('oci-core');
      const { PluginClient, models: pluginModels } = await import('oci-computeinstanceagent');
      // @ts-ignore
      const computeClient = new ComputeClient();
      // @ts-ignore
      computeClient.getInstance.mockResolvedValue({
        instance: {
          agentConfig: {}
        }
      });
      // @ts-ignore
      const pluginClient = new PluginClient();
      // @ts-ignore
      pluginClient.getInstanceAgentPlugin.mockResolvedValue({
        instanceAgentPlugin: {
          name: BASTION_PLUGIN_NAME,
          status: pluginModels.InstanceAgentPluginSummary.Status.NotSupported
        }
      });

      await expect(
        main.enableBastionPlugin(computeClient, pluginClient, 'instanceId', logger)
      ).rejects.toThrow('Bastion plugin not supported');

      // @ts-ignore
      pluginClient.getInstanceAgentPlugin.mockResolvedValue({
        instanceAgentPlugin: {
          name: BASTION_PLUGIN_NAME,
          status: pluginModels.InstanceAgentPluginSummary.Status.Invalid
        }
      });

      await expect(
        main.enableBastionPlugin(computeClient, pluginClient, 'instanceId', logger)
      ).rejects.toThrow('Bastion plugin not supported');
    });

    it('should throw an error if agent config not found', async () => {
      const { ComputeClient } = await import('oci-core');
      const { PluginClient } = await import('oci-computeinstanceagent');
      // @ts-ignore
      const computeClient = new ComputeClient();
      // @ts-ignore
      computeClient.getInstance.mockResolvedValue({ instance: {} });
      // @ts-ignore
      const pluginClient = new PluginClient();
      // @ts-ignore
      pluginClient.getInstanceAgentPlugin.mockResolvedValue({ instanceAgentPlugin: {} });

      await expect(
        main.enableBastionPlugin(computeClient, pluginClient, 'instanceId', logger)
      ).rejects.toThrow('Oracle Cloud Agent config not found for instance instanceId');
    });

    it('should warn if agent plugin config not found', async () => {
      const { ComputeClient } = await import('oci-core');
      const { PluginClient, models: pluginModels } = await import('oci-computeinstanceagent');
      // @ts-ignore
      const computeClient = new ComputeClient();
      // @ts-ignore
      computeClient.getInstance.mockResolvedValue({
        instance: {
          agentConfig: {}
        }
      });
      // @ts-ignore
      const pluginClient = new PluginClient();
      // @ts-ignore
      pluginClient.getInstanceAgentPlugin.mockResolvedValue({
        instanceAgentPlugin: {
          name: BASTION_PLUGIN_NAME,
          status: pluginModels.InstanceAgentPluginSummary.Status.UnknownValue
        }
      });

      await main.enableBastionPlugin(computeClient, pluginClient, 'instanceId', logger);

      expect(logger.warning).toHaveBeenCalledWith(
        'Oracle Cloud Agent plugins config not found for instance instanceId'
      );

      // @ts-ignore
      computeClient.getInstance.mockResolvedValue({
        instance: {
          agentConfig: {
            pluginsConfig: [
              {
                name: 'other-plugin'
              }
            ]
          }
        }
      });

      await main.enableBastionPlugin(computeClient, pluginClient, 'instanceId', logger);

      expect(logger.warning).toHaveBeenCalledWith(
        'Bastion plugin config not found for instance instanceId'
      );
    });

    it('should take no action if bastion plugin is already enabled or running', async () => {
      const { ComputeClient, models: computeModels } = await import('oci-core');
      const { PluginClient, models: pluginModels } = await import('oci-computeinstanceagent');
      // @ts-ignore
      const computeClient = new ComputeClient();
      // @ts-ignore
      computeClient.getInstance.mockResolvedValue({
        instance: {
          agentConfig: {
            pluginsConfig: [
              {
                name: BASTION_PLUGIN_NAME,
                desiredState: computeModels.InstanceAgentPluginConfigDetails.DesiredState.Enabled
              }
            ]
          }
        }
      });
      // @ts-ignore
      const pluginClient = new PluginClient();
      // @ts-ignore
      pluginClient.getInstanceAgentPlugin.mockResolvedValue({
        instanceAgentPlugin: {
          name: BASTION_PLUGIN_NAME,
          status: pluginModels.InstanceAgentPluginSummary.Status.UnknownValue
        }
      });

      await main.enableBastionPlugin(computeClient, pluginClient, 'instanceId', logger);

      expect(logger.info).toHaveBeenCalledWith(
        'Bastion plugin already enabled for instance instanceId'
      );
      expect(computeClient.updateInstance).not.toHaveBeenCalled();

      // @ts-ignore
      computeClient.getInstance.mockResolvedValue({
        instance: {
          agentConfig: {
            pluginsConfig: [
              {
                name: BASTION_PLUGIN_NAME,
                desiredState:
                  computeModels.InstanceAgentPluginConfigDetails.DesiredState.UnknownValue
              }
            ]
          }
        }
      });
      // @ts-ignore
      pluginClient.getInstanceAgentPlugin.mockResolvedValue({
        instanceAgentPlugin: {
          name: BASTION_PLUGIN_NAME,
          status: pluginModels.InstanceAgentPluginSummary.Status.Running
        }
      });

      await main.enableBastionPlugin(computeClient, pluginClient, 'instanceId', logger);

      expect(logger.info).toHaveBeenCalledWith(
        'Bastion plugin already enabled for instance instanceId'
      );
      expect(computeClient.updateInstance).not.toHaveBeenCalled();
    });

    it('should enable bastion plugin', async () => {
      const { ComputeClient, models: computeModels } = await import('oci-core');
      const { PluginClient, models: pluginModels } = await import('oci-computeinstanceagent');
      // @ts-ignore
      const computeClient = new ComputeClient();
      // @ts-ignore
      computeClient.getInstance.mockResolvedValue({
        instance: {
          agentConfig: {
            pluginsConfig: [
              {
                name: 'other-plugin'
              },
              {
                name: BASTION_PLUGIN_NAME,
                desiredState: computeModels.InstanceAgentPluginConfigDetails.DesiredState.Disabled
              }
            ]
          }
        }
      });
      // @ts-ignore
      const pluginClient = new PluginClient();
      // @ts-ignore
      pluginClient.getInstanceAgentPlugin.mockResolvedValue({
        instanceAgentPlugin: {
          name: BASTION_PLUGIN_NAME,
          status: pluginModels.InstanceAgentPluginSummary.Status.Stopped
        }
      });

      await main.enableBastionPlugin(computeClient, pluginClient, 'instanceId', logger);

      expect(computeClient.updateInstance).toHaveBeenCalledWith({
        instanceId: 'instanceId',
        updateInstanceDetails: {
          agentConfig: {
            pluginsConfig: [
              {
                name: 'other-plugin'
              },
              {
                name: BASTION_PLUGIN_NAME,
                desiredState: computeModels.InstanceAgentPluginConfigDetails.DesiredState.Enabled
              }
            ]
          }
        }
      });
    });
  });

  describe('createSession', () => {
    const logger = { info: mock() };

    it('should return existing active session if found', async () => {
      const { BastionClient, models: bastionModels } = await import('oci-bastion');
      // @ts-ignore
      const client = new BastionClient();
      // @ts-ignore
      client.listSessions.mockResolvedValue({
        items: [
          {
            id: 'sessionId',
            targetResourceDetails: {
              sessionType: bastionModels.SessionType.ManagedSsh,
              targetResourceId: 'targetResourceId'
            },
            lifecycleState: bastionModels.SessionLifecycleState.Active
          }
        ]
      });
      // @ts-ignore
      client.getSession.mockResolvedValue({
        session: {
          id: 'sessionId',
          lifecycleState: bastionModels.SessionLifecycleState.Active
        }
      });

      expect(
        main.createSession(
          client,
          {
            bastionId: 'bastionId',
            displayName: 'displayName',
            targetResourceDetails: {
              sessionType: bastionModels.SessionType.ManagedSsh,
              targetResourceId: 'targetResourceId'
            },
            keyDetails: {
              publicKeyContent: 'publicKeyContent'
            }
          },
          logger
        )
      ).resolves.toMatchObject({
        id: 'sessionId',
        lifecycleState: bastionModels.SessionLifecycleState.Active
      });
    });

    it('should wait for existing session to become active and return it', async () => {
      const { BastionClient, models: bastionModels } = await import('oci-bastion');
      // @ts-ignore
      const client = new BastionClient();
      // @ts-ignore
      client.listSessions.mockResolvedValue({
        items: [
          {
            id: 'sessionId',
            targetResourceDetails: {
              sessionType: bastionModels.SessionType.ManagedSsh,
              targetResourceId: 'targetResourceId'
            },
            lifecycleState: bastionModels.SessionLifecycleState.Creating
          }
        ]
      });
      // @ts-ignore
      client.getSession.mockResolvedValue({
        session: {
          id: 'sessionId',
          lifecycleState: bastionModels.SessionLifecycleState.Active
        }
      });

      expect(
        main.createSession(
          client,
          {
            bastionId: 'bastionId',
            displayName: 'displayName',
            targetResourceDetails: {
              sessionType: bastionModels.SessionType.ManagedSsh,
              targetResourceId: 'targetResourceId'
            },
            keyDetails: {
              publicKeyContent: 'publicKeyContent'
            }
          },
          logger
        )
      ).resolves.toMatchObject({
        id: 'sessionId',
        lifecycleState: bastionModels.SessionLifecycleState.Active
      });
    });

    it('should create a new session if no existing session is found', async () => {
      const { BastionClient, models: bastionModels } = await import('oci-bastion');
      // @ts-ignore
      const client = new BastionClient();
      // @ts-ignore
      client.listSessions.mockResolvedValue({ items: [] });
      // @ts-ignore
      client.createSession.mockResolvedValue({
        session: {
          id: 'sessionId',
          lifecycleState: bastionModels.SessionLifecycleState.Creating
        }
      });
      // @ts-ignore
      client.getSession.mockResolvedValue({
        session: {
          id: 'sessionId',
          lifecycleState: bastionModels.SessionLifecycleState.Active
        }
      });

      expect(
        main.createSession(
          client,
          {
            bastionId: 'bastionId',
            displayName: 'displayName',
            targetResourceDetails: {
              sessionType: bastionModels.SessionType.ManagedSsh,
              targetResourceId: 'targetResourceId'
            },
            keyDetails: {
              publicKeyContent: 'publicKeyContent'
            }
          },
          logger
        )
      ).resolves.toMatchObject({
        id: 'sessionId',
        lifecycleState: bastionModels.SessionLifecycleState.Active
      });
    });
  });

  describe('findExistingSession', () => {
    it('should return undefined if session not found', async () => {
      const { BastionClient, models: bastionModels } = await import('oci-bastion');
      // @ts-ignore
      const client = new BastionClient();
      // @ts-ignore
      client.listSessions.mockResolvedValue({ items: [] });

      expect(
        main.findExistingSession({
          client,
          createSessionDetails: {
            bastionId: 'bastionId',
            displayName: 'displayName',
            targetResourceDetails: {
              sessionType: bastionModels.SessionType.ManagedSsh,
              targetResourceId: 'targetResourceId'
            },
            keyDetails: {
              publicKeyContent: 'publicKeyContent'
            }
          }
        })
      ).resolves.toBeUndefined();

      // @ts-ignore
      client.listSessions.mockResolvedValue({
        items: [
          {
            targetResourceDetails: {
              sessionType: bastionModels.SessionType.ManagedSsh,
              targetResourceId: 'targetResourceId',
              targetResourceOperatingSystemUserName: 'otherUserName'
            }
          }
        ]
      });

      expect(
        main.findExistingSession({
          client,
          createSessionDetails: {
            bastionId: 'bastionId',
            displayName: 'displayName',
            targetResourceDetails: {
              sessionType: bastionModels.SessionType.ManagedSsh,
              targetResourceId: 'targetResourceId',
              targetResourceOperatingSystemUserName: 'userName'
            },
            keyDetails: {
              publicKeyContent: 'publicKeyContent'
            }
          }
        })
      ).resolves.toBeUndefined();
    });

    it('should return the session if found', async () => {
      const { BastionClient, models: bastionModels } = await import('oci-bastion');
      // @ts-ignore
      const client = new BastionClient();
      // @ts-ignore
      client.listSessions.mockResolvedValue({
        items: [
          {
            id: 'sessionId',
            targetResourceDetails: {
              sessionType: bastionModels.SessionType.PortForwarding,
              targetResourceId: 'targetResourceId',
              targetResourcePrivateIpAddress: 'targetResourcePrivateIpAddress',
              targetResourcePort: 22
            }
          }
        ]
      });

      expect(
        main.findExistingSession({
          client,
          createSessionDetails: {
            bastionId: 'bastionId',
            displayName: 'displayName',
            targetResourceDetails: {
              sessionType: bastionModels.SessionType.PortForwarding,
              targetResourceId: 'targetResourceId',
              targetResourcePrivateIpAddress: 'targetResourcePrivateIpAddress',
              targetResourcePort: 22
            },
            keyDetails: {
              publicKeyContent: 'publicKeyContent'
            }
          }
        })
      ).resolves.toMatchObject({
        id: 'sessionId',
        targetResourceDetails: {
          sessionType: bastionModels.SessionType.PortForwarding,
          targetResourceId: 'targetResourceId',
          targetResourcePrivateIpAddress: 'targetResourcePrivateIpAddress',
          targetResourcePort: 22
        }
      });

      // @ts-ignore
      client.listSessions.mockResolvedValue({
        items: [
          {
            id: 'sessionId',
            targetResourceDetails: {
              sessionType: bastionModels.SessionType.DynamicPortForwarding
            }
          }
        ]
      });

      expect(
        main.findExistingSession({
          client,
          createSessionDetails: {
            bastionId: 'bastionId',
            displayName: 'displayName',
            targetResourceDetails: {
              sessionType: bastionModels.SessionType.DynamicPortForwarding
            },
            keyDetails: {
              publicKeyContent: 'publicKeyContent'
            }
          }
        })
      ).resolves.toMatchObject({
        id: 'sessionId',
        targetResourceDetails: {
          sessionType: bastionModels.SessionType.DynamicPortForwarding
        }
      });
    });
  });

  describe('waitForSession', () => {
    it('should throw an error if session not found', async () => {
      const { BastionClient, models: bastionModels } = await import('oci-bastion');
      // @ts-ignore
      const client = new BastionClient();
      // @ts-ignore
      client.getSession.mockRejectedValue(new Error('Session not found'));

      expect(
        main.waitForSession({
          client,
          sessionId: 'sessionId',
          desiredState: bastionModels.SessionLifecycleState.Active
        })
      ).rejects.toThrow('Session not found');
    });

    it('should return immediately if session is already in the desired state', async () => {
      const { BastionClient, models: bastionModels } = await import('oci-bastion');
      // @ts-ignore
      const client = new BastionClient();
      // @ts-ignore
      client.getSession.mockResolvedValue({
        session: {
          lifecycleState: bastionModels.SessionLifecycleState.Active
        }
      });

      expect(
        main.waitForSession({
          client,
          sessionId: 'sessionId',
          desiredState: bastionModels.SessionLifecycleState.Active
        })
      ).resolves.toMatchObject({
        lifecycleState: bastionModels.SessionLifecycleState.Active
      });
    });

    it('should throw an error if session does not reach the desired state', async () => {
      const { BastionClient, models: bastionModels } = await import('oci-bastion');
      // @ts-ignore
      const client = new BastionClient();

      for (let i = 0; i < 5; i++) {
        // @ts-ignore
        client.getSession.mockResolvedValueOnce({
          session: {
            lifecycleState: bastionModels.SessionLifecycleState.Creating
          }
        });
      }

      const expectedElapsedTime = 4 / 1000;

      expect(
        main.waitForSession({
          client,
          sessionId: 'sessionId',
          desiredState: bastionModels.SessionLifecycleState.Active,
          pollingInterval: 1,
          maxAttempts: 4
        })
      ).rejects.toThrow(
        `Session sessionId did not reach desired state ${bastionModels.SessionLifecycleState.Active} after ${expectedElapsedTime} seconds`
      );
    });

    it('should return the session when it reaches the desired state', async () => {
      const { BastionClient, models: bastionModels } = await import('oci-bastion');
      // @ts-ignore
      const client = new BastionClient();
      // return 'Creating' for the first 5 calls, then 'Active'
      for (let i = 0; i < 5; i++) {
        // @ts-ignore
        client.getSession.mockResolvedValueOnce({
          session: {
            lifecycleState: bastionModels.SessionLifecycleState.Creating
          }
        });
      }
      // @ts-ignore
      client.getSession.mockResolvedValue({
        session: {
          lifecycleState: bastionModels.SessionLifecycleState.Active
        }
      });

      expect(
        main.waitForSession({
          client,
          sessionId: 'sessionId',
          desiredState: bastionModels.SessionLifecycleState.Active,
          pollingInterval: 1,
          maxAttempts: 10
        })
      ).resolves.toMatchObject({
        lifecycleState: bastionModels.SessionLifecycleState.Active
      });
    });
  });

  describe('run', async () => {
    mock.module('./input.js', () => {
      return {
        parseInputs: mock()
      };
    });
    // NOTE: https://github.com/oven-sh/bun/issues/6040#issuecomment-2253150377
    let allowCurrentIpMock = mock();
    let enableBastionPluginMock = mock();
    let createSessionMock = mock();

    mock.module('@actions/core', () => {
      return {
        warning: mock(),
        setOutput: mock(),
        setFailed: mock(),
        saveState: mock()
      };
    });
    const { warning, setOutput, setFailed, saveState } = await import('@actions/core');

    afterEach(() => {
      allowCurrentIpMock.mockRestore();
      enableBastionPluginMock.mockRestore();
      createSessionMock.mockRestore();
      // @ts-ignore
      warning.mockRestore();
      // @ts-ignore
      setOutput.mockClear();
      // @ts-ignore
      setFailed.mockClear();
      // @ts-ignore
      saveState.mockClear();
    });

    it('should fail if required inputs are missing', async () => {
      const { parseInputs } = await import('./input.js');
      // @ts-ignore
      parseInputs.mockImplementation(() => {
        throw new Error('Missing required inputs');
      });

      await main.run();

      expect(parseInputs).toHaveBeenCalled();
      expect(saveState).not.toHaveBeenCalled();
      expect(setOutput).not.toHaveBeenCalled();
      expect(setFailed).toHaveBeenCalledWith('Missing required inputs');
    });

    it('should fail if allowCurrentIp throws an error', async () => {
      const { parseInputs } = await import('./input.js');
      // @ts-ignore
      parseInputs.mockReturnValue({
        oci: {
          tenancy: 'tenancy',
          user: 'user',
          fingerprint: 'fingerprint',
          keyContent: 'keyContent',
          region: 'region'
        },
        bastionId: 'bastionId',
        publicKey: 'publicKey',
        sessionTtlSeconds: 600,
        targetResourceDetails: {
          sessionType: 'MANAGED_SSH',
          targetResourceId: 'targetResourceId',
          targetResourceOperatingSystemUserName: 'userName'
        }
      });

      allowCurrentIpMock = spyOn(main, 'allowCurrentIp').mockImplementationOnce(async () => {
        throw new Error('Failed to allow current IP');
      });

      await main.run();

      expect(saveState).toHaveBeenCalled();
      expect(allowCurrentIpMock).toHaveBeenCalled();
      expect(enableBastionPluginMock).not.toHaveBeenCalled();
      expect(createSessionMock).not.toHaveBeenCalled();
      expect(setOutput).not.toHaveBeenCalled();
      expect(setFailed).toHaveBeenCalledWith('Failed to allow current IP');
    });

    it('should fail if enableBastionPlugin throws an error for MANAGED_SSH session', async () => {
      const { parseInputs } = await import('./input.js');
      // @ts-ignore
      parseInputs.mockReturnValue({
        oci: {
          tenancy: 'tenancy',
          user: 'user',
          fingerprint: 'fingerprint',
          keyContent: 'keyContent',
          region: 'region'
        },
        bastionId: 'bastionId',
        publicKey: 'publicKey',
        sessionTtlSeconds: 600,
        targetResourceDetails: {
          sessionType: 'MANAGED_SSH',
          targetResourceId: 'targetResourceId',
          targetResourceOperatingSystemUserName: 'userName'
        }
      });

      allowCurrentIpMock = spyOn(main, 'allowCurrentIp').mockImplementationOnce(async () => {});
      enableBastionPluginMock = spyOn(main, 'enableBastionPlugin').mockImplementationOnce(
        async () => {
          throw new Error('Failed to enable bastion plugin');
        }
      );

      await main.run();

      expect(saveState).toHaveBeenCalled();
      expect(allowCurrentIpMock).toHaveBeenCalled();
      expect(enableBastionPluginMock).toHaveBeenCalled();
      expect(createSessionMock).not.toHaveBeenCalled();
      expect(setOutput).not.toHaveBeenCalled();
      expect(setFailed).toHaveBeenCalledWith('Failed to enable bastion plugin');
    });

    it('should fail if bastion not found for PORT_FORWARDING or DYNAMIC_PORT_FORWARDING session', async () => {
      const { BastionClient, models: bastionModels } = await import('oci-bastion');
      const { parseInputs } = await import('./input.js');
      // @ts-ignore
      parseInputs.mockReturnValue({
        oci: {
          tenancy: 'tenancy',
          user: 'user',
          fingerprint: 'fingerprint',
          keyContent: 'keyContent',
          region: 'region'
        },
        bastionId: 'bastionId',
        publicKey: 'publicKey',
        sessionTtlSeconds: 600,
        targetResourceDetails: {
          sessionType: bastionModels.SessionType.DynamicPortForwarding
        }
      });

      allowCurrentIpMock = spyOn(main, 'allowCurrentIp').mockImplementationOnce(async () => {});
      enableBastionPluginMock = spyOn(main, 'enableBastionPlugin').mockImplementationOnce(
        async () => {}
      );
      createSessionMock = spyOn(main, 'createSession');
      // @ts-ignore
      BastionClient.mockImplementation(() => {
        return {
          getBastion: async () => {
            return { bastion: undefined };
          }
        };
      });

      await main.run();

      expect(saveState).toHaveBeenCalled();
      expect(allowCurrentIpMock).toHaveBeenCalled();
      expect(enableBastionPluginMock).not.toHaveBeenCalled();
      expect(createSessionMock).not.toHaveBeenCalled();
      expect(setOutput).not.toHaveBeenCalled();
      expect(setFailed).toHaveBeenCalledWith('Bastion not found: bastionId');
    });

    it('should fail if createSession throws an error', async () => {
      const { BastionClient, models: bastionModels } = await import('oci-bastion');
      const { parseInputs } = await import('./input.js');
      // @ts-ignore
      parseInputs.mockReturnValue({
        oci: {
          tenancy: 'tenancy',
          user: 'user',
          fingerprint: 'fingerprint',
          keyContent: 'keyContent',
          region: 'region'
        },
        bastionId: 'bastionId',
        publicKey: 'publicKey',
        sessionTtlSeconds: 600,
        targetResourceDetails: {
          sessionType: 'DYNAMIC_PORT_FORWARDING'
        }
      });

      allowCurrentIpMock = spyOn(main, 'allowCurrentIp').mockImplementationOnce(async () => {});
      enableBastionPluginMock = spyOn(main, 'enableBastionPlugin').mockImplementationOnce(
        async () => {}
      );
      createSessionMock = spyOn(main, 'createSession').mockImplementationOnce(async () => {
        throw new Error('Failed to create session');
      });
      // @ts-ignore
      BastionClient.mockImplementation(() => {
        return {
          getBastion: async () => {
            return {
              bastion: {
                dnsProxyStatus: bastionModels.BastionDnsProxyStatus.Disabled
              }
            };
          }
        };
      });

      await main.run();

      expect(saveState).toHaveBeenCalled();
      expect(allowCurrentIpMock).toHaveBeenCalled();
      expect(enableBastionPluginMock).not.toHaveBeenCalled();
      expect(createSessionMock).toHaveBeenCalled();
      expect(warning).toHaveBeenCalledWith('DNS Proxy is not enabled for the bastion');
      expect(setOutput).not.toHaveBeenCalled();
      expect(setFailed).toHaveBeenCalledWith('Failed to create session');
    });

    it('should set the session ID in the output', async () => {
      const { parseInputs } = await import('./input.js');
      // @ts-ignore
      parseInputs.mockReturnValue({
        oci: {
          tenancy: 'tenancy',
          user: 'user',
          fingerprint: 'fingerprint',
          keyContent: 'keyContent',
          region: 'region'
        },
        bastionId: 'bastionId',
        publicKey: 'publicKey',
        sessionTtlSeconds: 600,
        targetResourceDetails: {
          sessionType: 'MANAGED_SSH',
          targetResourceId: 'targetResourceId',
          targetResourceOperatingSystemUserName: 'userName'
        }
      });

      allowCurrentIpMock = spyOn(main, 'allowCurrentIp').mockImplementationOnce(async () => {});
      enableBastionPluginMock = spyOn(main, 'enableBastionPlugin').mockImplementationOnce(
        async () => {}
      );
      // @ts-ignore
      createSessionMock = spyOn(main, 'createSession').mockImplementationOnce(async () => {
        return { id: 'sessionId' };
      });

      await main.run();

      expect(saveState).toHaveBeenCalled();
      expect(allowCurrentIpMock).toHaveBeenCalled();
      expect(enableBastionPluginMock).toHaveBeenCalled();
      expect(createSessionMock).toHaveBeenCalled();
      expect(setOutput).toHaveBeenCalledWith('session-id', 'sessionId');
      expect(setFailed).not.toHaveBeenCalled();
    });
  });
});
