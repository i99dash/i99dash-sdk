/// Mini-app-facing controller for the host's `display` family.
///
/// Tier-1 (read-only); no consent prompt, no cap. Permission
/// declared in `manifest.permissions[]` as `display.read`.
///
///     const displays = await client.display.list();
///     const cluster  = displays.find(d => d.isCluster);
///     if (cluster) {
///       const sfc = await client.surface.create({ displayId: cluster.id });
///       // ...
///     }

import type { Bridge } from './bridge.js';
import {
  BaseFamilyController,
  type InvokeFamilyOptions,
  type UnsubscribeFn,
} from './family-controller.js';

export interface DisplaySnapshot {
  /// Stable display id used by `client.surface.create({displayId})`.
  id: number;
  name: string;
  width: number;
  height: number;
  densityDpi: number;
  isDefault: boolean;
  /// True when the display advertises `FLAG_PRESENTATION` —
  /// usually a virtual display (passenger, cluster, HUD).
  isPresentation: boolean;
  /// Heuristic flag set by the host when the display name
  /// matches the BYD cluster naming convention
  /// (`fission_bg_XDJAScreenProjection*`). Falsifiable per device:
  /// inspect `name` if you need precise control.
  isCluster: boolean;
}

/// Hot-plug event the host pushes when displays are added, removed,
/// or modified. `kind: 'snapshot'` is the seed event the host fires
/// once on first subscribe with the full current list.
export type DisplayEvent =
  | { type: 'snapshot'; displays: DisplaySnapshot[] }
  | { type: 'added'; displayId: number; display?: DisplaySnapshot }
  | { type: 'removed'; displayId: number }
  | { type: 'changed'; displayId: number; display?: DisplaySnapshot };

export type DisplayEventListener = (evt: DisplayEvent) => void;

export class DisplayController extends BaseFamilyController {
  constructor(bridge: Bridge) {
    super(bridge, 'display');
  }

  /// One-shot snapshot of every addressable display.
  async list(opts: InvokeFamilyOptions = {}): Promise<DisplaySnapshot[]> {
    const data = await this.invoke<{ displays: DisplaySnapshot[] }>('list', {}, opts);
    return data.displays;
  }

  /// Subscribe to display add/remove/changed events. The first
  /// emit is a `'snapshot'` carrying the full current list — same
  /// shape as `list()` returned, just delivered through the same
  /// event channel so consumers don't need a separate one-shot read
  /// to seed their UI.
  ///
  /// Returns a cleanup closure. Call it once when you're done — the
  /// SDK runs the host's `display.unsubscribe` for you. Calling it
  /// twice is a no-op.
  ///
  /// Throws `FamilyOpError` if the initial subscribe is rejected
  /// (e.g. `permission_denied`); after that, transient native
  /// errors are silently swallowed so a single hiccup doesn't kill
  /// the listener.
  async onChange(listener: DisplayEventListener): Promise<UnsubscribeFn> {
    return this.subscribe((raw) => listener(raw as DisplayEvent));
  }
}
