import { getState, info, setFailed } from '@actions/core';
import { Address4 } from 'ip-address';
import { BastionClient } from 'oci-bastion';
import { Region, SimpleAuthenticationDetailsProvider } from 'oci-common';

export async function run(): Promise<void> {
  try {
    const tenancy = getState('inputs.oci.tenancy');
    const user = getState('inputs.oci.user');
    const fingerprint = getState('inputs.oci.fingerprint');
    const keyContent = getState('inputs.oci.keyContent');
    const region = Region.fromRegionId(getState('inputs.oci.regionId'));
    const bastionId = getState('inputs.bastionId');
    const currentPublicIp = getState('currentPublicIp');

    const provider = new SimpleAuthenticationDetailsProvider(
      tenancy,
      user,
      fingerprint,
      keyContent,
      null,
      region
    );

    const bastionClient = new BastionClient({ authenticationDetailsProvider: provider });

    await removeCurrentIp(bastionClient, bastionId, currentPublicIp, { info });
  } catch (error) {
    if (error instanceof Error) setFailed(error.message);
  }
}

export async function removeCurrentIp(
  client: BastionClient,
  bastionId: string,
  currentPublicIp: string,
  logger: {
    info: (message: string) => void;
  }
): Promise<void> {
  const { bastion } = await client.getBastion({ bastionId });

  if (!bastion) {
    throw new Error(`Bastion not found: ${bastionId}`);
  }
  const allowedList = bastion.clientCidrBlockAllowList ?? [];

  const currentIp = new Address4(currentPublicIp);
  const currentIpCidr = `${currentIp.address}/${currentIp.subnetMask}`;

  const updatedAllowList = allowedList.filter(ip => ip !== currentIpCidr);

  if (updatedAllowList.length === allowedList.length) {
    logger.info(`Current IP ${currentPublicIp} was already removed`);
    return;
  }

  logger.info(`Removing current IP ${currentPublicIp} from the list`);

  await client.updateBastion({
    bastionId,
    updateBastionDetails: { clientCidrBlockAllowList: updatedAllowList }
  });
}
