import { z } from 'zod';

/// What's currently producing audio in the cabin. Abstract enum — the
/// host decides which underlying source maps to which value. Mini-apps
/// branching on this never see OEM-specific identifiers.
export const MediaSourceSchema = z.enum([
  /// Bluetooth-connected phone (the common case).
  'bluetooth',
  /// USB stick / wired iPhone-style source.
  'usb',
  /// Aux line-in.
  'aux',
  /// Built-in radio (FM/AM/DAB depending on region).
  'radio',
  /// "Quiet" — the host reports no source playing.
  'none',
  /// Anything the host couldn't classify into the above. Mini-apps
  /// should treat this as "playing something I don't know about" and
  /// hide source-specific UI.
  'other',
]);
export type MediaSource = z.infer<typeof MediaSourceSchema>;

/// Transport state of the active source.
export const MediaPlayStateSchema = z.enum(['playing', 'paused', 'stopped']);
export type MediaPlayState = z.infer<typeof MediaPlayStateSchema>;

/// Read-only snapshot of what's playing in the cabin, plus the audio
/// destination's volume.
///
/// Strict-by-construction: extra fields fail validation. Schema
/// evolution follows the same per-family discipline as `CarStatus` —
/// fields are added in lockstep with telemetry data showing the
/// existing surface is genuinely insufficient. See
/// `docs/adr/0001-mini-app-bridge-architecture.md` (in the host repo)
/// for the policy.
///
/// Field shape choices:
///   - `title` / `artist` / `album` are nullable strings: the host
///     reports `null` rather than `''` when the source doesn't
///     publish metadata (e.g. live radio without RDS).
///   - `artUrl` is similarly nullable; some sources never produce art.
///   - `volume` is normalised to `0..1`. The host scales whatever
///     the underlying device reports (e.g. 0..30 on some head units)
///     into this range, so apps render a single consistent slider.
///   - `at` is the host's wall-clock at capture. Convenient for
///     "is this stale?" calculations on the consumer side.
export const MediaSnapshotSchema = z
  .object({
    title: z.string().nullable(),
    artist: z.string().nullable(),
    album: z.string().nullable(),
    /// HTTPS URL to the album art if the source publishes one.
    /// Renderable directly from a `<img>`. The host fetches +
    /// caches; the URL is host-side, not the original CDN — so
    /// the bundle never reaches the source's tracking pixels.
    artUrl: z.string().url().nullable(),
    state: MediaPlayStateSchema,
    source: MediaSourceSchema,
    /// 0.0–1.0 (inclusive). Normalised across whatever scale the
    /// underlying source uses.
    volume: z.number().min(0).max(1),
    /// ISO-8601 timestamp the host captured this snapshot. UTC.
    at: z.string().min(1),
  })
  .strict();

export type MediaSnapshot = z.infer<typeof MediaSnapshotSchema>;
