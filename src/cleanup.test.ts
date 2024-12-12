import { describe, it, expect, mock, afterEach, spyOn } from 'bun:test';
import * as cleanup from './cleanup.js';

mock.module('oci-bastion', () => {
  return {
    BastionClient: mock(() => {
      return {
        getBastion: mock(),
        updateBastion: mock()
      };
    })
  };
});

describe('cleanup', () => {
  describe('removeCurrentIp', () => {
    const publicIp = '192.168.1.10';
    const logger = { info: mock(), debug: mock() };

    afterEach(() => {
      logger.info.mockClear();
      logger.debug.mockClear();
    });

    it('should throw an error if bastion is not found', async () => {
      const { BastionClient } = await import('oci-bastion');
      // @ts-ignore
      const client = new BastionClient();
      // @ts-ignore
      client.getBastion.mockResolvedValue({ bastion: null });

      await expect(cleanup.removeCurrentIp(client, 'bastion-id', publicIp, logger)).rejects.toThrow(
        'Bastion not found: bastion-id'
      );
    });

    it('should take no action if the IP is not in the allow list', async () => {
      const { BastionClient } = await import('oci-bastion');
      // @ts-ignore
      const client = new BastionClient();
      // @ts-ignore
      client.getBastion.mockResolvedValue({
        bastion: { clientCidrBlockAllowList: ['10.0.0.1/32'] }
      });

      await cleanup.removeCurrentIp(client, 'bastion-id', publicIp, logger);

      expect(logger.info).toHaveBeenCalledWith(`Current IP ${publicIp} was already removed`);
      expect(client.updateBastion).not.toHaveBeenCalled();
    });

    it('should remove the IP from the allow list', async () => {
      const { BastionClient } = await import('oci-bastion');
      // @ts-ignore
      const client = new BastionClient();
      // @ts-ignore
      client.getBastion.mockResolvedValue({
        bastion: { clientCidrBlockAllowList: [`${publicIp}/32`] }
      });

      await cleanup.removeCurrentIp(client, 'bastion-id', publicIp, logger);

      expect(logger.info).toHaveBeenCalledWith(`Removing current IP ${publicIp} from the list`);
      expect(client.updateBastion).toHaveBeenCalledWith({
        bastionId: 'bastion-id',
        updateBastionDetails: { clientCidrBlockAllowList: [] }
      });
    });
  });

  describe('run', async () => {
    mock.module('@actions/core', () => {
      return {
        getState: mock(() => 'value'),
        setFailed: mock()
      };
    });
    const { getState, setFailed } = await import('@actions/core');

    it('should fail when removeCurrentIp throws an error', async () => {
      const removeCurrentIpMock = spyOn(cleanup, 'removeCurrentIp').mockImplementationOnce(() => {
        throw new Error('Test error');
      });

      await cleanup.run();

      expect(getState).toHaveBeenCalled();
      expect(removeCurrentIpMock).toHaveBeenCalled();
      expect(setFailed).toHaveBeenCalledWith('Test error');
    });

    it('should succeed when removeCurrentIp succeeds', async () => {
      const removeCurrentIpMock = spyOn(cleanup, 'removeCurrentIp').mockImplementationOnce(() => {
        return Promise.resolve();
      });

      await cleanup.run();

      expect(getState).toHaveBeenCalled();
      expect(removeCurrentIpMock).toHaveBeenCalled();
      expect(setFailed).not.toHaveBeenCalled;
    });
  });
});
