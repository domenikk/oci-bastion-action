import { describe, it, expect } from 'bun:test';
import { isPositiveInt, sleep, compareFields } from './util.js';

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

      expect(end - start).toBeGreaterThanOrEqual(100);
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
});
