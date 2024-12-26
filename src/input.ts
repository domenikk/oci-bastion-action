import { getInput } from '@actions/core';
import { ConfigFileReader, Region } from 'oci-common';
import { models } from 'oci-bastion';
import { readFileSync } from 'fs';
import { isPositiveInt, tryFn } from './lib/util.js';
import { DEFAULT_SESSION_TTL_SECONDS } from './constants.js';

type TargetResourceDetails =
  | (models.CreateManagedSshSessionTargetResourceDetails & {
      sessionType: models.SessionType.ManagedSsh;
    })
  | (models.CreateDynamicPortForwardingSessionTargetResourceDetails & {
      sessionType: models.SessionType.DynamicPortForwarding;
    })
  | (models.CreatePortForwardingSessionTargetResourceDetails & {
      sessionType: models.SessionType.PortForwarding;
    });

type Inputs = {
  oci: {
    user: string;
    tenancy: string;
    fingerprint: string;
    keyContent: string;
    region: Region;
  };
  bastionId: string;
  publicKey: string;
  sessionTtlSeconds: number;
  targetResourceDetails: TargetResourceDetails;
  autoEnableBastionPlugin: boolean;
};

export function parseInputs({ debug }: { debug: (message: string) => void }): Inputs {
  const oci = parseCredentials({ debug });

  const sessionTtl = getInput('session-ttl-seconds') || `${DEFAULT_SESSION_TTL_SECONDS}`;
  if (!isPositiveInt(Number(sessionTtl))) {
    throw new Error('session-ttl-seconds must be a positive integer if specified');
  }

  const targetResourceDetails = parseSessionTargetResourceDetails({
    sessionType: getInput('session-type', { required: true }),
    targetResourceId: getInput('target-resource-id') || undefined,
    targetResourceFqdn: getInput('target-resource-fqdn') || undefined,
    targetResourcePrivateIpAddress: getInput('target-resource-private-ip') || undefined,
    targetResourcePort: getInput('target-resource-port') || undefined,
    targetResourceOperatingSystemUserName: getInput('target-resource-user') || undefined
  });

  return {
    oci,
    bastionId: getInput('bastion-id', { required: true }),
    publicKey: getInput('public-key', { required: true }),
    sessionTtlSeconds: Number(sessionTtl),
    targetResourceDetails,
    autoEnableBastionPlugin: getInput('auto-enable-bastion-plugin') === 'true'
  };
}

export function parseCredentials(logger: { debug: (message: string) => void }): Inputs['oci'] {
  const fromInput = tryFn(parseCredentialsFromInput);
  if (!(fromInput instanceof Error)) {
    return fromInput;
  }

  logger.debug('Failed to parse OCI credentials from action inputs');
  logger.debug(fromInput.toString());

  const fromEnv = tryFn(parseCredentialsFromEnv);
  if (!(fromEnv instanceof Error)) {
    return fromEnv;
  }

  logger.debug('Failed to parse OCI credentials from environment variables');
  logger.debug(fromEnv.toString());

  const fromFile = tryFn(parseCredentialsFromFile);
  if (!(fromFile instanceof Error)) {
    return fromFile;
  }

  logger.debug('Failed to parse OCI credentials from OCI config file');
  logger.debug(fromFile.toString());

  throw new Error(
    'Failed to parse OCI credentials. Please provide them via action inputs, environment variables or OCI config file.'
  );
}

export function parseCredentialsFromInput(): Inputs['oci'] {
  const keyContentInput = getInput('oci-key-content', {
    required: true
  });
  const keyContent = keyContentInput.replace(/\\n/g, '\n').trim();

  const regionInput = getInput('oci-region', { required: true });
  const region = validateRegion(regionInput);

  return {
    user: getInput('oci-user', { required: true }),
    tenancy: getInput('oci-tenancy', { required: true }),
    fingerprint: getInput('oci-fingerprint', { required: true }),
    keyContent,
    region
  };
}

