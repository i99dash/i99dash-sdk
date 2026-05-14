/// Mini-app-facing controller for the host's `surface` family.
///
/// Tier-2 (`surface.write`); requires the user to consent at install
/// time. Step-up is NOT required — once the install-time cap is
/// granted, `create` / `navigate` / `destroy` proceed without a
/// per-action prompt.
///
///     const sfc = await client.surface.create({
///       displayId: 4,
///       route: '/cluster/widget',
///     });
///     // sfc.path === 'presentation' | 'overlay'
///     // ...
///     await client.surface.destroy({ surfaceId: sfc.surfaceId });

import type { Bridge } from './bridge.js';
import { SDKError } from './errors.js';
import { BaseFamilyController, type InvokeFamilyOptions } from './family-controller.js';

/// Mirror of the host's `surface.create` route validator
/// (`car-i99dash/lib/features/mini_apps/runtime/surface_family.dart`).
/// Exported so advanced callers can validate a hand-built route
/// before posting — most mini-apps should go through
/// [SurfaceController.buildRoute] instead, which constructs a
/// guaranteed-passing string in the first place.
///
/// Permitted shape: bundle-relative path
/// (`[A-Za-z0-9._\-/]`), optionally followed by `?` and a
/// query string (`[A-Za-z0-9._\-/=&%~+,:;*!#]`). Bare `#fragment`
/// URLs are NOT permitted at top level — `#` only appears inside a
/// query string. The gauge-builder v0.1.6 → v0.1.7 fix tripped on
/// exactly this constraint.
export const SURFACE_ROUTE_REGEX = /^\/[A-Za-z0-9._\-/]*(\?[A-Za-z0-9._\-/=&%~+,:;*!#]*)?$/;

const SURFACE_ROUTE_PATH_ONLY_REGEX = /^\/[A-Za-z0-9._\-/]*$/;

/// Failure of [SurfaceController.buildRoute]. Always client-side —
/// never reflects a host response. Catch this around a `buildRoute`
/// call if you accept user input for the path / params and need to
/// surface a friendly error instead of crashing.
export class SurfaceRouteError extends SDKError {
  constructor(message: string) {
    super(
      'SurfaceRouteError',
      'SURFACE_ROUTE_INVALID',
      'docs/api-ref/surface.md#surface_route_invalid',
      message,
    );
  }
}

export interface SurfaceCreateRequest {
  displayId: number;
  /// Route within the mini-app's bundle to load on the surface.
  /// Defaults to `/`. Must match [SURFACE_ROUTE_REGEX] — use
  /// [SurfaceController.buildRoute] if you have query params to
  /// avoid hand-encoding traps (bare `#fragment` URLs are rejected
  /// at the host).
  route?: string;
}

export interface SurfaceCreateResult {
  surfaceId: string;
  /// Which surface mechanism the host used: a regular
  /// `Presentation` (preferred), a `TYPE_APPLICATION_OVERLAY`
  /// fallback (when Presentation was denied — typical on the BYD
  /// Leopard 8 cluster), or `denied` (no surface available; both
  /// paths failed). Mini-apps usually don't need to branch on this
  /// — the host hides the difference — but it's exposed for
  /// telemetry / diagnostic UIs.
  path: 'presentation' | 'overlay' | 'denied';
  displayId: number;
  route: string;
}

export interface SurfaceSnapshot {
  surfaceId: string;
  displayId: number;
  path: string;
  route: string;
}

export class SurfaceController extends BaseFamilyController {
  constructor(bridge: Bridge) {
    super(bridge, 'surface');
  }

  /// Open a surface on the requested display. The host tries
  /// `Presentation.show()` first and auto-falls-back to a
  /// `TYPE_APPLICATION_OVERLAY` view if denied. Throws
  /// `FamilyOpError` with code `surface_denied` if neither path
  /// works (e.g. permission revoked, hardware doesn't support a
  /// secondary surface).
  async create(
    req: SurfaceCreateRequest,
    opts: InvokeFamilyOptions = {},
  ): Promise<SurfaceCreateResult> {
    return this.invoke<SurfaceCreateResult>(
      'create',
      { displayId: req.displayId, ...(req.route ? { route: req.route } : {}) },
      opts,
    );
  }

  /// Navigate the surface to a new route within the mini-app
  /// bundle. Same allowlist rules as the primary WebView's
  /// navigation gate apply; off-bundle URLs are rejected at the
  /// host.
  async navigate(
    req: { surfaceId: string; route: string },
    opts: InvokeFamilyOptions = {},
  ): Promise<{ ok: true; route: string }> {
    return this.invoke<{ ok: true; route: string }>(
      'navigate',
      { surfaceId: req.surfaceId, route: req.route },
      opts,
    );
  }

  /// Tear down a previously-opened surface.
  async destroy(req: { surfaceId: string }, opts: InvokeFamilyOptions = {}): Promise<{ ok: true }> {
    return this.invoke<{ ok: true }>('destroy', { surfaceId: req.surfaceId }, opts);
  }

  /// List currently-open surfaces this mini-app owns.
  async list(opts: InvokeFamilyOptions = {}): Promise<SurfaceSnapshot[]> {
    const data = await this.invoke<{ surfaces: SurfaceSnapshot[] }>('list', {}, opts);
    return data.surfaces;
  }

  /// Build a route string that's guaranteed to pass the host's
  /// `surface.create` validation. The path is checked against the
  /// bundle-relative regex; params are URL-encoded with an extra
  /// pass over `'` `(` `)` (left raw by `encodeURIComponent` but
  /// rejected by the host) so the final route always matches
  /// [SURFACE_ROUTE_REGEX].
  ///
  ///     SurfaceController.buildRoute('/cluster.html', { layout: enc });
  ///     // → '/cluster.html?layout=...'
  ///
  /// Throws [SurfaceRouteError] if [path] is malformed (must start
  /// with `/` and only contain `[A-Za-z0-9._\-/]`). Use a try /
  /// catch if `path` originates in user input.
  static buildRoute(
    path: string,
    params?: Record<string, string | number | boolean | null | undefined>,
  ): string {
    if (typeof path !== 'string' || path.length === 0) {
      throw new SurfaceRouteError(`route path must be a non-empty string`);
    }
    if (!path.startsWith('/')) {
      throw new SurfaceRouteError(`route path must start with '/' — got '${path}'`);
    }
    if (!SURFACE_ROUTE_PATH_ONLY_REGEX.test(path)) {
      throw new SurfaceRouteError(
        `route path '${path}' contains characters outside [A-Za-z0-9._\\-/]`,
      );
    }
    // Filter out null/undefined params so callers can write
    // `{ layout: state.compact ? null : encoded }` without conditional
    // object spreads at every call site. Falsy values that ARE meaningful
    // ('', 0, false) survive.
    const pairs = params
      ? Object.entries(params).filter(([, v]) => v !== null && v !== undefined)
      : [];
    if (pairs.length === 0) return path;
    const qs = pairs.map(([k, v]) => `${k}=${encodeHostQueryValue(String(v))}`).join('&');
    const route = `${path}?${qs}`;
    if (!SURFACE_ROUTE_REGEX.test(route)) {
      // Defensive: should never fire after encodeHostQueryValue, but
      // if a future host tightens the regex we surface a clear error
      // instead of letting the host reject opaquely.
      throw new SurfaceRouteError(
        `built route '${route}' failed host regex — open an SDK issue if you see this`,
      );
    }
    return route;
  }
}

/// `encodeURIComponent` leaves `'` `(` `)` raw — all three are
/// rejected by the host's query-string regex. Re-encode them so
/// `buildRoute` produces a guaranteed-passing string. `*` and `!`
/// (also left raw by encodeURIComponent) ARE in the host allowlist
/// and stay literal.
function encodeHostQueryValue(value: string): string {
  return encodeURIComponent(value).replace(
    /[()']/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}
