/// Exponential backoff with full jitter, bounded by a ceiling.
///
/// Used by the OAuth device-code polling loop and the publish
/// upload retry — any place we want to be polite to a rate-limited
/// server without storming it.
///
/// Algorithm: each step returns `min(ceilingMs, baseMs * 2^n)`
/// scaled by a uniformly-random factor in `[0.5, 1.5]` to avoid
/// thundering-herd alignment across concurrent CLIs.
export interface BackoffOptions {
  baseMs: number;
  ceilingMs: number;
  /// Deterministic random source for tests; defaults to Math.random.
  random?: () => number;
}

export class Backoff {
  private attempt = 0;

  constructor(private readonly opts: BackoffOptions) {}

  nextDelayMs(): number {
    const raw = this.opts.baseMs * 2 ** this.attempt;
    const capped = Math.min(raw, this.opts.ceilingMs);
    const rand = (this.opts.random ?? Math.random)();
    const jittered = capped * (0.5 + rand);
    this.attempt += 1;
    return Math.min(this.opts.ceilingMs, Math.round(jittered));
  }

  /// Lets the OAuth server push us down a slower cadence via `slow_down`.
  bumpBase(multiplier = 2): void {
    this.opts.baseMs = Math.min(this.opts.ceilingMs, Math.round(this.opts.baseMs * multiplier));
  }

  reset(): void {
    this.attempt = 0;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}
