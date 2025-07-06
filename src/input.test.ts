import { describe, it, expect, mock, spyOn, beforeEach } from 'bun:test';
import { models as bastionModels } from 'oci-bastion';
import { ConfigFileReader, Region } from 'oci-common';
import * as fs from 'fs';
import { parse as parseYaml } from 'yaml';
import * as input from './input.js';

const RequiredInputs = ['bastion-id', 'public-key', 'session-type'];

const mockOciKeyContent = `-----BEGIN RSA PRIVATE KEY-----
MIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnzj4p4WGeKLs1Pt8Qu
KUpRKfFLfRYC9AIKjbJTWit+CqvjWYzvQwECAwEAAQJAIJLixBy2qpFoS4DSmoEm
o3qGy0t6z09AIJtH+5OeRV1be+N4cDYJKffGzDa88vQENZiRm0GRq6a+HPGQMd2k
TQIhAKMSvzIBnni7ot/OSie2TmJLY4SwTQAevXysE2RbFDYdAiEBCUEaRQnMnbp7
9mxDXDf6AU0cN/RPBjb9qSHDcWZHGzUCIG2Es59z8ugGrDY+pxLQnwfotadxd+Uy
v/Ow5T0q5gIJAiEAyS4RaI9YG8EWx/2w0T67ZUVAw8eOMB6BIUg0Xcu+3okCIBOs
/5OiPgoTdSy7bcF9IGpSE8ZgGKzgYQVZeN97YE00
-----END RSA PRIVATE KEY-----
`;

