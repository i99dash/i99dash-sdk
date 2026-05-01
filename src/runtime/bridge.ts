import type { CallApiRequest, CallApiResponse, MiniAppContext } from '../types/index.js';

import { BridgeTransportError, NotInsideHostError } from './errors.js';

/// Port implemented by anything that can talk to (or simulate) the host.
///
/// The real `HostBridge` below proxies to a host-injected global that
/// exposes `callHandler(name, ...args)`. The dev-server ships a
/// `FetchBridge` that points at its local `/_sdk/*` endpoints. Tests
/// use ad-hoc objects that satisfy this interface — no mocking
/// framework required.
export interface Bridge {
  getContext(): Promise<unknown>;
  callApi(req: CallApiRequest): Promise<unknown>;
}

/// Capability extension implemented by a bridge that supports the
/// real-time car-status handlers (`car.status.read`,
/// `car.status.subscribe`, `car.status.unsubscribe`). Production
/// `HostBridge` implements this; test stubs and the dev-server's
/// `FetchBridge` may not.
///
/// Capability check pattern (preferred over `instanceof` so structural
/// typing works for test bridges):
///
///   if (isCarStatusBridge(bridge)) { ... }
///
/// `subscribeCarStatus` returns the subscription id the host minted
/// (so the SDK can pass the same id to `unsubscribeCarStatus` later)
/// and registers `notify` to be called every time the host pushes
/// an event for this subscription. The host's transport is opaque
/// here — `HostBridge` listens for `window.__i99dashEvents` and
/// dispatches to any registered notifier.
export interface CarStatusBridge extends Bridge {
  getCarStatus(): Promise<unknown>;
  subscribeCarStatus(notify: (raw: unknown) => void): Promise<{ id: string }>;
  unsubscribeCarStatus(id: string): Promise<void>;
  /// Subscribe to host data-availability transitions (connected /
  /// disconnected). Same shape as `subscribeCarStatus` — minimises
  /// the number of distinct surfaces the bridge has to expose.
  subscribeCarConnectionState(notify: (raw: unknown) => void): Promise<{ id: string }>;
  unsubscribeCarConnectionState(id: string): Promise<void>;
}

/// Type guard for `CarStatusBridge`. Uses structural duck-typing on
/// the four methods that distinguish it from the base `Bridge` so
/// tests can hand in plain objects without `extends`-chaining.
export function isCarStatusBridge(b: Bridge): b is CarStatusBridge {
  const c = b as Partial<CarStatusBridge>;
  return (
    typeof c.getCarStatus === 'function' &&
    typeof c.subscribeCarStatus === 'function' &&
    typeof c.unsubscribeCarStatus === 'function' &&
    typeof c.subscribeCarConnectionState === 'function' &&
    typeof c.unsubscribeCarConnectionState === 'function'
  );
}

/// Capability extension for hosts that ship the `capabilities`
/// handshake handler. Added to support forward-compat: an SDK that
/// asks for a family the host doesn't yet implement can degrade
/// gracefully via `client.has(scope)` instead of failing at first call.
///
/// Optional on purpose — older hosts that pre-date the handshake
/// don't expose this handler; the SDK falls back to "best effort
/// known set" when absent.
export interface CapabilitiesBridge extends Bridge {
  capabilities(): Promise<unknown>;
}

export function isCapabilitiesBridge(b: Bridge): b is CapabilitiesBridge {
  return typeof (b as Partial<CapabilitiesBridge>).capabilities === 'function';
}

/// Capability extension for hosts that ship the `media.*` family.
/// Same shape as [CarStatusBridge] — a one-shot read plus a refcounted
/// subscribe/unsubscribe pair. Connection-state is not separately
/// modelled here; a media event with `source: 'none'` is the
/// "nothing playing" signal.
export interface MediaBridge extends Bridge {
  getMedia(): Promise<unknown>;
  subscribeMedia(notify: (raw: unknown) => void): Promise<{ id: string }>;
  unsubscribeMedia(id: string): Promise<void>;
}

