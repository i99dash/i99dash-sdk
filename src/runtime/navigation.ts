/// Mini-app-facing controller for the host's `nav.read` family.
/// PII tier — same two-step gate as [LocationController].

import { NavigationSnapshotSchema, type NavigationSnapshot } from '../types/index.js';

import { isNavigationBridge, type Bridge } from './bridge.js';
import { InvalidResponseError, NavigationUnavailableError } from './errors.js';

export type NavigationListener = (snapshot: NavigationSnapshot) => void;

export class NavigationController {
  private readonly bridge: Bridge;
  private _shape: string | null = null;
  private _visibilityInstalled = false;
  private _hidden = false;
  private _listeners = new Set<NavigationListener>();
  private _lastWhilePaused: NavigationSnapshot | null = null;
  private _subId: string | null = null;

  constructor(bridge: Bridge) {
    this.bridge = bridge;
  }

  async getSnapshot(): Promise<NavigationSnapshot> {
    if (!isNavigationBridge(this.bridge)) {
      throw new NavigationUnavailableError('bridge does not implement NavigationBridge');
    }
    return this._parse(await this.bridge.getNavigation());
  }

  onChange(listener: NavigationListener): () => void {
    if (!isNavigationBridge(this.bridge)) {
      throw new NavigationUnavailableError('bridge does not implement NavigationBridge');
    }
    const bridge = this.bridge;
    this._listeners.add(listener);
    this._installVisibility();
    if (this._subId === null) {
      void bridge
        .subscribeNavigation((raw) => this._dispatch(raw))
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
        void bridge.unsubscribeNavigation(id).catch(() => {});
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
    let parsed: NavigationSnapshot;
    try {
      parsed = this._parse(raw);
    } catch (e) {
      console.warn('[i99dash] dropped malformed nav event:', e);
      return;
    }
    if (this._hidden) {
      this._lastWhilePaused = parsed;
      return;
    }
    for (const l of [...this._listeners]) this._invokeSafe(l, parsed);
  }

  private _invokeSafe(l: NavigationListener, s: NavigationSnapshot): void {
    try {
      l(s);
    } catch (e) {
      console.error('[i99dash] nav listener threw:', e);
    }
  }

  private _parse(raw: unknown): NavigationSnapshot {
    const shape = _shapeFingerprint(raw);
    if (shape !== null && shape === this._shape) return raw as NavigationSnapshot;
    const result = NavigationSnapshotSchema.safeParse(raw);
    if (!result.success) {
      throw new InvalidResponseError('nav payload did not match schema', result.error);
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
