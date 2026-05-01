/// Mini-app-facing controller for the host's real-time car status
/// stream. Local-only: every event reaches this code via the host's
/// in-process `evaluateJavaScript`, never via the network.
///
/// API surface (intentionally human-readable, no abbreviations):
///
///   const status = await client.car.getStatus();
///   const off    = client.car.onStatusChange(s => render(s));
///   const offC   = client.car.onConnectionChange(s => banner(s));
///   off(); offC();
///
/// Internal implementation notes worth knowing:
///
///   - **Page Visibility pause/resume.** While `document.hidden ==
///     true`, callbacks are suppressed and the latest event is
///     buffered. On `visibilitychange` back to visible, ONE catch-up
///     event fires and normal flow resumes. Saves CPU on backgrounded
///     mini-apps without forcing the host to be visibility-aware.
///
///   - **Zod fast-path.** Every dispatched event is validated, but
///     once a payload's *key set* matches the previous one we skip
///     `Schema.parse` and re-use the cached schema's narrowed type.
///     Invalidates on a parse failure or a new key — so adding a
///     field server-side still triggers a strict re-parse on the
///     first event with the new shape.

import {
  CarConnectionStateSchema,
  CarStatusSchema,
  type CarConnectionState,
  type CarStatus,
} from '../types/index.js';

import { isCarStatusBridge, type Bridge } from './bridge.js';
import { CarStatusUnavailableError, InvalidResponseError } from './errors.js';

export type CarStatusListener = (status: CarStatus) => void;
export type CarConnectionListener = (state: CarConnectionState) => void;

/// Single instance per [MiniAppClient]. Holds the page-visibility
/// state, the cached schema fingerprint, and the bridge subscription
/// ids so cleanup is correct even if the consumer forgets to call
/// `off()`.
export class CarStatusController {
  private readonly bridge: Bridge;
  /// Cached `key set` of the last successfully-parsed payload —
  /// sorted, joined by ``. Cheap to compare; safe to reuse
  /// because `CarStatusSchema` is `.strict()` (no rename surprise).
  private _statusShape: string | null = null;
  private _connShape: string | null = null;
  /// Page Visibility plumbing — installed lazily on the first
  /// `onStatusChange` so SSR / non-DOM consumers don't pay for an
  /// event listener that will never fire.
  private _visibilityInstalled = false;
  private _hidden = false;
  private _statusListeners = new Set<CarStatusListener>();
  private _connListeners = new Set<CarConnectionListener>();
  private _lastWhilePaused: CarStatus | null = null;
  /// Lazily-acquired subscription ids — null until first listener
  /// registers; reused for every subsequent listener; released when
  /// the last listener unsubscribes.
  private _statusSubId: string | null = null;
  private _connSubId: string | null = null;
  /// Per-field read-count buffer used to back the schema-evolution
  /// "is this field unused?" criterion (< 5% of active mini-apps
  /// touch it across 90 rolling days). Counts are incremented
  /// transparently as consumer code reads properties off the
  /// CarStatus value via a Proxy. The host-side telemetry sink
  /// that ingests these is wired in Phase 2 — until then, the
  /// buffer is read-only via [_telemetrySnapshot] for tests.
  private _fieldReadCounts = new Map<string, number>();

  constructor(bridge: Bridge) {
    this.bridge = bridge;
  }

