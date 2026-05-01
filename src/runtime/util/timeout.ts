import { BridgeTimeoutError } from '../errors.js';

/// Races [task] against a timeout and an optional external
/// AbortSignal. Whichever settles first decides the outcome:
///
///   - task resolves → outer resolves with the value;
///   - task rejects → outer rejects with the reason;
///   - timeout fires → outer rejects with [BridgeTimeoutError];
///   - external signal aborts → outer rejects with the signal's reason.
///
/// The provided `ac.signal` is passed to [task] so a cooperative
/// bridge can abort its in-flight work; a non-cooperative bridge
/// still gets cut off from the caller's perspective because the
/// outer promise has already settled.
///
/// Kept internal: the runtime surfaces timeouts / cancellation as
/// user-facing options (`{ timeoutMs, signal }`) but never exposes
/// this helper directly — a future swap to `AbortSignal.timeout`
/// shouldn't be a breaking change.
export function withTimeout<T>(
  operation: string,
  timeoutMs: number,
  task: (signal: AbortSignal) => Promise<T>,
  externalSignal: AbortSignal | undefined,
): Promise<T> {
  if (externalSignal?.aborted) return Promise.reject(externalSignal.reason);

  const ac = new AbortController();

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      fn();
    };

    const timeoutId: ReturnType<typeof setTimeout> = setTimeout(() => {
      settle(() => reject(new BridgeTimeoutError(operation, timeoutMs)));
      ac.abort();
    }, timeoutMs);

    let detachExternal = (): void => {};
    if (externalSignal) {
      const onExtAbort = (): void => {
        settle(() => reject(externalSignal.reason as unknown));
        ac.abort();
      };
      externalSignal.addEventListener('abort', onExtAbort, { once: true });
      detachExternal = () => externalSignal.removeEventListener('abort', onExtAbort);
    }

    task(ac.signal).then(
      (value) => {
        clearTimeout(timeoutId);
        detachExternal();
        settle(() => resolve(value));
      },
      (err) => {
        clearTimeout(timeoutId);
        detachExternal();
        settle(() => reject(err as unknown));
      },
    );
  });
}
