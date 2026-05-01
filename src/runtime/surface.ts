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
import { BaseFamilyController, type InvokeFamilyOptions } from './family-controller.js';

export interface SurfaceCreateRequest {
  displayId: number;
  /// Route within the mini-app's bundle to load on the surface.
  /// Defaults to `/`. Must match `^/[A-Za-z0-9._\-/]*$`.
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
}
