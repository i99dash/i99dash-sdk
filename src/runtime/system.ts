/// Mini-app-facing controller for the host's `system.read` family.
/// Same lifecycle pattern as the other family controllers.

import { SystemSnapshotSchema, type SystemSnapshot } from '../types/index.js';

import { isSystemBridge, type Bridge } from './bridge.js';
import { InvalidResponseError, SystemUnavailableError } from './errors.js';

export type SystemListener = (snapshot: SystemSnapshot) => void;

export class SystemController {
  private readonly bridge: Bridge;
  private _shape: string | null = null;
  private _visibilityInstalled = false;
  private _hidden = false;
  private _listeners = new Set<SystemListener>();
  private _lastWhilePaused: SystemSnapshot | null = null;
  private _subId: string | null = null;

  constructor(bridge: Bridge) {
    this.bridge = bridge;
  }

  async getSnapshot(): Promise<SystemSnapshot> {
    if (!isSystemBridge(this.bridge)) {
      throw new SystemUnavailableError('bridge does not implement SystemBridge');
    }
    return this._parse(await this.bridge.getSystem());
  }

  onChange(listener: SystemListener): () => void {
    if (!isSystemBridge(this.bridge)) {
      throw new SystemUnavailableError('bridge does not implement SystemBridge');
    }
    const bridge = this.bridge;
    this._listeners.add(listener);
    this._installVisibility();
    if (this._subId === null) {
      void bridge
        .subscribeSystem((raw) => this._dispatch(raw))
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
        void bridge.unsubscribeSystem(id).catch(() => {});
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
    let parsed: SystemSnapshot;
    try {
      parsed = this._parse(raw);
    } catch (e) {
      console.warn('[i99dash] dropped malformed system event:', e);
      return;
    }
    if (this._hidden) {
      this._lastWhilePaused = parsed;
      return;
    }
    for (const l of [...this._listeners]) this._invokeSafe(l, parsed);
  }

  private _invokeSafe(l: SystemListener, s: SystemSnapshot): void {
    try {
      l(s);
    } catch (e) {
      console.error('[i99dash] system listener threw:', e);
    }
  }

  private _parse(raw: unknown): SystemSnapshot {
    const shape = _shapeFingerprint(raw);
    if (shape !== null && shape === this._shape) return raw as SystemSnapshot;
    const result = SystemSnapshotSchema.safeParse(raw);
    if (!result.success) {
      throw new InvalidResponseError('system payload did not match schema', result.error);
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
