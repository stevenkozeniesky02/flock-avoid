import { describe, it, expect } from 'vitest';
import { ValhallaClient } from '../../../src/routing/valhallaClient';

describe('ValhallaClient (unit)', () => {
  it('throws when constructed with a baseUrl not in the allowlist', () => {
    expect(() => new ValhallaClient('https://evil.example.com')).toThrow(/not in allowlist/);
  });

  it('accepts allowlisted baseUrl', () => {
    expect(() => new ValhallaClient('http://localhost:8002')).not.toThrow();
  });

  it('accepts a relative baseUrl (same-origin via dev proxy or reverse proxy)', () => {
    expect(() => new ValhallaClient('/valhalla')).not.toThrow();
  });
});
