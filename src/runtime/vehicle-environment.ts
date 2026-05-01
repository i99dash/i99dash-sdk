/// Mini-app-facing controller for the host's `vehicle.environment`
/// family. Same lifecycle pattern as the other family controllers.

import {
  VehicleEnvironmentSnapshotSchema,
  type VehicleEnvironmentSnapshot,
} from '../types/index.js';

import { isVehicleEnvironmentBridge, type Bridge } from './bridge.js';
import { InvalidResponseError, VehicleEnvironmentUnavailableError } from './errors.js';

export type VehicleEnvironmentListener = (s: VehicleEnvironmentSnapshot) => void;

export class VehicleEnvironmentController {
  private readonly bridge: Bridge;
  private _shape: string | null = null;
  private _visibilityInstalled = false;
  private _hidden = false;
  private _listeners = new Set<VehicleEnvironmentListener>();
  private _lastWhilePaused: VehicleEnvironmentSnapshot | null = null;
  private _subId: string | null = null;

  constructor(bridge: Bridge) {
    this.bridge = bridge;
  }

  async getSnapshot(): Promise<VehicleEnvironmentSnapshot> {
    if (!isVehicleEnvironmentBridge(this.bridge)) {
      throw new VehicleEnvironmentUnavailableError(
        'bridge does not implement VehicleEnvironmentBridge',
      );
    }
    return this._parse(await this.bridge.getVehicleEnvironment());
  }

  onChange(listener: VehicleEnvironmentListener): () => void {
    if (!isVehicleEnvironmentBridge(this.bridge)) {
      throw new VehicleEnvironmentUnavailableError(
        'bridge does not implement VehicleEnvironmentBridge',
      );
    }
    const bridge = this.bridge;
    this._listeners.add(listener);
    this._installVisibility();
    if (this._subId === null) {
      void bridge
        .subscribeVehicleEnvironment((raw) => this._dispatch(raw))
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
        void bridge.unsubscribeVehicleEnvironment(id).catch(() => {});
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
    let parsed: VehicleEnvironmentSnapshot;
    try {
      parsed = this._parse(raw);
    } catch (e) {
      console.warn('[i99dash] dropped malformed vehicle.environment event:', e);
      return;
    }
    if (this._hidden) {
      this._lastWhilePaused = parsed;
      return;
    }
    for (const l of [...this._listeners]) this._invokeSafe(l, parsed);
  }

  private _invokeSafe(l: VehicleEnvironmentListener, s: VehicleEnvironmentSnapshot): void {
    try {
      l(s);
    } catch (e) {
      console.error('[i99dash] vehicle.environment listener threw:', e);
    }
  }

  private _parse(raw: unknown): VehicleEnvironmentSnapshot {
    const shape = _shapeFingerprint(raw);
    if (shape !== null && shape === this._shape) return raw as VehicleEnvironmentSnapshot;
    const result = VehicleEnvironmentSnapshotSchema.safeParse(raw);
    if (!result.success) {
      throw new InvalidResponseError(
        'vehicle.environment payload did not match schema',
        result.error,
      );
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