export function parseCredentialsFromEnv(): Inputs['oci'] {
  const {
    OCI_CLI_TENANCY,
    OCI_CLI_USER,
    OCI_CLI_FINGERPRINT,
    OCI_CLI_KEY_CONTENT,
    OCI_CLI_REGION
  } = process.env;

  if (!OCI_CLI_TENANCY)
    throw new Error('OCI_CLI_TENANCY environment variable is required and not set');
  if (!OCI_CLI_USER) throw new Error('OCI_CLI_USER environment variable is required and not set');
  if (!OCI_CLI_FINGERPRINT)
    throw new Error('OCI_CLI_FINGERPRINT environment variable is required and not set');
  if (!OCI_CLI_KEY_CONTENT)
    throw new Error('OCI_CLI_KEY_CONTENT environment variable is required and not set');
  if (!OCI_CLI_REGION)
    throw new Error('OCI_CLI_REGION environment variable is required and not set');

  const keyContent = OCI_CLI_KEY_CONTENT.replace(/\\n/g, '\n').trim();
  const region = validateRegion(OCI_CLI_REGION);

  return {
    user: OCI_CLI_USER,
    tenancy: OCI_CLI_TENANCY,
    fingerprint: OCI_CLI_FINGERPRINT,
    keyContent,
    region
  };
}

export function parseCredentialsFromFile(): Inputs['oci'] {
  const configFile = ConfigFileReader.parseDefault(null);

  const user = configFile.get('user');
  const tenancy = configFile.get('tenancy');
  const fingerprint = configFile.get('fingerprint');
  const keyFilePath = configFile.get('key_file');
  const region = validateRegion(configFile.get('region') || '');

  if (!user) throw new Error('user is required in OCI config file');
  if (!tenancy) throw new Error('tenancy is required in OCI config file');
  if (!fingerprint) throw new Error('fingerprint is required in OCI config file');
  if (!keyFilePath) throw new Error('key_file is required in OCI config file');

  const fileResult = tryFn(() => readFileSync(keyFilePath, 'utf8'));
  const keyContent = typeof fileResult === 'string' ? fileResult.replace(/\\n/g, '\n').trim() : '';
  if (!keyContent) throw new Error('key_file does not exist or is empty');

  return {
    user,
    tenancy,
    fingerprint,
    keyContent,
    region
  };
}

function validateRegion(regionId: string): Region {
  const region = Region.fromRegionId(regionId);

  if (!region) {
    throw new Error(`Invalid OCI region: ${regionId}`);
  }

  return region;
}

function parseSessionTargetResourceDetails({
  sessionType,
  targetResourceId,
  targetResourceFqdn,
  targetResourcePrivateIpAddress,
  targetResourcePort,
  targetResourceOperatingSystemUserName
}: {
  sessionType: string;
  targetResourceId?: string;
  targetResourceFqdn?: string;
  targetResourcePrivateIpAddress?: string;
  targetResourcePort?: string;
  targetResourceOperatingSystemUserName?: string;
}): TargetResourceDetails {
  switch (sessionType) {
    case models.SessionType.ManagedSsh:
      if (!targetResourceId) {
        throw new Error('target-resource-id is required for managed SSH session');
      }
      if (!targetResourceOperatingSystemUserName) {
        throw new Error('target-resource-user is required for managed SSH session');
      }
      if (targetResourcePort !== undefined && !isPositiveInt(Number(targetResourcePort))) {
        throw new Error('target-resource-port must be a positive integer if specified');
      }

      return {
        sessionType,
        targetResourceId,
        targetResourceOperatingSystemUserName,
        targetResourcePrivateIpAddress,
        targetResourcePort: targetResourcePort ? Number(targetResourcePort) : undefined
      };
    case models.SessionType.PortForwarding:
      if (targetResourcePort !== undefined && !isPositiveInt(Number(targetResourcePort))) {
        throw new Error('target-resource-port must be a positive integer if specified');
      }

      return {
        sessionType,
        targetResourceId,
        targetResourceFqdn,
        targetResourcePrivateIpAddress,
        targetResourcePort: targetResourcePort ? Number(targetResourcePort) : undefined
      };
    case models.SessionType.DynamicPortForwarding:
      return { sessionType };
    default:
      throw new Error(`Invalid session type: ${sessionType}`);
  }
}
