import { debug, info, warning, setFailed, setOutput } from '@actions/core';
import { context } from '@actions/github';
import { Context } from '@actions/github/lib/context.js';
import { SimpleAuthenticationDetailsProvider } from 'oci-common';
import { ComputeClient, models as computeModels } from 'oci-core';
import { PluginClient, models as pluginModels } from 'oci-computeinstanceagent';
import { BastionClient, models as bastionModels } from 'oci-bastion';
import { publicIpv4 } from 'public-ip';
import { Address4 } from 'ip-address';
import { isIpAllowed } from './lib/ip.js';
import { parseInputs } from './input.js';
import { BASTION_PLUGIN_NAME } from './constants.js';
import { compareFields, sleep } from './lib/util.js';

export async function run(): Promise<void> {
  try {
    const inputs = parseInputs({ debug });

    const provider = new SimpleAuthenticationDetailsProvider(
      inputs.oci.tenancy,
      inputs.oci.user,
      inputs.oci.fingerprint,
      inputs.oci.keyContent,
      null,
      inputs.oci.region
    );

    const bastionClient = new BastionClient({ authenticationDetailsProvider: provider });

    await allowCurrentIp(bastionClient, inputs.bastionId, publicIpv4, { info, debug });

    /**
     * Enable Bastion plugin for Managed SSH sessions
     * https://docs.oracle.com/en-us/iaas/Content/Bastion/Tasks/create-session-managed-ssh.htm
     */
    if (inputs.targetResourceDetails.sessionType === bastionModels.SessionType.ManagedSsh) {
      const computeClient = new ComputeClient({ authenticationDetailsProvider: provider });
      const pluginClient = new PluginClient({ authenticationDetailsProvider: provider });
      const instanceId = inputs.targetResourceDetails.targetResourceId;

      await enableBastionPlugin(computeClient, pluginClient, instanceId, {
        debug,
        info,
        warning
      });
    }

    /**
     * DNS Proxy needs to be enabled for Port Forwarding (when using FQDN)
     * and Dynamic Port Forwarding sessions (SOCKS5)
     */
    if (
      (inputs.targetResourceDetails.sessionType === bastionModels.SessionType.PortForwarding &&
        inputs.targetResourceDetails.targetResourceFqdn) ||
      inputs.targetResourceDetails.sessionType === bastionModels.SessionType.DynamicPortForwarding
    ) {
      const response = await bastionClient.getBastion({ bastionId: inputs.bastionId });

      if (!response.bastion) throw new Error(`Bastion not found: ${inputs.bastionId}`);

      if (response.bastion.dnsProxyStatus !== bastionModels.BastionDnsProxyStatus.Enabled) {
        warning('DNS Proxy is not enabled for the bastion');
      }
    }

    const sessionDisplayName = getDefaultSessionName(context);

    const session = await createSession(
      bastionClient,
      {
        bastionId: inputs.bastionId,
        displayName: sessionDisplayName,
        keyDetails: { publicKeyContent: inputs.publicKey },
        sessionTtlInSeconds: inputs.sessionTtlSeconds,
        targetResourceDetails: inputs.targetResourceDetails
      },
      { info }
    );

    setOutput('session-id', session.id);
    setOutput('ssh-command', session.sshMetadata?.command ?? '');
  } catch (error) {
    if (error instanceof Error) setFailed(error.message);
  }
}

export async function allowCurrentIp(
  client: BastionClient,
  bastionId: string,
  ipProvider: () => Promise<string>,
  logger: {
    info: (message: string) => void;
    debug: (message: string) => void;
  }
): Promise<void> {
  const [currentPublicIp, { bastion }] = await Promise.all([
    ipProvider(),
    client.getBastion({ bastionId })
  ]);

  if (!bastion) {
    throw new Error(`Bastion not found: ${bastionId}`);
  }
  const allowedList = bastion.clientCidrBlockAllowList ?? [];

  if (isIpAllowed(currentPublicIp, allowedList)) {
    logger.info(`Current IP ${currentPublicIp} is already allowed`);
    return;
  }

  logger.info(`Current IP ${currentPublicIp} is not allowed, adding to the list`);

  const currentIp = new Address4(currentPublicIp);
  const currentIpCidr = `${currentIp.address}/${currentIp.subnetMask}`;

  allowedList.push(currentIpCidr);
  logger.debug(`New allowed list: ${allowedList}`);

  await client.updateBastion({
    bastionId,
    updateBastionDetails: { clientCidrBlockAllowList: allowedList }
  });
}

