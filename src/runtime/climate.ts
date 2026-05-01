/// Mini-app-facing controller for the host's `climate.read` family.
/// Same lifecycle pattern as [MediaController] / [CarStatusController]:
/// lazy bridge subscription, refcounted teardown, page-visibility
/// pause/resume, schema-cached fast-path.

import { ClimateSnapshotSchema, type ClimateSnapshot } from '../types/index.js';

import { isClimateBridge, type Bridge } from './bridge.js';
import { ClimateUnavailableError, InvalidResponseError } from './errors.js';

export type ClimateListener = (snapshot: ClimateSnapshot) => void;

export class ClimateController {
  private readonly bridge: Bridge;
  private _shape: string | null = null;
  private _visibilityInstalled = false;
  private _hidden = false;
  private _listeners = new Set<ClimateListener>();
  private _lastWhilePaused: ClimateSnapshot | null = null;
  private _subId: string | null = null;

  constructor(bridge: Bridge) {
    this.bridge = bridge;
  }

  async getSnapshot(): Promise<ClimateSnapshot> {
    if (!isClimateBridge(this.bridge)) {
      throw new ClimateUnavailableError('bridge does not implement ClimateBridge');
    }
    return this._parse(await this.bridge.getClimate());
  }

  onChange(listener: ClimateListener): () => void {
    if (!isClimateBridge(this.bridge)) {
      throw new ClimateUnavailableError('bridge does not implement ClimateBridge');
    }
    const bridge = this.bridge;
    this._listeners.add(listener);
    this._installVisibility();
    if (this._subId === null) {
      void bridge
        .subscribeClimate((raw) => this._dispatch(raw))
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
        void bridge.unsubscribeClimate(id).catch(() => {});
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
    let parsed: ClimateSnapshot;
    try {
      parsed = this._parse(raw);
    } catch (e) {
      console.warn('[i99dash] dropped malformed climate event:', e);
      return;
    }
    if (this._hidden) {
      this._lastWhilePaused = parsed;
      return;
    }
    for (const l of [...this._listeners]) this._invokeSafe(l, parsed);
  }

  private _invokeSafe(l: ClimateListener, s: ClimateSnapshot): void {
    try {
      l(s);
    } catch (e) {
      console.error('[i99dash] climate listener threw:', e);
    }
  }

  private _parse(raw: unknown): ClimateSnapshot {
    const shape = _shapeFingerprint(raw);
    if (shape !== null && shape === this._shape) return raw as ClimateSnapshot;
    const result = ClimateSnapshotSchema.safeParse(raw);
    if (!result.success) {
      throw new InvalidResponseError('climate payload did not match schema', result.error);
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
