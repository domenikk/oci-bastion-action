import { Address4 } from 'ip-address';

/**
 * Check if the provided IP address is in the allowed list.
 * @param ip IP address to check.
 * @param allowedList List of allowed IP addresses (possibly in CIDR notation).
 * @param ignoreInvalid If false, an error will be thrown if an invalid IP address is found in the allowed list. Default is true.
 */
export function isIpAllowed(
  ip: string,
  allowedList: string[],
  { ignoreInvalid = true }: { ignoreInvalid?: boolean } = {}
) {
  const ipToCheck = new Address4(ip);

  for (const allowedIpStr of allowedList) {
    if (!ignoreInvalid && !Address4.isValid(allowedIpStr)) {
      throw new Error(`Invalid IP address in allowed list: ${allowedIpStr}`);
    }

    const allowedIp = new Address4(allowedIpStr);

    if (ipToCheck.isInSubnet(allowedIp)) {
      return true;
    }
  }

  return false;
}
