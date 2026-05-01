/// Sealed error hierarchy for the runtime.
///
/// Typed errors exist so consumers can distinguish "my mini-app isn't
/// running in a host" (common dev-time mistake) from "the bridge
/// itself blew up" (rare, needs an issue). `callApi` protocol failures
/// (`{success: false, error}`) are NOT thrown — they're first-class
/// data the caller chooses to handle.
///
/// Every concrete subclass exposes:
///   - `name`     — class name, survives minification.
///   - `code`     — stable string id, safe to switch on. Documented
///                  in `docs/api-ref/errors.md`.
///   - `docsUrl`  — repo-relative path to the matching docs section.
///   - `cause`    — original underlying error when wrapped, per the
///                  ES2022 `Error` cause spec. Walk it for full
///                  stack context.

const DOCS_BASE = 'docs/api-ref/errors.md';

/// Stable, switch-safe identifiers. Add new entries as a non-breaking
/// change; never reuse or repurpose an existing one.
export type SDKErrorCode =
  | 'NOT_INSIDE_HOST'
  | 'BRIDGE_TRANSPORT'
  | 'BRIDGE_TIMEOUT'
  | 'INVALID_RESPONSE'
  | 'CAR_STATUS_UNAVAILABLE'
  | 'CAR_STATUS_QUOTA_EXCEEDED'
  | 'CALL_API_FAILED'
  | 'MEDIA_UNAVAILABLE'
  | 'CLIMATE_UNAVAILABLE'
  | 'VEHICLE_DIAGNOSTICS_UNAVAILABLE'
  | 'VEHICLE_ENVIRONMENT_UNAVAILABLE'
  | 'SYSTEM_UNAVAILABLE'
  | 'CONNECTIVITY_UNAVAILABLE'
  | 'LOCATION_UNAVAILABLE'
  | 'NAVIGATION_UNAVAILABLE';

export abstract class SDKError extends Error {
  // Custom class names survive minification gotchas better via this
  // pattern than `this.constructor.name`.
  override readonly name: string;
  /// Stable identifier — safe to switch on from consumer code.
  /// Typed as `string` (not `SDKErrorCode`) so downstream packages
  /// like `@i99dash/admin-sdk` can extend the hierarchy with their
  /// own codes while still using the same base class.
  readonly code: string;
  /// Repo-relative docs path — e.g. `docs/api-ref/errors.md#bridge_timeout`.
  /// Always populated; intended for inclusion in error pages and dev
  /// tooling. Not a fully-qualified URL because the same SDK ships in
  /// docs at multiple bases (npm, GitHub, internal).
  readonly docsUrl: string;
  constructor(
    name: string,
    code: string,
    docsUrl: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = name;
    this.code = code;
    this.docsUrl = docsUrl;
  }
}

/// No host bridge reachable from the current global scope.
///
/// Fires when:
///   - `window` is undefined (SSR, Node, web worker);
///   - the host global isn't present on `window` — your app isn't
///     running inside the i99dash host.
///
/// In dev, use `@i99dash/sdk-dev-server` which provides a local host
/// so the client can run outside a real car.
export class NotInsideHostError extends SDKError {
  constructor(detail: string) {
    super(
      'NotInsideHostError',
      'NOT_INSIDE_HOST',
      `${DOCS_BASE}#not_inside_host`,
      `mini-app SDK: no host bridge — ${detail} (see ${DOCS_BASE}#not_inside_host)`,
    );
  }
}

/// The bridge itself threw or rejected. Distinct from a protocol
/// failure, which is carried inside the `CallApiResponse` envelope.
export class BridgeTransportError extends SDKError {
  constructor(message: string, cause: unknown) {
    super(
      'BridgeTransportError',
      'BRIDGE_TRANSPORT',
      `${DOCS_BASE}#bridge_transport`,
      `${message} (see ${DOCS_BASE}#bridge_transport)`,
      { cause },
    );
  }
}

