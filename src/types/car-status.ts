/// Real-time car status — wire shape for the host's local push channel.
///
/// **Local only.** This data flows from the host's in-process
/// `carStateProvider` to the WebView via `evaluateJavaScript` — never
/// over the network, never via MQTT. Mini-apps subscribe through
/// `client.car.onStatusChange(...)`; the SDK does the validation.
///
/// # Schema-evolution policy
///
/// This schema currently has 12 fields. To add a 13th, **deprecate
/// and remove an unused field first**. Goal: keep the validated
/// payload bounded so the SDK's per-event Zod parse + the host's
/// per-event JSON encode stay sub-millisecond on a Nexus 5X-class
/// device. If a future feature genuinely needs a wider surface,
/// introduce a separate `CarStatusExtended` schema gated on a new
/// permission scope rather than growing this one.

import { z } from 'zod';

/// Liveness of the payload. The host derives this from `now - at`:
/// fresh < 15 s, stale 15–60 s, very_stale > 60 s. Mini-apps that
/// gate their UI on freshness should switch on this enum rather than
/// computing their own threshold from `at` (the host's clock is
/// authoritative; pages running while the device is suspended would
/// otherwise see misleading "fresh" labels).
export const CarStatusStalenessSchema = z.enum(['fresh', 'stale', 'very_stale']);
export type CarStatusStaleness = z.infer<typeof CarStatusStalenessSchema>;

/// Per-door open/closed state. Each door is optional because the
/// underlying `CarBridge.readStatus()` may not return a value for
/// every door on every poll (older firmware, intermittent CAN
/// signal). Mini-apps must defensive-read and render "unknown" for
/// missing keys, never assume `undefined === 'closed'`.
export const CarDoorStateSchema = z.enum(['open', 'closed']);
export type CarDoorState = z.infer<typeof CarDoorStateSchema>;

export const CarDoorsSchema = z
  .object({
    driver: CarDoorStateSchema.optional(),
    passenger: CarDoorStateSchema.optional(),
    rearLeft: CarDoorStateSchema.optional(),
    rearRight: CarDoorStateSchema.optional(),
  })
  .strict();
export type CarDoors = z.infer<typeof CarDoorsSchema>;

/// One real-time car status snapshot. **Read-only by construction —
/// no actuator fields exist.** A future `CarControl` schema (door
/// lock/unlock, window up/down) would live in a separate file,
/// behind a separate permission scope, and never piggy-back on this.
///
/// `deviceId`, `brand`, `at`, and `staleness` are required so
/// consumers always have something to render and to gate UI on;
/// everything else is optional because the bridge can't guarantee
/// field availability.
///
/// **v4.0 rename:** `bydDeviceId` was renamed to `deviceId` and a
/// sibling `brand` field was added. `deviceId` carries the
/// brand-prefixed canonical form (`byd:BYDMCKLE0PARD8801`,
/// `tesla:5YJ3...`); `brand` is the lowercase brand string that
/// matches the prefix. Hard cutover — no legacy aliases. The
/// pre-v4 `vin` and `bydDeviceId` field names are gone.
/// See MIGRATING.md.
///
/// Strict — extra fields fail validation. This is the security
/// regression fence that prevents an actuator field from being
/// silently honoured if the host accidentally emits one.
export const CarBrandSchema = z.enum(['byd', 'geely', 'nio', 'tesla']);
export type CarBrand = z.infer<typeof CarBrandSchema>;

export const CarStatusSchema = z
  .object({
    /// Brand-prefixed canonical device id, e.g. `byd:BYDMCKLE0PARD8801`.
    /// Routing key everywhere off-device (HTTP paths, MQTT topics
    /// after the brand segment, Redis keys, JSON wire payloads).
    /// URL-encode before substituting into a route — the `:` is
    /// reserved.
    deviceId: z.string().min(1),
    /// Lowercase brand wire string. Always agrees with the prefix in
    /// `deviceId`; carried separately so consumers don't have to
    /// parse the prefix on every read. Mismatch is a validation
    /// error at the wire boundary.
    brand: CarBrandSchema,
    /// ISO-8601 UTC, ``Z`` suffix.
    at: z.string(),
    staleness: CarStatusStalenessSchema,
    isMoving: z.boolean().optional(),
    speedKmh: z.number().min(0).optional(),
    doorsLocked: z.boolean().optional(),
    doors: CarDoorsSchema.optional(),
    batteryPct: z.number().min(0).max(100).optional(),
    charging: z.boolean().optional(),
    acOn: z.boolean().optional(),
  })
  .strict();

export type CarStatus = z.infer<typeof CarStatusSchema>;

/// Connection state — whether the host has fresh data from
/// `CarBridge.readStatus()`. `connected` means the most recent poll
/// succeeded; `disconnected` means the poll has been failing or
/// hasn't completed for >30 s.
///
/// Independent of `CarStatus.staleness` — a parked car with a healthy
/// poll loop is `connected` + `fresh`; a daemon crash mid-session is
/// `disconnected` + `stale`/`very_stale`. Mini-apps should render
/// "no signal" UI on `disconnected` rather than rely on staleness
/// alone.
export const CarConnectionStateSchema = z.enum(['connected', 'disconnected']);
export type CarConnectionState = z.infer<typeof CarConnectionStateSchema>;