describe('input', () => {
  describe('parseCredentialsFromInput', () => {
    beforeEach(() => {
      clearEnvInputs('INPUT_');
    });

    it('should throw an error if required inputs are missing', () => {
      const mockInputs = {
        'oci-key-content': mockOciKeyContent,
        'oci-region': 'us-ashburn-1',
        'oci-user': 'foo',
        'oci-tenancy': 'foo',
        'oci-fingerprint': 'foo'
      };

      Object.keys(mockInputs).forEach(mockInput => {
        setEnvInputs('INPUT_', { ...mockInputs, [mockInput]: undefined });

        expect(() => input.parseCredentialsFromInput()).toThrow(
          `Input required and not supplied: ${mockInput}`
        );
      });
    });

    it('should throw an error if region is invalid', async () => {
      setEnvInputs('INPUT_', {
        'oci-key-content': mockOciKeyContent,
        'oci-region': 'us-foo',
        'oci-user': 'foo',
        'oci-tenancy': 'foo',
        'oci-fingerprint': 'foo'
      });

      expect(() => input.parseCredentialsFromInput()).toThrow('Invalid OCI region: us-foo');
    });

    it('should accept double-encoded newlines in key content', () => {
      setEnvInputs('INPUT_', {
        'oci-key-content': mockOciKeyContent.replace(/\n/g, '\\n'),
        'oci-region': 'us-ashburn-1',
        'oci-user': 'foo',
        'oci-tenancy': 'foo',
        'oci-fingerprint': 'foo'
      });

      const oci = input.parseCredentialsFromInput();

      expect(oci.keyContent).toBe(mockOciKeyContent.trim());
    });
  });

  describe('parseCredentialsFromEnv', () => {
    beforeEach(() => {
      clearEnvInputs('OCI_CLI_');
    });

    it('should throw an error if required environment variables are missing', () => {
      const mockEnv = {
        TENANCY: 'foo',
        USER: 'foo',
        FINGERPRINT: 'foo',
        KEY_CONTENT: mockOciKeyContent,
        REGION: 'us-ashburn-1'
      };

      Object.keys(mockEnv).forEach(key => {
        setEnvInputs('OCI_CLI_', { ...mockEnv, [key]: undefined });

        expect(() => input.parseCredentialsFromEnv()).toThrow(
          `${key} environment variable is required and not set`
        );
      });
    });

    it('should throw an error if region is invalid', async () => {
      setEnvInputs('OCI_CLI_', {
        TENANCY: 'foo',
        USER: 'foo',
        FINGERPRINT: 'foo',
        KEY_CONTENT: mockOciKeyContent,
        REGION: 'us-foo'
      });

      process.env.OCI_CLI_REGION = 'us-foo';

      expect(() => input.parseCredentialsFromEnv()).toThrow('Invalid OCI region: us-foo');
    });

    it('should accept double-encoded newlines in key content', () => {
      setEnvInputs('OCI_CLI_', {
        TENANCY: 'foo',
        USER: 'foo',
        FINGERPRINT: 'foo',
        KEY_CONTENT: mockOciKeyContent.replace(/\n/g, '\\n'),
        REGION: 'us-ashburn-1'
      });

      process.env.OCI_CLI_KEY_CONTENT = mockOciKeyContent.replace(/\n/g, '\\n');

      const oci = input.parseCredentialsFromEnv();

      expect(oci.keyContent).toBe(mockOciKeyContent.trim());
    });
  });

  describe('parseCredentialsFromFile', () => {
    it('should throw an error if required variables are missing from config file', () => {
      ['user', 'tenancy', 'fingerprint', 'key_file'].forEach(key => {
        const configFileReaderMock = spyOn(ConfigFileReader, 'parseDefault').mockImplementationOnce(
          // @ts-ignore
          () => {
            return {
              get: name => {
                if (name === key) {
                  return null;
                }

                if (name === 'region') {
                  return 'us-ashburn-1';
                }

                return 'foo';
              }
            };
          }
        );

        expect(() => input.parseCredentialsFromFile()).toThrow(
          `${key} is required in OCI config file`
        );

        configFileReaderMock.mockRestore();
      });
    });

    it('should throw an error if region is invalid', () => {
      const configFileReaderMock = spyOn(ConfigFileReader, 'parseDefault').mockImplementationOnce(
        // @ts-ignore
        () => {
          return {
            get: name => {
              if (name === 'region') {
                return 'us-foo';
              }

              return 'foo';
            }
          };
        }
      );

      expect(() => input.parseCredentialsFromFile()).toThrow('Invalid OCI region: us-foo');

      configFileReaderMock.mockRestore();
    });

    it('should throw an error if key file is not found', () => {
      const configFileReaderMock = spyOn(ConfigFileReader, 'parseDefault').mockImplementation(
        // @ts-ignore
        () => {
          return {
            get: name => {
              if (name === 'region') {
                return 'us-ashburn-1';
              }

              return 'foo';
            }
          };
        }
      );

      const readFileSyncMock = spyOn(fs, 'readFileSync').mockImplementationOnce(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      expect(() => input.parseCredentialsFromFile()).toThrow('key_file does not exist or is empty');

      // @ts-ignore
      readFileSyncMock.mockImplementationOnce(() => '');

      expect(() => input.parseCredentialsFromFile()).toThrow('key_file does not exist or is empty');

      configFileReaderMock.mockRestore();
      readFileSyncMock.mockRestore();
    });

    it('should return credentials from config file', () => {
      const configFileReaderMock = spyOn(ConfigFileReader, 'parseDefault').mockImplementationOnce(
        // @ts-ignore
        () => {
          return {
            get: name => {
              if (name === 'region') {
                return 'us-ashburn-1';
              }

              return 'foo';
            }
          };
        }
      );

      // @ts-ignore
      const readFileSyncMock = spyOn(fs, 'readFileSync').mockImplementationOnce(() => {
        return mockOciKeyContent;
      });

      const oci = input.parseCredentialsFromFile();

      expect(oci).toEqual({
        user: 'foo',
        tenancy: 'foo',
        fingerprint: 'foo',
        keyContent: mockOciKeyContent.trim(),
        region: Region.US_ASHBURN_1
      });

      configFileReaderMock.mockRestore();
      readFileSyncMock.mockRestore();
    });
  });

  describe('parseCredentials', () => {
    const debug = mock();
    const parseCredentialsFromInputMock = spyOn(input, 'parseCredentialsFromInput');
    const parseCredentialsFromEnvMock = spyOn(input, 'parseCredentialsFromEnv');
    const parseCredentialsFromFileMock = spyOn(input, 'parseCredentialsFromFile');

    beforeEach(() => {
      debug.mockClear();
      parseCredentialsFromInputMock.mockClear();
      parseCredentialsFromEnvMock.mockClear();
      parseCredentialsFromFileMock.mockClear();
    });

    it('should return credentials from input', () => {
      parseCredentialsFromInputMock.mockImplementationOnce(() => {
        return {
          tenancy: 'foo',
          user: 'foo',
          fingerprint: 'foo',
          keyContent: mockOciKeyContent,
          region: Region.US_ASHBURN_1
        };
      });

      const oci = input.parseCredentials({ debug });

      expect(oci).toEqual({
        tenancy: 'foo',
        user: 'foo',
        fingerprint: 'foo',
        keyContent: mockOciKeyContent,
        region: Region.US_ASHBURN_1
      });
      expect(parseCredentialsFromInputMock).toHaveBeenCalledTimes(1);
      expect(parseCredentialsFromEnvMock).not.toHaveBeenCalled();
      expect(parseCredentialsFromFileMock).not.toHaveBeenCalled();
    });

    it('should return credentials from environment variables', () => {
      parseCredentialsFromInputMock.mockImplementationOnce(() => {
        throw new Error('Failed to parse OCI credentials from action inputs');
      });
      parseCredentialsFromEnvMock.mockImplementationOnce(() => {
        return {
          tenancy: 'foo',
          user: 'foo',
          fingerprint: 'foo',
          keyContent: mockOciKeyContent,
          region: Region.US_ASHBURN_1
        };
      });

      const oci = input.parseCredentials({ debug });

      expect(oci).toEqual({
        tenancy: 'foo',
        user: 'foo',
        fingerprint: 'foo',
        keyContent: mockOciKeyContent,
        region: Region.US_ASHBURN_1
      });
      expect(parseCredentialsFromInputMock).toHaveBeenCalledTimes(1);
      expect(parseCredentialsFromEnvMock).toHaveBeenCalledTimes(1);
      expect(parseCredentialsFromFileMock).not.toHaveBeenCalled();
    });

    it('should return credentials from OCI config file', () => {
      parseCredentialsFromInputMock.mockImplementationOnce(() => {
        throw new Error('Failed to parse OCI credentials from action inputs');
      });
      parseCredentialsFromEnvMock.mockImplementationOnce(() => {
        throw new Error('Failed to parse OCI credentials from environment variables');
      });
      parseCredentialsFromFileMock.mockImplementationOnce(() => {
        return {
          tenancy: 'foo',
          user: 'foo',
          fingerprint: 'foo',
          keyContent: mockOciKeyContent,
          region: Region.US_ASHBURN_1
        };
      });

      const oci = input.parseCredentials({ debug });

      expect(oci).toEqual({
        tenancy: 'foo',
        user: 'foo',
        fingerprint: 'foo',
        keyContent: mockOciKeyContent,
        region: Region.US_ASHBURN_1
      });
      expect(parseCredentialsFromInputMock).toHaveBeenCalledTimes(1);
      expect(parseCredentialsFromEnvMock).toHaveBeenCalledTimes(1);
      expect(parseCredentialsFromFileMock).toHaveBeenCalledTimes(1);
    });

    it('should throw an error if all methods fail', () => {
      parseCredentialsFromInputMock.mockImplementationOnce(() => {
        throw new Error('Failed to parse OCI credentials from action inputs');
      });
      parseCredentialsFromEnvMock.mockImplementationOnce(() => {
        throw new Error('Failed to parse OCI credentials from environment variables');
      });
      parseCredentialsFromFileMock.mockImplementationOnce(() => {
        throw new Error('Failed to parse OCI credentials from OCI config file');
      });

      expect(() => input.parseCredentials({ debug })).toThrow(
        'Failed to parse OCI credentials. Please provide them via action inputs, environment variables or OCI config file.'
      );
    });
  });

  describe('parseInputs', () => {
    const debug = mock();

    beforeEach(() => {
      clearEnvInputs('INPUT_');
    });

    it('should match required inputs in action metadata file', () => {
      const actionMetadata = parseYaml(fs.readFileSync('./action.yml', 'utf8'));

      const inputs = Object.entries(actionMetadata.inputs)
        .filter(
          ([_, value]) =>
            typeof value === 'object' && value !== null && 'required' in value && value.required
        )
        .map(([key]) => key);

      expect(inputs.sort()).toEqual(RequiredInputs.sort());
    });

    it('should throw an error if required inputs are missing', () => {
      const mockInputs = {
        'bastion-id': 'ocid1.bastion.oc1.iad.aaaaaaaa',
        'public-key': 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQDZz7',
        'session-type': 'DYNAMIC_PORT_FORWARDING'
      };

      RequiredInputs.forEach(requiredInput => {
        setEnvInputs('INPUT_', { ...mockInputs, [requiredInput]: undefined });

        expect(() => input.parseInputs({ debug })).toThrow(
          `Input required and not supplied: ${requiredInput}`
        );
      });
    });

    it('should throw an error if session type is invalid', () => {
      setEnvInputs('INPUT_', {
        'oci-key-content': mockOciKeyContent,
        'oci-region': 'us-ashburn-1',
        'oci-user': 'foo',
        'oci-tenancy': 'foo',
        'oci-fingerprint': 'foo',
        'bastion-id': 'ocid1.bastion.oc1.iad.aaaaaaaa',
        'public-key': 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQDZz7',
        'session-type': 'foo'
      });

      expect(() => input.parseInputs({ debug })).toThrow('Invalid session type: foo');
    });

    it('should require target resource ID for managed SSH session', () => {
      setEnvInputs('INPUT_', {
        'oci-key-content': mockOciKeyContent,
        'oci-region': 'us-ashburn-1',
        'oci-user': 'foo',
        'oci-tenancy': 'foo',
        'oci-fingerprint': 'foo',
        'bastion-id': 'ocid1.bastion.oc1.iad.aaaaaaaa',
        'public-key': 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQDZz7',
        'session-type': 'MANAGED_SSH'
      });

      expect(() => input.parseInputs({ debug })).toThrow(
        'target-resource-id is required for managed SSH session'
      );
    });

    it('should require target resource user for managed SSH session', () => {
      setEnvInputs('INPUT_', {
        'oci-key-content': mockOciKeyContent,
        'oci-region': 'us-ashburn-1',
        'oci-user': 'foo',
        'oci-tenancy': 'foo',
        'oci-fingerprint': 'foo',
        'bastion-id': 'ocid1.bastion.oc1.iad.aaaaaaaa',
        'public-key': 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQDZz7',
        'session-type': 'MANAGED_SSH',
        'target-resource-id': 'ocid1.instance.oc1.iad.aaaaaaaa'
      });

      expect(() => input.parseInputs({ debug })).toThrow(
        'target-resource-user is required for managed SSH session'
      );
    });

    it('should throw an error if target resource port is invalid', () => {
      setEnvInputs('INPUT_', {
        'oci-key-content': mockOciKeyContent,
        'oci-region': 'us-ashburn-1',
        'oci-user': 'foo',
        'oci-tenancy': 'foo',
        'oci-fingerprint': 'foo',
        'bastion-id': 'ocid1.bastion.oc1.iad.aaaaaaaa',
        'public-key': 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQDZz7',
        'session-type': 'MANAGED_SSH',
        'target-resource-id': 'ocid1.instance.oc1.iad.aaaaaaaa',
        'target-resource-user': 'foo',
        'target-resource-port': 'bar'
      });

      expect(() => input.parseInputs({ debug })).toThrow(
        'target-resource-port must be a positive integer if specified'
      );

      setEnvInputs('INPUT_', {
        'oci-key-content': mockOciKeyContent,
        'oci-region': 'us-ashburn-1',
        'oci-user': 'foo',
        'oci-tenancy': 'foo',
        'oci-fingerprint': 'foo',
        'bastion-id': 'ocid1.bastion.oc1.iad.aaaaaaaa',
        'public-key': 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQDZz7',
        'session-type': 'PORT_FORWARDING',
        'target-resource-port': 'foo'
      });

      expect(() => input.parseInputs({ debug })).toThrow(
        'target-resource-port must be a positive integer if specified'
      );
    });

    it('should return target resource details for managed SSH session', () => {
      setEnvInputs('INPUT_', {
        'oci-key-content': mockOciKeyContent,
        'oci-region': 'us-ashburn-1',
        'oci-user': 'foo',
        'oci-tenancy': 'foo',
        'oci-fingerprint': 'foo',
        'bastion-id': 'ocid1.bastion.oc1.iad.aaaaaaaa',
        'public-key': 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQDZz7',
        'session-type': 'MANAGED_SSH',
        'target-resource-id': 'ocid1.instance.oc1.iad.aaaaaaaa',
        'target-resource-user': 'foo'
      });

      const inputs = input.parseInputs({ debug });

      expect(inputs.targetResourceDetails).toEqual({
        sessionType: bastionModels.SessionType.ManagedSsh,
        targetResourceId: 'ocid1.instance.oc1.iad.aaaaaaaa',
        targetResourceOperatingSystemUserName: 'foo'
      });
    });

    it('should return target resource details for port forwarding session', () => {
      setEnvInputs('INPUT_', {
        'oci-key-content': mockOciKeyContent,
        'oci-region': 'us-ashburn-1',
        'oci-user': 'foo',
        'oci-tenancy': 'foo',
        'oci-fingerprint': 'foo',
        'bastion-id': 'ocid1.bastion.oc1.iad.aaaaaaaa',
        'public-key': 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQDZz7',
        'session-type': 'PORT_FORWARDING',
        'target-resource-fqdn': 'example.com'
      });

      const inputs = input.parseInputs({ debug });

      expect(inputs.targetResourceDetails).toEqual({
        sessionType: bastionModels.SessionType.PortForwarding,
        targetResourceFqdn: 'example.com'
      });
    });

    it('should return target resource details for dynamic port forwarding session', () => {
      setEnvInputs('INPUT_', {
        'oci-key-content': mockOciKeyContent,
        'oci-region': 'us-ashburn-1',
        'oci-user': 'foo',
        'oci-tenancy': 'foo',
        'oci-fingerprint': 'foo',
        'bastion-id': 'ocid1.bastion.oc1.iad.aaaaaaaa',
        'public-key': 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQDZz7',
        'session-type': 'DYNAMIC_PORT_FORWARDING'
      });

      const inputs = input.parseInputs({ debug });

      expect(inputs.targetResourceDetails).toEqual({
        sessionType: bastionModels.SessionType.DynamicPortForwarding
      });
    });
  });
});

function setEnvInputs(prefix: string, inputs: Record<string, string | undefined>) {
  Object.entries(inputs).forEach(([key, value]) => {
    const envKey = `${prefix}${key.replace(/ /g, '_').toUpperCase()}`;

    process.env[envKey] = value;
  });
}

function clearEnvInputs(prefix: string) {
  Object.keys(process.env)
    .filter(key => key.startsWith(prefix))
    .forEach(key => {
      delete process.env[key];
    });
}