/// The bridge didn't respond within the configured timeout.
/// Default 10s; override per call via `timeoutMs`.
export class BridgeTimeoutError extends SDKError {
  readonly operation: string;
  readonly timeoutMs: number;
  constructor(operation: string, timeoutMs: number) {
    super(
      'BridgeTimeoutError',
      'BRIDGE_TIMEOUT',
      `${DOCS_BASE}#bridge_timeout`,
      `${operation} timed out after ${timeoutMs}ms (see ${DOCS_BASE}#bridge_timeout)`,
    );
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }
}

/// The host returned a payload that didn't match the expected schema
/// (`MiniAppContextSchema` for `getContext`, the `{success, ...}`
/// envelope for `callApi`). Almost always means a version drift
/// between the SDK and the host.
export class InvalidResponseError extends SDKError {
  constructor(detail: string, cause: unknown) {
    super(
      'InvalidResponseError',
      'INVALID_RESPONSE',
      `${DOCS_BASE}#invalid_response`,
      `invalid host response: ${detail} (see ${DOCS_BASE}#invalid_response)`,
      { cause },
    );
  }
}

/// The bridge in use does not implement the car-status capability.
///
/// Fires from `client.car.getStatus()` / `onStatusChange` when the
/// underlying bridge isn't a `CarStatusBridge` (e.g. a unit-test
/// `Bridge` stub, an older host that hasn't shipped the handlers
/// yet). Catch + render a "car status unavailable on this device"
/// fallback rather than treating it as a crash — the rest of the
/// SDK keeps working.
export class CarStatusUnavailableError extends SDKError {
  constructor(detail: string) {
    super(
      'CarStatusUnavailableError',
      'CAR_STATUS_UNAVAILABLE',
      `${DOCS_BASE}#car_status_unavailable`,
      `car status not available — ${detail} (see ${DOCS_BASE}#car_status_unavailable)`,
    );
  }
}

/// Per-mini-app subscriber cap (default 10) was exceeded. The
/// idiomatic pattern is one logical listener per mini-app, holding
/// the unsubscribe fn for cleanup. If you're hitting this, you have
/// a leak (forgot to call `off()` on remount) — not a need for a
/// higher cap.
export class CarStatusQuotaExceededError extends SDKError {
  readonly limit: number;
  constructor(limit: number) {
    super(
      'CarStatusQuotaExceededError',
      'CAR_STATUS_QUOTA_EXCEEDED',
      `${DOCS_BASE}#car_status_quota_exceeded`,
      `too many car-status subscriptions for this mini-app ` +
        `(limit ${limit}); store the unsubscribe fn from a previous ` +
        `onStatusChange and call it before subscribing again ` +
        `(see ${DOCS_BASE}#car_status_quota_exceeded)`,
    );
    this.limit = limit;
  }
}

/// `callApi` returned a `{success: false, error}` envelope and the
/// caller used `callApiOrThrow` to lift it to an exception. The
/// envelope's structured error code is preserved on `errorCode` so
/// `try/catch` consumers can still branch on it.
///
/// Prefer plain `callApi` for happy/sad-path symmetric code; reach for
/// `callApiOrThrow` when the failure is genuinely exceptional and you
/// don't want envelope-unwrap noise on every call site.
export class CallApiFailedError extends SDKError {
  /// The `error.code` from the protocol envelope — e.g.
  /// `'disallowed_path'`, `'http_4xx'`, `'timeout'`. Stable, switch-safe.
  readonly errorCode: string;
  constructor(errorCode: string, message: string) {
    super(
      'CallApiFailedError',
      'CALL_API_FAILED',
      `${DOCS_BASE}#call_api_failed`,
      `callApi failed [${errorCode}]: ${message} (see ${DOCS_BASE}#call_api_failed)`,
    );
    this.errorCode = errorCode;
  }
}

