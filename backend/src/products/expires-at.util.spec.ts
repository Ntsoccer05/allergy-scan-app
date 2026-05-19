import { getExpiryDays } from './expires-at.util';

describe('getExpiryDays', () => {
  it.each([
    { scanCount: 1, expected: 30 },
    { scanCount: 5, expected: 30 },
    { scanCount: 6, expected: 90 },
    { scanCount: 20, expected: 90 },
    { scanCount: 21, expected: 180 },
    { scanCount: 100, expected: 180 },
  ])('scanCount=$scanCount → $expected 日', ({ scanCount, expected }) => {
    expect(getExpiryDays(scanCount)).toBe(expected);
  });
});