export async function enableBastionPlugin(
  computeClient: ComputeClient,
  pluginClient: PluginClient,
  instanceId: string,
  logger: {
    debug: (message: string) => void;
    info: (message: string) => void;
    warning: (message: string) => void;
  }
): Promise<void> {
  const { instance } = await computeClient.getInstance({ instanceId });

  // Should throw if 'Bastion' plugin is not found, which is fine since it's an unrecoverable error
  const { instanceAgentPlugin } = await pluginClient.getInstanceAgentPlugin({
    compartmentId: instance.compartmentId,
    instanceagentId: instanceId,
    pluginName: BASTION_PLUGIN_NAME
  });

  if (
    instanceAgentPlugin.status === pluginModels.InstanceAgentPluginSummary.Status.NotSupported ||
    instanceAgentPlugin.status === pluginModels.InstanceAgentPluginSummary.Status.Invalid
  ) {
    throw new Error(`Bastion plugin not supported for instance ${instanceId}`);
  }

  const { agentConfig } = instance;

  if (!agentConfig)
    throw new Error(`Oracle Cloud Agent config not found for instance ${instanceId}`);

  if (!agentConfig.pluginsConfig)
    logger.warning(`Oracle Cloud Agent plugins config not found for instance ${instanceId}`);

  const bastionPluginConfig = agentConfig?.pluginsConfig?.find(
    ({ name }) => name === BASTION_PLUGIN_NAME
  );

  if (!bastionPluginConfig) {
    logger.warning(`Bastion plugin config not found for instance ${instanceId}`);
  }

  if (
    bastionPluginConfig?.desiredState ===
      computeModels.InstanceAgentPluginConfigDetails.DesiredState.Enabled ||
    instanceAgentPlugin.status === pluginModels.InstanceAgentPluginSummary.Status.Running
  ) {
    logger.info(`Bastion plugin already enabled for instance ${instanceId}`);
    return;
  }

  logger.debug(`Bastion plugin disabled for instance ${instanceId}, attempting to enable`);

  const pluginsConfig = agentConfig.pluginsConfig ?? [];

  await computeClient.updateInstance({
    instanceId,
    updateInstanceDetails: {
      agentConfig: {
        pluginsConfig: [
          ...pluginsConfig.filter(({ name }) => name !== BASTION_PLUGIN_NAME),
          {
            name: BASTION_PLUGIN_NAME,
            desiredState: computeModels.InstanceAgentPluginConfigDetails.DesiredState.Enabled
          }
        ]
      }
    }
  });

  logger.info('Bastion plugin enabled successfully');
}

function getDefaultSessionName(ctx: Context): string {
  return `gha-${ctx.runId}`;
}

export async function createSession(
  client: BastionClient,
  sessionDetails: bastionModels.CreateSessionDetails,
  logger: {
    info: (message: string) => void;
  }
): Promise<bastionModels.Session> {
  const session = await findExistingSession({ client, createSessionDetails: sessionDetails });

  if (session?.lifecycleState === bastionModels.SessionLifecycleState.Active) {
    logger.info('Active session already exists');

    const { session: activeSession } = await client.getSession({ sessionId: session.id });

    return activeSession;
  } else if (session?.lifecycleState === bastionModels.SessionLifecycleState.Creating) {
    logger.info(`Session is already being created: ${session.id}`);
    logger.info(`Waiting for session to become active...`);

    const activeSession = await waitForSession({
      client,
      sessionId: session.id,
      desiredState: bastionModels.SessionLifecycleState.Active
    });

    return activeSession;
  }

  logger.info(`Session not found, creating a new one`);

  const createSessionResponse = await client.createSession({
    createSessionDetails: sessionDetails
  });

  logger.info(`Session created: ${createSessionResponse.session.id}`);
  logger.info(`Waiting for session to become active...`);

  const activeSession = await waitForSession({
    client,
    sessionId: createSessionResponse.session.id,
    desiredState: bastionModels.SessionLifecycleState.Active
  });

  return activeSession;
}

export async function findExistingSession({
  client,
  createSessionDetails
}: {
  client: BastionClient;
  createSessionDetails: bastionModels.CreateSessionDetails;
}): Promise<bastionModels.SessionSummary | undefined> {
  const {
    bastionId,
    displayName,
    targetResourceDetails: { sessionType }
  } = createSessionDetails;

  const sessionsResponse = await client.listSessions({ bastionId, displayName, limit: 100 });

  const session = sessionsResponse.items.find(({ targetResourceDetails }) => {
    switch (sessionType) {
      case bastionModels.SessionType.ManagedSsh:
        return compareFields(targetResourceDetails, createSessionDetails.targetResourceDetails, [
          'sessionType',
          'targetResourceId',
          'targetResourceOperatingSystemUserName',
          'targetResourcePort'
        ]);
      case bastionModels.SessionType.PortForwarding:
        return compareFields(targetResourceDetails, createSessionDetails.targetResourceDetails, [
          'sessionType',
          'targetResourceId',
          'targetResourceFqdn',
          'targetResourcePrivateIpAddress',
          'targetResourcePort'
        ]);
      case bastionModels.SessionType.DynamicPortForwarding:
        return compareFields(targetResourceDetails, createSessionDetails.targetResourceDetails, [
          'sessionType'
        ]);
      default:
        return false;
    }
  });

  return session;
}

export async function waitForSession({
  client,
  sessionId,
  desiredState,
  pollingInterval = 2000,
  maxAttempts = 90
}: {
  client: BastionClient;
  sessionId: string;
  desiredState: bastionModels.SessionLifecycleState;
  pollingInterval?: number;
  maxAttempts?: number;
}): Promise<bastionModels.Session> {
  let attempts = 0;

  while (attempts < maxAttempts) {
    const { session } = await client.getSession({ sessionId });

    if (session.lifecycleState === desiredState) return session;

    await sleep(pollingInterval);

    attempts++;
  }

  const elapsedSeconds = (maxAttempts * pollingInterval) / 1000;

  throw new Error(
    `Session ${sessionId} did not reach desired state ${desiredState} after ${elapsedSeconds} seconds`
  );
}
