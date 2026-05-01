/// Mini-app-facing controller for the host's `gesture` family.
///
/// Tier-2 with per-action step-up — every call needs a fresh per-action
/// security cap because synthetic input on the cluster is the most
/// dangerous primitive in the surface. The host SDK's invocation layer
/// handles the step-up dance transparently; the only thing this
/// controller surfaces is the result envelope.
///
/// `displayId` targets a non-default display:
///
///     const displays = await client.display.list();
///     const cluster = displays.find(d => d.isCluster);
///     if (!cluster) throw new Error('no cluster on this car');
///     await client.gesture.tap({ displayId: cluster.id, x: 960, y: 360 });
///
/// On Leopard 8 the cluster MCU's pixel input is signature-gated —
/// our drawn frames don't reach the cluster face — but
/// `gesture.dispatch` is on a different (Accessibility) permission
/// path and works without signature gating. That's the realistic
/// "remote control of cluster" capability mini-apps build on.
///
/// All three handlers return a [GestureResult] envelope:
///
///     { dispatched: boolean; reason?: string }
///
/// `dispatched=false` codes:
///   * `accessibility_disabled` — user hasn't enabled the host's
///     RemoteControlAccessibilityService in the system a11y panel
///     (or BYD's a11y panel silently disabled it). Show actionable
///     "open Settings" UI.
///   * `adb_unreachable` — fallback ADB path also failed. Likely
///     ADB pairing is broken; retry on next launch.
///   * `dispatch_rejected` — platform refused (out-of-bounds,
///     malformed, target window not focusable).

import type { Bridge } from './bridge.js';
import { BaseFamilyController, type InvokeFamilyOptions } from './family-controller.js';

export interface GestureResult {
  dispatched: boolean;
  reason?: string;
}

export interface GestureTapOptions {
  displayId: number;
  x: number;
  y: number;
}

export interface GestureSwipeOptions {
  displayId: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  /** Total swipe duration in ms. Default 300. */
  durationMs?: number;
}

export interface GestureLongPressOptions {
  displayId: number;
  x: number;
  y: number;
  /** Hold duration in ms. Default 800. */
  durationMs?: number;
}

export class GestureController extends BaseFamilyController {
  constructor(bridge: Bridge) {
    super(bridge, 'gesture');
  }

  async tap(opts: GestureTapOptions, invokeOpts: InvokeFamilyOptions = {}): Promise<GestureResult> {
    return this.invoke<GestureResult>(
      'tap',
      {
        displayId: opts.displayId,
        x: Math.round(opts.x),
        y: Math.round(opts.y),
      },
      invokeOpts,
    );
  }

  async swipe(
    opts: GestureSwipeOptions,
    invokeOpts: InvokeFamilyOptions = {},
  ): Promise<GestureResult> {
    return this.invoke<GestureResult>(
      'swipe',
      {
        displayId: opts.displayId,
        fromX: Math.round(opts.fromX),
        fromY: Math.round(opts.fromY),
        toX: Math.round(opts.toX),
        toY: Math.round(opts.toY),
        durationMs: opts.durationMs ?? 300,
      },
      invokeOpts,
    );
  }

  async longPress(
    opts: GestureLongPressOptions,
    invokeOpts: InvokeFamilyOptions = {},
  ): Promise<GestureResult> {
    return this.invoke<GestureResult>(
      'longPress',
      {
        displayId: opts.displayId,
        x: Math.round(opts.x),
        y: Math.round(opts.y),
        durationMs: opts.durationMs ?? 800,
      },
      invokeOpts,
    );
  }
}