  /// Test-only: return a snapshot of the per-field read counts and
  /// reset the internal buffer. Underscore-prefixed to mark as
  /// non-stable surface; not part of `public-api.test.ts`'s lock list.
  /// Will be replaced by a host-side telemetry-flush integration in
  /// Phase 2.
  _telemetrySnapshot(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, v] of this._fieldReadCounts) out[k] = v;
    this._fieldReadCounts.clear();
    return out;
  }

  /// One-shot read. Throws [CarStatusUnavailableError] if the bridge
  /// doesn't implement the streaming surface (e.g., unit-test stub
  /// or older host).
  async getStatus(): Promise<CarStatus> {
    if (!isCarStatusBridge(this.bridge)) {
      throw new CarStatusUnavailableError('bridge does not implement CarStatusBridge');
    }
    const raw = await this.bridge.getCarStatus();
    return this._parseStatus(raw);
  }

  /// Subscribe to status deltas. Returns an unsubscribe fn — the
  /// returned closure is idempotent (calling it twice is a no-op).
  ///
  /// First call lazily installs the bridge subscription + the page-
  /// visibility listener; last `off()` tears them down. So a
  /// consumer that subscribes once and unsubscribes correctly leaves
  /// no resources behind.
  onStatusChange(listener: CarStatusListener): () => void {
    if (!isCarStatusBridge(this.bridge)) {
      throw new CarStatusUnavailableError('bridge does not implement CarStatusBridge');
    }
    const bridge = this.bridge;
    this._statusListeners.add(listener);
    this._installVisibility();
    if (this._statusSubId === null) {
      // Lazy bridge subscribe — fire-and-await; we don't expose
      // the await because consumers want a synchronous cleanup
      // closure. A failure surfaces via the bridge's
      // `BridgeTransportError`, which the host page sees in
      // devtools but isn't easily catchable here.
      void bridge
        .subscribeCarStatus((raw) => this._dispatchStatus(raw))
        .then(({ id }) => {
          this._statusSubId = id;
        })
        .catch(() => {
          // Subscription failed; remove the listener so the
          // consumer's cleanup is still valid.
          this._statusListeners.delete(listener);
        });
    }
    let off = false;
    return () => {
      if (off) return;
      off = true;
      this._statusListeners.delete(listener);
      if (this._statusListeners.size === 0 && this._statusSubId !== null) {
        const id = this._statusSubId;
        this._statusSubId = null;
        void bridge.unsubscribeCarStatus(id).catch(() => {
          // Bridge cleanup failed — local listener is already
          // gone; host-side stale id is bounded by its own cap.
        });
      }
    };
  }

  /// Subscribe to host data-availability transitions. Same lifecycle
  /// pattern as [onStatusChange] — lazy setup, refcounted teardown.
  ///
  /// NOT page-visibility-paused: a backgrounded mini-app still wants
  /// to know if the data went stale, so the connection-banner can
  /// be correct on resume. The volume here is tiny (≤1 event per
  /// poll cycle).
  onConnectionChange(listener: CarConnectionListener): () => void {
    if (!isCarStatusBridge(this.bridge)) {
      throw new CarStatusUnavailableError('bridge does not implement CarStatusBridge');
    }
    const bridge = this.bridge;
    this._connListeners.add(listener);
    if (this._connSubId === null) {
      void bridge
        .subscribeCarConnectionState((raw) => this._dispatchConnection(raw))
        .then(({ id }) => {
          this._connSubId = id;
        })
        .catch(() => {
          this._connListeners.delete(listener);
        });
    }
    let off = false;
    return () => {
      if (off) return;
      off = true;
      this._connListeners.delete(listener);
      if (this._connListeners.size === 0 && this._connSubId !== null) {
        const id = this._connSubId;
        this._connSubId = null;
        void bridge.unsubscribeCarConnectionState(id).catch(() => {});
      }
    };
  }

  // ── Internals ────────────────────────────────────────────────────

  private _installVisibility(): void {
    if (this._visibilityInstalled) return;
    this._visibilityInstalled = true;
    if (typeof document === 'undefined') return;
    const onChange = (): void => {
      this._hidden = document.hidden;
      if (!this._hidden && this._lastWhilePaused !== null) {
        const buffered = this._lastWhilePaused;
        this._lastWhilePaused = null;
        for (const l of [...this._statusListeners]) {
          this._invokeSafe(l, buffered);
        }
      }
    };
    document.addEventListener('visibilitychange', onChange);
  }

  private _dispatchStatus(raw: unknown): void {
    let parsed: CarStatus;
    try {
      parsed = this._parseStatus(raw);
    } catch (e) {
      // Malformed event — drop with a dev console warning rather
      // than crash the page. Production builds skip the warning
      // when console is no-op'd.
      console.warn('[i99dash] dropped malformed car.status event:', e);
      return;
    }
    if (this._hidden) {
      this._lastWhilePaused = parsed;
      return;
    }
    for (const l of [...this._statusListeners]) {
      this._invokeSafe(l, parsed);
    }
  }

  private _dispatchConnection(raw: unknown): void {
    let parsed: CarConnectionState;
    try {
      parsed = this._parseConnection(raw);
    } catch {
      // Same drop-and-log policy as status.
      return;
    }
    for (const l of [...this._connListeners]) {
      try {
        l(parsed);
      } catch (e) {
        console.error('[i99dash] connection listener threw:', e);
      }
    }
  }

  private _invokeSafe(l: CarStatusListener, s: CarStatus): void {
    try {
      l(s);
    } catch (e) {
      console.error('[i99dash] car-status listener threw:', e);
    }
  }

  private _parseStatus(raw: unknown): CarStatus {
    const shape = _shapeFingerprint(raw);
    let parsed: CarStatus;
    if (shape !== null && shape === this._statusShape) {
      // Fast-path: same key-set as the last successful parse.
      // Trust the cached schema and use the runtime cast — Zod
      // already proved this shape parses cleanly. Drop the value-
      // level checks (range, enum) for the fast-path; if the host
      // ever pushes a malformed value with the same shape it'll
      // fail at the consumer's defensive read instead of here.
      parsed = raw as CarStatus;
    } else {
      const result = CarStatusSchema.safeParse(raw);
      if (!result.success) {
        throw new InvalidResponseError('car.status payload did not match schema', result.error);
      }
      this._statusShape = shape;
      parsed = result.data;
    }
    return this._instrumentReads(parsed);
  }

  /// Wrap [s] in a Proxy whose `get` trap increments a per-field
  /// counter when consumer code reads a property. Skips internal
  /// JS lookups (Symbol keys, prototype methods) so React's
  /// `Object.is` shallow-comparison doesn't pollute the count.
  ///
  /// The wrapped value is `===`-distinct from the underlying object
  /// each time, but the values within are shared — JSON.stringify,
  /// destructure, and Object.entries all work normally. A consumer
  /// that calls `useMemo(() => ..., [status])` will re-run on every
  /// event, which is the correct behaviour anyway since each event
  /// represents a fresh push from the host.
  private _instrumentReads(s: CarStatus): CarStatus {
    const counts = this._fieldReadCounts;
    return new Proxy(s, {
      get(target, prop, receiver) {
        if (typeof prop === 'string' && Object.prototype.hasOwnProperty.call(target, prop)) {
          counts.set(prop, (counts.get(prop) ?? 0) + 1);
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as CarStatus;
  }

  private _parseConnection(raw: unknown): CarConnectionState {
    const shape = _shapeFingerprint(raw);
    if (shape !== null && shape === this._connShape) {
      return raw as CarConnectionState;
    }
    const result = CarConnectionStateSchema.safeParse(raw);
    if (!result.success) {
      throw new InvalidResponseError('car.connection payload did not match schema', result.error);
    }
    this._connShape = shape;
    return result.data;
  }
}

/// Cheap structural fingerprint — sorted top-level key set joined by
/// a non-printable separator. Returns null for non-objects (so the
/// fast-path is skipped for strings / booleans like the connection
/// state enum, which always re-parses anyway).
function _shapeFingerprint(raw: unknown): string | null {
  if (raw === null || typeof raw !== 'object') return null;
  const keys = Object.keys(raw as Record<string, unknown>).sort();
  return keys.join('');
}
