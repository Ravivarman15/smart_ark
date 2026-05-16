import { describe, it, expect } from 'vitest';
import { normalisePhone } from './aisensyApi';

describe('normalisePhone', () => {
  it('adds 91 to a 10-digit number and prepends +', () => {
    expect(normalisePhone('1234567890')).toBe('+911234567890');
  });

  it('replaces leading 0 with 91 for an 11-digit number and prepends +', () => {
    expect(normalisePhone('01234567890')).toBe('+911234567890');
  });

  it('leaves already prefixed number as is and prepends +', () => {
    expect(normalisePhone('911234567890')).toBe('+911234567890');
  });

  it('handles number with spaces or other non-numeric characters', () => {
    expect(normalisePhone('+91 123 456 7890')).toBe('+911234567890');
    expect(normalisePhone('(123) 456-7890')).toBe('+911234567890');
  });

  it('handles + prefix correctly', () => {
    expect(normalisePhone('+911234567890')).toBe('+911234567890');
  });
});
