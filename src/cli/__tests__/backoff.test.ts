import { describe, it, expect } from 'vitest';
import { Backoff } from '../util/backoff.js';

describe('Backoff', () => {
  it('grows exponentially until the ceiling', () => {
    const b = new Backoff({ baseMs: 1_000, ceilingMs: 10_000, random: () => 0.5 });
    // random=0.5 means jitter factor = 1.0, so delay = capped * 1.0.
    const delays = [b.nextDelayMs(), b.nextDelayMs(), b.nextDelayMs(), b.nextDelayMs()];
    expect(delays[0]).toBe(1_000);
    expect(delays[1]).toBe(2_000);
    expect(delays[2]).toBe(4_000);
    // Attempt=3 → 8_000 which is under ceiling, then capped.
    expect(delays[3]).toBe(8_000);
  });

  it('respects ceiling', () => {
    const b = new Backoff({ baseMs: 1_000, ceilingMs: 3_000, random: () => 1 });
    // random=1 → jitter factor 1.5, so capped to ceiling.
    for (let i = 0; i < 5; i++) {
      expect(b.nextDelayMs()).toBeLessThanOrEqual(3_000);
    }
  });

  it('bumpBase doubles the base, still respecting the ceiling', () => {
    const b = new Backoff({ baseMs: 1_000, ceilingMs: 5_000, random: () => 0.5 });
    b.bumpBase();
    // base 2_000, attempt 0 → 2_000 * 2^0 = 2_000, jitter 1.0 → 2_000
    expect(b.nextDelayMs()).toBe(2_000);
    b.bumpBase();
    // base 4_000, attempt 1 → 4_000 * 2^1 = 8_000, capped to 5_000, jitter 1.0 → 5_000
    expect(b.nextDelayMs()).toBe(5_000);
  });

  it('reset restarts the attempt counter', () => {
    const b = new Backoff({ baseMs: 100, ceilingMs: 10_000, random: () => 0.5 });
    b.nextDelayMs();
    b.nextDelayMs();
    b.reset();
    expect(b.nextDelayMs()).toBe(100);
  });
});
