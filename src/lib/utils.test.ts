import { describe, it, expect, mock } from 'bun:test';
import { isPositiveInt, sleep, compareFields, waitForState } from './util.js';

describe('util', () => {
  describe('isPositiveInt', () => {
    it('should return true for positive integers', () => {
      expect(isPositiveInt(1)).toBe(true);
      expect(isPositiveInt(2)).toBe(true);
      expect(isPositiveInt(3)).toBe(true);
    });

    it('should return false for negative integers', () => {
      expect(isPositiveInt(-1)).toBe(false);
      expect(isPositiveInt(-2)).toBe(false);
      expect(isPositiveInt(-3)).toBe(false);
    });

    it('should return false for zero', () => {
      expect(isPositiveInt(0)).toBe(false);
    });

    it('should return false for non-integers', () => {
      expect(isPositiveInt(0.1)).toBe(false);
      expect(isPositiveInt('1')).toBe(false);
      expect(isPositiveInt('1.1')).toBe(false);
      expect(isPositiveInt('a')).toBe(false);
      expect(isPositiveInt(true)).toBe(false);
      expect(isPositiveInt(false)).toBe(false);
      expect(isPositiveInt(null)).toBe(false);
      expect(isPositiveInt(undefined)).toBe(false);
      expect(isPositiveInt({})).toBe(false);
      expect(isPositiveInt([])).toBe(false);
    });
  });

  describe('sleep', () => {
    it('should resolve after the specified time', async () => {
      const start = Date.now();
      await sleep(100);
      const end = Date.now();

      expect(end - start).toBeWithin(95, 105);
    });
  });

  describe('compareFields', () => {
    it('should return true when all compared fields are equal', () => {
      const a = { a: 1, b: 2, c: 3, d: 4 };
      const b = { a: 1, b: 2, c: 3 };

      expect(compareFields(a, b, ['a', 'b', 'c'])).toBe(true);
      expect(compareFields(b, a, ['a', 'b', 'c'])).toBe(true);
    });

    it('should return false when any field is not equal', () => {
      const a = { a: 1, b: 2, c: 3 };
      const b = { a: 1, b: 2, c: 4 };

      expect(compareFields(a, b, ['a', 'b', 'c'])).toBe(false);
      expect(compareFields(b, a, ['a', 'b', 'c'])).toBe(false);
    });

    it('should return true when all compared fields are missing', () => {
      const a = { d: 4 };
      const b = { e: 5 };

      expect(compareFields(a, b, ['a', 'b', 'c'])).toBe(true);
      expect(compareFields(b, a, ['a', 'b', 'c'])).toBe(true);
    });

    it('should return true when field is missing in one object and undefined in the other', () => {
      const a = { a: 1, b: 2 };
      const b = { a: 1, b: 2, c: undefined };

      expect(compareFields(a, b, ['a', 'b', 'c'])).toBe(true);
      expect(compareFields(b, a, ['a', 'b', 'c'])).toBe(true);
    });
  });

  describe('waitForState', () => {
    it('should throw an error if checkFn throws', async () => {
      const checkFn = mock().mockRejectedValue(new Error('Session not found'));

      expect(
        waitForState({
          checkFn,
          pollingInterval: 1,
          maxAttempts: 1
        })
      ).rejects.toThrow('Session not found');
    });

    it('should return immediately if resource is already in the desired state', async () => {
      const checkFn = mock().mockResolvedValue(true);

      expect(
        waitForState({
          checkFn,
          pollingInterval: 1,
          maxAttempts: 1
        })
      ).resolves.toBeUndefined();
    });

    it('should throw an error if resource does not reach the desired state', async () => {
      const checkFn = mock();

      for (let i = 0; i < 5; i++) {
        checkFn.mockResolvedValueOnce(false);
      }

      const expectedElapsedTime = 4 / 1000;

      expect(
        waitForState({
          checkFn,
          pollingInterval: 1,
          maxAttempts: 4,
          errorMsg: 'Session sessionId did not reach desired state Active'
        })
      ).rejects.toThrow(
        `Session sessionId did not reach desired state Active after ${expectedElapsedTime} seconds`
      );
    });

    it('should return when it reaches the desired state within max attempts', async () => {
      const checkFn = mock();
      // return 'false' for the first 5 calls, then 'true'
      for (let i = 0; i < 5; i++) {
        checkFn.mockResolvedValueOnce(false);
      }
      checkFn.mockResolvedValueOnce(true);

      expect(
        waitForState({
          checkFn,
          pollingInterval: 1,
          maxAttempts: 10
        })
      ).resolves.toBeUndefined();
    });
  });
});
