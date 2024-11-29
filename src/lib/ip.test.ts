import { describe, it, expect } from 'bun:test';
import { isIpAllowed } from './ip.js';

describe('ip', () => {
  describe('isIpAllowed', () => {
    it('should throw an error when an invalid IP address is found in the allowed list', () => {
      const ip = '224.11.162.75';
      const allowedList = ['invalid'];

      expect(() => isIpAllowed(ip, allowedList, { ignoreInvalid: false })).toThrow(
        'Invalid IP address in allowed list: invalid'
      );
    });

    it('should return true when IP is in the allowed list', () => {
      const ip = '224.11.162.75';
      const allowedList = ['10.0.0.1', '224.11.162.75'];

      const result = isIpAllowed(ip, allowedList);

      expect(result).toBe(true);
    });

    it('should return true when IP is in the allowed list (CIDR notation)', () => {
      const ip = '224.11.162.75';

      const allowedList = ['224.11.162.0/24'];

      const result = isIpAllowed(ip, allowedList);

      expect(result).toBe(true);
    });

    it('should return false when IP is not in the allowed list', () => {
      const ip = '224.11.162.75';
      const allowedList = ['224.11.162.0/26', '224.11.162.74'];

      const result = isIpAllowed(ip, allowedList);

      expect(result).toBe(false);
    });
  });
});