export function isMediaBridge(b: Bridge): b is MediaBridge {
  const c = b as Partial<MediaBridge>;
  return (
    typeof c.getMedia === 'function' &&
    typeof c.subscribeMedia === 'function' &&
    typeof c.unsubscribeMedia === 'function'
  );
}

/// Capability extension for hosts that ship the `climate.read` family.
export interface ClimateBridge extends Bridge {
  getClimate(): Promise<unknown>;
  subscribeClimate(notify: (raw: unknown) => void): Promise<{ id: string }>;
  unsubscribeClimate(id: string): Promise<void>;
}

export function isClimateBridge(b: Bridge): b is ClimateBridge {
  const c = b as Partial<ClimateBridge>;
  return (
    typeof c.getClimate === 'function' &&
    typeof c.subscribeClimate === 'function' &&
    typeof c.unsubscribeClimate === 'function'
  );
}

/// Capability extension for hosts that ship the `vehicle.diagnostics` family.
export interface VehicleDiagnosticsBridge extends Bridge {
  getVehicleDiagnostics(): Promise<unknown>;
  subscribeVehicleDiagnostics(notify: (raw: unknown) => void): Promise<{ id: string }>;
  unsubscribeVehicleDiagnostics(id: string): Promise<void>;
}

export function isVehicleDiagnosticsBridge(b: Bridge): b is VehicleDiagnosticsBridge {
  const c = b as Partial<VehicleDiagnosticsBridge>;
  return (
    typeof c.getVehicleDiagnostics === 'function' &&
    typeof c.subscribeVehicleDiagnostics === 'function' &&
    typeof c.unsubscribeVehicleDiagnostics === 'function'
  );
}

/// Capability extension for hosts that ship the `vehicle.environment` family.
export interface VehicleEnvironmentBridge extends Bridge {
  getVehicleEnvironment(): Promise<unknown>;
  subscribeVehicleEnvironment(notify: (raw: unknown) => void): Promise<{ id: string }>;
  unsubscribeVehicleEnvironment(id: string): Promise<void>;
}

export function isVehicleEnvironmentBridge(b: Bridge): b is VehicleEnvironmentBridge {
  const c = b as Partial<VehicleEnvironmentBridge>;
  return (
    typeof c.getVehicleEnvironment === 'function' &&
    typeof c.subscribeVehicleEnvironment === 'function' &&
    typeof c.unsubscribeVehicleEnvironment === 'function'
  );
}

/// Capability extension for hosts that ship the `system.read` family.
export interface SystemBridge extends Bridge {
  getSystem(): Promise<unknown>;
  subscribeSystem(notify: (raw: unknown) => void): Promise<{ id: string }>;
  unsubscribeSystem(id: string): Promise<void>;
}

export function isSystemBridge(b: Bridge): b is SystemBridge {
  const c = b as Partial<SystemBridge>;
  return (
    typeof c.getSystem === 'function' &&
    typeof c.subscribeSystem === 'function' &&
    typeof c.unsubscribeSystem === 'function'
  );
}

/// Capability extension for hosts that ship the `connectivity.read` family.
export interface ConnectivityBridge extends Bridge {
  getConnectivity(): Promise<unknown>;
  subscribeConnectivity(notify: (raw: unknown) => void): Promise<{ id: string }>;
  unsubscribeConnectivity(id: string): Promise<void>;
}

export function isConnectivityBridge(b: Bridge): b is ConnectivityBridge {
  const c = b as Partial<ConnectivityBridge>;
  return (
    typeof c.getConnectivity === 'function' &&
    typeof c.subscribeConnectivity === 'function' &&
    typeof c.unsubscribeConnectivity === 'function'
  );
}

/// Capability extension for hosts that ship the `location.read` family.
/// PII tier — host gates with both manifest declaration AND a
/// consent prompt; both must pass before any value is dispatched.
export interface LocationBridge extends Bridge {
  getLocation(): Promise<unknown>;
  subscribeLocation(notify: (raw: unknown) => void): Promise<{ id: string }>;
  unsubscribeLocation(id: string): Promise<void>;
}

