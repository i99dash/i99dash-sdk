/// Mini-app-facing controller for the host's media surface — what's
/// playing, where, at what volume. Mirror of [CarStatusController]:
/// lazy bridge subscription, refcounted teardown, page-visibility
/// pause/resume, schema-cached fast-path.
///
/// API surface:
///
///   const snap = await client.media.getSnapshot();
///   const off  = client.media.onChange(s => render(s));
///   off();
///
/// Off by default — a mini-app must declare the `media.read` scope
/// in its manifest. The host's permission gate returns
/// `permission_denied` envelopes (forwarded to
/// `client.onPermissionDenied`) when the scope is missing.

import { MediaSnapshotSchema, type MediaSnapshot } from '../types/index.js';

import { isMediaBridge, type Bridge } from './bridge.js';
import { InvalidResponseError, MediaUnavailableError } from './errors.js';

export type MediaListener = (snapshot: MediaSnapshot) => void;

export class MediaController {
  private readonly bridge: Bridge;
  /// Cached `key set` of the last successfully-parsed payload —
  /// same fast-path as [CarStatusController].
  private _shape: string | null = null;
  private _visibilityInstalled = false;
  private _hidden = false;
  private _listeners = new Set<MediaListener>();
  private _lastWhilePaused: MediaSnapshot | null = null;
  private _subId: string | null = null;

  constructor(bridge: Bridge) {
    this.bridge = bridge;
  }

  /// One-shot read. Throws [MediaUnavailableError] if the bridge
  /// doesn't ship the media surface (older host, unit-test stub).
  async getSnapshot(): Promise<MediaSnapshot> {
    if (!isMediaBridge(this.bridge)) {
      throw new MediaUnavailableError('bridge does not implement MediaBridge');
    }
    const raw = await this.bridge.getMedia();
    return this._parse(raw);
  }

  /// Subscribe to media events. Returns an idempotent unsubscribe fn.
  /// First call lazily installs the bridge subscription + the
  /// page-visibility listener; last `off()` tears them down.
  onChange(listener: MediaListener): () => void {
    if (!isMediaBridge(this.bridge)) {
      throw new MediaUnavailableError('bridge does not implement MediaBridge');
    }
    const bridge = this.bridge;
    this._listeners.add(listener);
    this._installVisibility();
    if (this._subId === null) {
      void bridge
        .subscribeMedia((raw) => this._dispatch(raw))
        .then(({ id }) => {
          this._subId = id;
        })
        .catch(() => {
          this._listeners.delete(listener);
        });
    }
    let off = false;
    return () => {
      if (off) return;
      off = true;
      this._listeners.delete(listener);
      if (this._listeners.size === 0 && this._subId !== null) {
        const id = this._subId;
        this._subId = null;
        void bridge.unsubscribeMedia(id).catch(() => {});
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
        for (const l of [...this._listeners]) {
          this._invokeSafe(l, buffered);
        }
      }
    };
    document.addEventListener('visibilitychange', onChange);
  }

  private _dispatch(raw: unknown): void {
    let parsed: MediaSnapshot;
    try {
      parsed = this._parse(raw);
    } catch (e) {
      console.warn('[i99dash] dropped malformed media event:', e);
      return;
    }
    if (this._hidden) {
      this._lastWhilePaused = parsed;
      return;
    }
    for (const l of [...this._listeners]) {
      this._invokeSafe(l, parsed);
    }
  }

  private _invokeSafe(l: MediaListener, s: MediaSnapshot): void {
    try {
      l(s);
    } catch (e) {
      console.error('[i99dash] media listener threw:', e);
    }
  }

  private _parse(raw: unknown): MediaSnapshot {
    const shape = _shapeFingerprint(raw);
    if (shape !== null && shape === this._shape) {
      return raw as MediaSnapshot;
    }
    const result = MediaSnapshotSchema.safeParse(raw);
    if (!result.success) {
      throw new InvalidResponseError('media payload did not match schema', result.error);
    }
    this._shape = shape;
    return result.data;
  }
}

function _shapeFingerprint(raw: unknown): string | null {
  if (raw === null || typeof raw !== 'object') return null;
  const keys = Object.keys(raw as Record<string, unknown>).sort();
  return keys.join('\x1f');
}
