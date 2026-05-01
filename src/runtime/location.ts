/// Mini-app-facing controller for the host's `location.read` family.
/// PII tier — gated by manifest declaration AND the host's consent
/// prompt. From the SDK's perspective the lifecycle is identical to
/// the other family controllers; the consent gate fires server-side
/// as a `permission_denied` envelope which the SDK forwards to
/// `client.onPermissionDenied`.

import { LocationSnapshotSchema, type LocationSnapshot } from '../types/index.js';

import { isLocationBridge, type Bridge } from './bridge.js';
import { InvalidResponseError, LocationUnavailableError } from './errors.js';

export type LocationListener = (snapshot: LocationSnapshot) => void;

export class LocationController {
  private readonly bridge: Bridge;
  private _shape: string | null = null;
  private _visibilityInstalled = false;
  private _hidden = false;
  private _listeners = new Set<LocationListener>();
  private _lastWhilePaused: LocationSnapshot | null = null;
  private _subId: string | null = null;

  constructor(bridge: Bridge) {
    this.bridge = bridge;
  }

  async getSnapshot(): Promise<LocationSnapshot> {
    if (!isLocationBridge(this.bridge)) {
      throw new LocationUnavailableError('bridge does not implement LocationBridge');
    }
    return this._parse(await this.bridge.getLocation());
  }

  onChange(listener: LocationListener): () => void {
    if (!isLocationBridge(this.bridge)) {
      throw new LocationUnavailableError('bridge does not implement LocationBridge');
    }
    const bridge = this.bridge;
    this._listeners.add(listener);
    this._installVisibility();
    if (this._subId === null) {
      void bridge
        .subscribeLocation((raw) => this._dispatch(raw))
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
        void bridge.unsubscribeLocation(id).catch(() => {});
      }
    };
  }

  private _installVisibility(): void {
    if (this._visibilityInstalled) return;
    this._visibilityInstalled = true;
    if (typeof document === 'undefined') return;
    const onChange = (): void => {
      this._hidden = document.hidden;
      if (!this._hidden && this._lastWhilePaused !== null) {
        const buffered = this._lastWhilePaused;
        this._lastWhilePaused = null;
        for (const l of [...this._listeners]) this._invokeSafe(l, buffered);
      }
    };
    document.addEventListener('visibilitychange', onChange);
  }

  private _dispatch(raw: unknown): void {
    let parsed: LocationSnapshot;
    try {
      parsed = this._parse(raw);
    } catch (e) {
      console.warn('[i99dash] dropped malformed location event:', e);
      return;
    }
    if (this._hidden) {
      this._lastWhilePaused = parsed;
      return;
    }
    for (const l of [...this._listeners]) this._invokeSafe(l, parsed);
  }

  private _invokeSafe(l: LocationListener, s: LocationSnapshot): void {
    try {
      l(s);
    } catch (e) {
      console.error('[i99dash] location listener threw:', e);
    }
  }

  private _parse(raw: unknown): LocationSnapshot {
    const shape = _shapeFingerprint(raw);
    if (shape !== null && shape === this._shape) return raw as LocationSnapshot;
    const result = LocationSnapshotSchema.safeParse(raw);
    if (!result.success) {
      throw new InvalidResponseError('location payload did not match schema', result.error);
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