export function isLocationBridge(b: Bridge): b is LocationBridge {
  const c = b as Partial<LocationBridge>;
  return (
    typeof c.getLocation === 'function' &&
    typeof c.subscribeLocation === 'function' &&
    typeof c.unsubscribeLocation === 'function'
  );
}

/// Capability extension for hosts that ship the `nav.read` family.
/// PII tier — same two-step gate as [LocationBridge].
export interface NavigationBridge extends Bridge {
  getNavigation(): Promise<unknown>;
  subscribeNavigation(notify: (raw: unknown) => void): Promise<{ id: string }>;
  unsubscribeNavigation(id: string): Promise<void>;
}

export function isNavigationBridge(b: Bridge): b is NavigationBridge {
  const c = b as Partial<NavigationBridge>;
  return (
    typeof c.getNavigation === 'function' &&
    typeof c.subscribeNavigation === 'function' &&
    typeof c.unsubscribeNavigation === 'function'
  );
}

/// Capability extension for hosts that ship the native-capability
/// family registry (display, surface, cursor, gesture, magnify, pkg,
/// boot, …). Mini-apps invoke through `callFamily(familyId, op, …)`,
/// which the host routes through its [BridgeFamilyRegistry] +
/// [FamilyExecutor] (single chokepoint with the same cert / consent /
/// cap / audit gates as `_admin.exec`).
///
/// Wire shape: the JS handler name is `<familyId>.<op>`; the host
/// returns the standard `{success, data | error}` envelope —
/// identical to admin-sdk's `AdminOpResponse`. Adding a new family on
/// the host doesn't bump this interface, only the family list in the
/// `capabilities` handshake.
export interface FamilyBridge extends Bridge {
  callFamily(
    familyId: string,
    op: string,
    params?: Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<unknown>;
}

export function isFamilyBridge(b: Bridge): b is FamilyBridge {
  return typeof (b as Partial<FamilyBridge>).callFamily === 'function';
}

/// Narrow shape of the host-injected global. Deliberately loose —
/// only `callHandler` is part of the contract; anything else the host
/// attaches is an internal detail we never read.
///
/// Exported (renamed at index) so other packages in this monorepo
/// (admin-sdk, dev-server) can talk to the same global without
/// redefining the shape.
export interface HostBridgeApi {
  callHandler: (name: string, ...args: unknown[]) => Promise<unknown>;
}

/// The branded global the host attaches to `window` to expose the
/// bridge. Kept under-scored because mini-app authors should never
/// touch it directly — use `MiniAppClient.fromWindow()`.
export const HOST_GLOBAL = '__i99dashHost' as const;

/// Legacy global we also check as a silent fallback so older host
/// builds continue to work while the host-side rename lands. Not
/// documented; scheduled for removal once the host consistently ships
/// the branded name.
export const LEGACY_HOST_GLOBAL = 'flutter_inappwebview' as const;

export interface WindowWithHost {
  [HOST_GLOBAL]?: HostBridgeApi;
  [LEGACY_HOST_GLOBAL]?: HostBridgeApi;
}

/// Resolve the host bridge from a window-like object. Returns
/// undefined if no compatible global is reachable. Centralised so
/// the admin SDK and any future privileged-bridge consumer hits the
/// same selection logic — diverging implementations would let an
/// attacker bypass the legacy-fallback rule by speaking only one of
/// the names.
export function resolveHostApi(windowLike: WindowWithHost): HostBridgeApi | undefined {
  const branded = windowLike[HOST_GLOBAL];
  if (branded?.callHandler) return branded;
  const legacy = windowLike[LEGACY_HOST_GLOBAL];
  if (legacy?.callHandler) return legacy;
  return undefined;
}

/// Browser global the host pushes events into. The mini-app's first
/// `subscribeCarStatus` call installs a tiny dispatcher under this
/// name; the host's `evaluateJavaScript` then calls
/// `window.__i99dashEvents.dispatch('car.status', payload)`.
///
/// Idempotent install — multiple SDK instances on the same page
/// share the dispatcher. Exposed for tests; mini-app authors should
/// never read it directly.
export const HOST_EVENTS_GLOBAL = '__i99dashEvents' as const;

/// Public for the same reason as [ensureHostEvents] — controllers in
/// this package use the typed surface.
export interface HostEventsApi {
  on: (channel: string, handler: (payload: unknown) => void) => () => void;
  dispatch: (channel: string, payload: unknown) => void;
}

interface WindowWithEvents {
  [HOST_EVENTS_GLOBAL]?: HostEventsApi;
}

/// Install the per-window event dispatcher if it isn't already there.
/// Returns the api so callers can grab a fresh handle synchronously.
///
/// Exported so other controllers in this package (the
/// `BaseFamilyController.subscribe` helper) can register listeners
/// without redefining the lookup. Mini-app code should never call
/// this directly — go through a typed controller.
export function ensureHostEvents(): HostEventsApi {
  if (typeof window === 'undefined') {
    throw new NotInsideHostError('window is undefined — cannot install __i99dashEvents');
  }
  const w = window as WindowWithEvents;
  const existing = w[HOST_EVENTS_GLOBAL];
  if (existing) return existing;

  const handlers = new Map<string, Set<(payload: unknown) => void>>();
  const api: HostEventsApi = {
    on(channel, handler) {
      let bucket = handlers.get(channel);
      if (!bucket) {
        bucket = new Set();
        handlers.set(channel, bucket);
      }
      bucket.add(handler);
      return () => {
        bucket?.delete(handler);
      };
    },
    dispatch(channel, payload) {
      const bucket = handlers.get(channel);
      if (!bucket) return;
      // Snapshot so a handler that unsubscribes mid-dispatch
      // doesn't mutate the iterator.
      for (const h of [...bucket]) {
        try {
          h(payload);
        } catch (e) {
          // One handler's bug must not silence the others.
          console.error('[i99dash] event handler threw:', e);
        }
      }
    },
  };
  w[HOST_EVENTS_GLOBAL] = api;
  return api;
}

/// Bridge impl backed by the host-injected global. Constructing this
/// throws [NotInsideHostError] if no bridge is reachable — callers
/// usually go through `MiniAppClient.fromWindow()` which does the
/// same check and wraps this for you.
///
/// Implements both [Bridge] (the always-required surface) and
/// [CarStatusBridge] (the streaming surface). Older hosts that
/// don't support `car.status.*` handlers will reject the
/// `callHandler` call; we surface that as `BridgeTransportError` so
/// the SDK can convert to `CarStatusUnavailableError` at the call
/// site.
export class HostBridge
  implements
    Bridge,
    CarStatusBridge,
    CapabilitiesBridge,
    MediaBridge,
    ClimateBridge,
    VehicleDiagnosticsBridge,
    VehicleEnvironmentBridge,
    SystemBridge,
    ConnectivityBridge,
    LocationBridge,
    NavigationBridge,
    FamilyBridge
{
  private readonly api: HostBridgeApi;

  constructor(windowLike?: WindowWithHost) {
    const w =
      windowLike ?? (typeof window !== 'undefined' ? (window as WindowWithHost) : undefined);
    if (!w) throw new NotInsideHostError('window is undefined');
    const api = resolveHostApi(w);
    if (!api) {
      throw new NotInsideHostError('host bridge is not present on window');
    }
    this.api = api;
  }

  async getContext(): Promise<unknown> {
    try {
      return await this.api.callHandler('getContext');
    } catch (cause) {
      throw new BridgeTransportError('getContext bridge call failed', cause);
    }
  }

  async callApi(req: CallApiRequest): Promise<unknown> {
    try {
      return await this.api.callHandler('callApi', req);
    } catch (cause) {
      throw new BridgeTransportError('callApi bridge call failed', cause);
    }
  }

  async capabilities(): Promise<unknown> {
    try {
      return await this.api.callHandler('capabilities');
    } catch (cause) {
      throw new BridgeTransportError('capabilities bridge call failed', cause);
    }
  }

  /// Generic family op. Routes to the host's `<familyId>.<op>`
  /// JS handler, which the host wires up to its
  /// [BridgeFamilyRegistry] + [FamilyExecutor]. Returns the host's
  /// success/error envelope verbatim — the controller decodes it.
  async callFamily(
    familyId: string,
    op: string,
    params?: Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<unknown> {
    const handlerName = `${familyId}.${op}`;
    const payload: Record<string, unknown> = {};
    if (params !== undefined) payload.params = params;
    if (idempotencyKey !== undefined) payload.idempotencyKey = idempotencyKey;
    try {
      return await this.api.callHandler(handlerName, payload);
    } catch (cause) {
      throw new BridgeTransportError(`${handlerName} bridge call failed`, cause);
    }
  }

  async getCarStatus(): Promise<unknown> {
    try {
      return await this.api.callHandler('car.status.read');
    } catch (cause) {
      throw new BridgeTransportError('car.status.read bridge call failed', cause);
    }
  }

  async subscribeCarStatus(notify: (raw: unknown) => void): Promise<{ id: string }> {
    return this._subscribeChannel('car.status', notify);
  }

  async unsubscribeCarStatus(id: string): Promise<void> {
    return this._unsubscribeChannel('car.status', id);
  }

  async subscribeCarConnectionState(notify: (raw: unknown) => void): Promise<{ id: string }> {
    return this._subscribeChannel('car.connection', notify);
  }

  async unsubscribeCarConnectionState(id: string): Promise<void> {
    return this._unsubscribeChannel('car.connection', id);
  }

  async getMedia(): Promise<unknown> {
    try {
      return await this.api.callHandler('media.read');
    } catch (cause) {
      throw new BridgeTransportError('media.read bridge call failed', cause);
    }
  }

  async subscribeMedia(notify: (raw: unknown) => void): Promise<{ id: string }> {
    return this._subscribeChannel('media', notify);
  }

  async unsubscribeMedia(id: string): Promise<void> {
    return this._unsubscribeChannel('media', id);
  }

  async getClimate(): Promise<unknown> {
    try {
      return await this.api.callHandler('climate.read');
    } catch (cause) {
      throw new BridgeTransportError('climate.read bridge call failed', cause);
    }
  }

  async subscribeClimate(notify: (raw: unknown) => void): Promise<{ id: string }> {
    return this._subscribeChannel('climate', notify);
  }

  async unsubscribeClimate(id: string): Promise<void> {
    return this._unsubscribeChannel('climate', id);
  }

  async getVehicleDiagnostics(): Promise<unknown> {
    try {
      return await this.api.callHandler('vehicle.diagnostics.read');
    } catch (cause) {
      throw new BridgeTransportError('vehicle.diagnostics.read bridge call failed', cause);
    }
  }

  async subscribeVehicleDiagnostics(notify: (raw: unknown) => void): Promise<{ id: string }> {
    return this._subscribeChannel('vehicle.diagnostics', notify);
  }

  async unsubscribeVehicleDiagnostics(id: string): Promise<void> {
    return this._unsubscribeChannel('vehicle.diagnostics', id);
  }

  async getVehicleEnvironment(): Promise<unknown> {
    try {
      return await this.api.callHandler('vehicle.environment.read');
    } catch (cause) {
      throw new BridgeTransportError('vehicle.environment.read bridge call failed', cause);
    }
  }

  async subscribeVehicleEnvironment(notify: (raw: unknown) => void): Promise<{ id: string }> {
    return this._subscribeChannel('vehicle.environment', notify);
  }

  async unsubscribeVehicleEnvironment(id: string): Promise<void> {
    return this._unsubscribeChannel('vehicle.environment', id);
  }

  async getSystem(): Promise<unknown> {
    try {
      return await this.api.callHandler('system.read');
    } catch (cause) {
      throw new BridgeTransportError('system.read bridge call failed', cause);
    }
  }

  async subscribeSystem(notify: (raw: unknown) => void): Promise<{ id: string }> {
    return this._subscribeChannel('system', notify);
  }

  async unsubscribeSystem(id: string): Promise<void> {
    return this._unsubscribeChannel('system', id);
  }

  async getConnectivity(): Promise<unknown> {
    try {
      return await this.api.callHandler('connectivity.read');
    } catch (cause) {
      throw new BridgeTransportError('connectivity.read bridge call failed', cause);
    }
  }

  async subscribeConnectivity(notify: (raw: unknown) => void): Promise<{ id: string }> {
    return this._subscribeChannel('connectivity', notify);
  }

  async unsubscribeConnectivity(id: string): Promise<void> {
    return this._unsubscribeChannel('connectivity', id);
  }

  async getLocation(): Promise<unknown> {
    try {
      return await this.api.callHandler('location.read');
    } catch (cause) {
      throw new BridgeTransportError('location.read bridge call failed', cause);
    }
  }

  async subscribeLocation(notify: (raw: unknown) => void): Promise<{ id: string }> {
    return this._subscribeChannel('location', notify);
  }

  async unsubscribeLocation(id: string): Promise<void> {
    return this._unsubscribeChannel('location', id);
  }

  async getNavigation(): Promise<unknown> {
    try {
      return await this.api.callHandler('nav.read');
    } catch (cause) {
      throw new BridgeTransportError('nav.read bridge call failed', cause);
    }
  }

  async subscribeNavigation(notify: (raw: unknown) => void): Promise<{ id: string }> {
    return this._subscribeChannel('nav', notify);
  }

  async unsubscribeNavigation(id: string): Promise<void> {
    return this._unsubscribeChannel('nav', id);
  }

  /// Shared subscribe path for any push channel — `car.status`,
  /// `car.connection`, `media`, and future families.
  /// The host returns `{success: true, data: {id}}` envelopes
  /// (mirroring the `callApi` shape) so the bridge has one parsing
  /// contract to rely on.
  private async _subscribeChannel(
    channel: string,
    notify: (raw: unknown) => void,
  ): Promise<{ id: string }> {
    const events = ensureHostEvents();
    const offEvent = events.on(channel, notify);
    let envelope: unknown;
    try {
      envelope = await this.api.callHandler(`${channel}.subscribe`);
    } catch (cause) {
      offEvent();
      throw new BridgeTransportError(`${channel}.subscribe bridge call failed`, cause);
    }
    const id = _extractId(envelope);
    if (id === null) {
      offEvent();
      throw new BridgeTransportError(`${channel}.subscribe returned envelope without id`, envelope);
    }
    // Stash the off-event closure in a side map keyed by id so
    // `unsubscribeChannel` can run it without forcing the SDK
    // controller to remember.
    _subscriptions.set(`${channel}:${id}`, offEvent);
    return { id };
  }

  private async _unsubscribeChannel(channel: string, id: string): Promise<void> {
    const key = `${channel}:${id}`;
    const offEvent = _subscriptions.get(key);
    _subscriptions.delete(key);
    offEvent?.();
    try {
      await this.api.callHandler(`${channel}.unsubscribe`, { id });
    } catch (cause) {
      // The local listener is already removed; the host-side leak
      // (one stale subscriber id) is bounded by the per-WebView
      // cap. Surface as transport error so callers can decide.
      throw new BridgeTransportError(`${channel}.unsubscribe bridge call failed`, cause);
    }
  }
}

const _subscriptions = new Map<string, () => void>();

function _extractId(envelope: unknown): string | null {
  if (!envelope || typeof envelope !== 'object') return null;
  const e = envelope as Record<string, unknown>;
  if (e.success === true && e.data && typeof e.data === 'object') {
    const id = (e.data as Record<string, unknown>).id;
    if (typeof id === 'string' && id.length > 0) return id;
  }
  // Tolerate a host that returned `{id}` directly (older bridges).
  if (typeof e.id === 'string' && e.id.length > 0) return e.id;
  return null;
}

/// Re-export the response type so consumers only need the one import.
export type { CallApiRequest, CallApiResponse, MiniAppContext };
