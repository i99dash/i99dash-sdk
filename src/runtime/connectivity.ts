/// Mini-app-facing controller for the host's `connectivity.read`
/// family. Same lifecycle pattern as the other family controllers.

import { ConnectivitySnapshotSchema, type ConnectivitySnapshot } from '../types/index.js';

import { isConnectivityBridge, type Bridge } from './bridge.js';
import { ConnectivityUnavailableError, InvalidResponseError } from './errors.js';

export type ConnectivityListener = (snapshot: ConnectivitySnapshot) => void;

export class ConnectivityController {
  private readonly bridge: Bridge;
  private _shape: string | null = null;
  private _visibilityInstalled = false;
  private _hidden = false;
  private _listeners = new Set<ConnectivityListener>();
  private _lastWhilePaused: ConnectivitySnapshot | null = null;
  private _subId: string | null = null;

  constructor(bridge: Bridge) {
    this.bridge = bridge;
  }

  async getSnapshot(): Promise<ConnectivitySnapshot> {
    if (!isConnectivityBridge(this.bridge)) {
      throw new ConnectivityUnavailableError('bridge does not implement ConnectivityBridge');
    }
    return this._parse(await this.bridge.getConnectivity());
  }

  onChange(listener: ConnectivityListener): () => void {
    if (!isConnectivityBridge(this.bridge)) {
      throw new ConnectivityUnavailableError('bridge does not implement ConnectivityBridge');
    }
    const bridge = this.bridge;
    this._listeners.add(listener);
    this._installVisibility();
    if (this._subId === null) {
      void bridge
        .subscribeConnectivity((raw) => this._dispatch(raw))
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
        void bridge.unsubscribeConnectivity(id).catch(() => {});
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
    let parsed: ConnectivitySnapshot;
    try {
      parsed = this._parse(raw);
    } catch (e) {
      console.warn('[i99dash] dropped malformed connectivity event:', e);
      return;
    }
    if (this._hidden) {
      this._lastWhilePaused = parsed;
      return;
    }
    for (const l of [...this._listeners]) this._invokeSafe(l, parsed);
  }

  private _invokeSafe(l: ConnectivityListener, s: ConnectivitySnapshot): void {
    try {
      l(s);
    } catch (e) {
      console.error('[i99dash] connectivity listener threw:', e);
    }
  }

  private _parse(raw: unknown): ConnectivitySnapshot {
    const shape = _shapeFingerprint(raw);
    if (shape !== null && shape === this._shape) return raw as ConnectivitySnapshot;
    const result = ConnectivitySnapshotSchema.safeParse(raw);
    if (!result.success) {
      throw new InvalidResponseError('connectivity payload did not match schema', result.error);
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