/// The bridge in use does not implement the media capability.
///
/// Fires from `client.media.getSnapshot()` / `onChange` when the
/// underlying bridge isn't a `MediaBridge` (older host that pre-dates
/// the `media.read` family, unit-test stub). Catch + render a
/// "media unavailable on this device" fallback rather than treating
/// it as a crash — same DX contract as `CarStatusUnavailableError`.
export class MediaUnavailableError extends SDKError {
  constructor(detail: string) {
    super(
      'MediaUnavailableError',
      'MEDIA_UNAVAILABLE',
      `${DOCS_BASE}#media_unavailable`,
      `media not available — ${detail} (see ${DOCS_BASE}#media_unavailable)`,
    );
  }
}

/// The bridge does not implement the `climate.read` family.
export class ClimateUnavailableError extends SDKError {
  constructor(detail: string) {
    super(
      'ClimateUnavailableError',
      'CLIMATE_UNAVAILABLE',
      `${DOCS_BASE}#climate_unavailable`,
      `climate not available — ${detail} (see ${DOCS_BASE}#climate_unavailable)`,
    );
  }
}

/// The bridge does not implement the `vehicle.diagnostics` family.
export class VehicleDiagnosticsUnavailableError extends SDKError {
  constructor(detail: string) {
    super(
      'VehicleDiagnosticsUnavailableError',
      'VEHICLE_DIAGNOSTICS_UNAVAILABLE',
      `${DOCS_BASE}#vehicle_diagnostics_unavailable`,
      `vehicle.diagnostics not available — ${detail} ` +
        `(see ${DOCS_BASE}#vehicle_diagnostics_unavailable)`,
    );
  }
}

/// The bridge does not implement the `vehicle.environment` family.
export class VehicleEnvironmentUnavailableError extends SDKError {
  constructor(detail: string) {
    super(
      'VehicleEnvironmentUnavailableError',
      'VEHICLE_ENVIRONMENT_UNAVAILABLE',
      `${DOCS_BASE}#vehicle_environment_unavailable`,
      `vehicle.environment not available — ${detail} ` +
        `(see ${DOCS_BASE}#vehicle_environment_unavailable)`,
    );
  }
}

/// The bridge does not implement the `system.read` family.
export class SystemUnavailableError extends SDKError {
  constructor(detail: string) {
    super(
      'SystemUnavailableError',
      'SYSTEM_UNAVAILABLE',
      `${DOCS_BASE}#system_unavailable`,
      `system not available — ${detail} (see ${DOCS_BASE}#system_unavailable)`,
    );
  }
}

/// The bridge does not implement the `connectivity.read` family.
export class ConnectivityUnavailableError extends SDKError {
  constructor(detail: string) {
    super(
      'ConnectivityUnavailableError',
      'CONNECTIVITY_UNAVAILABLE',
      `${DOCS_BASE}#connectivity_unavailable`,
      `connectivity not available — ${detail} ` + `(see ${DOCS_BASE}#connectivity_unavailable)`,
    );
  }
}

/// The bridge does not implement the `location.read` family. Distinct
/// from `permission_denied` which fires *after* the bridge accepts a
/// call and the host's consent gate rejects it — this means the host
/// build doesn't expose location at all (older host, unit-test stub).
export class LocationUnavailableError extends SDKError {
  constructor(detail: string) {
    super(
      'LocationUnavailableError',
      'LOCATION_UNAVAILABLE',
      `${DOCS_BASE}#location_unavailable`,
      `location not available — ${detail} (see ${DOCS_BASE}#location_unavailable)`,
    );
  }
}

/// The bridge does not implement the `nav.read` family.
export class NavigationUnavailableError extends SDKError {
  constructor(detail: string) {
    super(
      'NavigationUnavailableError',
      'NAVIGATION_UNAVAILABLE',
      `${DOCS_BASE}#navigation_unavailable`,
      `navigation not available — ${detail} (see ${DOCS_BASE}#navigation_unavailable)`,
    );
  }
}
