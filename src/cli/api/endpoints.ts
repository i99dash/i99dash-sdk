import { z } from 'zod';
import { MiniAppManifestSchema, type MiniAppManifest } from '../../types/index.js';

import type { ApiClient } from './client.js';

/// Per-route helpers. Keeps the response-validation parsers in one
/// place so a CLI command that needs `getDevMe` doesn't redefine the
/// shape locally.

// SDK-facing endpoints emit camelCase (matching /mini-apps/upload-url,
// /submit, /mine), even though the rest of the backend uses
// snake_case for the car-side surfaces. Picked for consistency with
// the TypeScript SDK's own types in @i99dash/sdk-types — we never
// want a field the CLI sees under two spellings.
//
// `email` is nullable — a Telegram-primary user who hasn't linked
// email yet still has an identity, just no email address. The CLI
// renders `"<no email>"` in that case.
const DevMeSchema = z.object({
  email: z.string().email().nullable(),
  devId: z.string().min(1),
  displayName: z.string().nullable().optional(),
  isDeveloper: z.boolean(),
});
export type DevMe = z.infer<typeof DevMeSchema>;

export async function getDevMe(api: ApiClient): Promise<DevMe> {
  return api.get('/api/v1/dev/me', (body) => DevMeSchema.parse(body));
}

const UploadUrlResponseSchema = z.object({
  uploadUrl: z.string().url(),
  bundleId: z.string().min(1),
  expiresAt: z.string().optional(),
});
export type UploadUrlResponse = z.infer<typeof UploadUrlResponseSchema>;

export interface UploadUrlRequest {
  appId: string;
  contentLength: number;
  sha256: string;
}

export async function requestUploadUrl(
  api: ApiClient,
  req: UploadUrlRequest,
): Promise<UploadUrlResponse> {
  return api.post('/api/v1/mini-apps/upload-url', req, (body) =>
    UploadUrlResponseSchema.parse(body),
  );
}

const SubmitResponseSchema = z.object({
  ok: z.literal(true),
  reviewStatus: z.enum(['pending', 'auto-approved']),
  publishedAt: z.string().optional(),
});
export type SubmitResponse = z.infer<typeof SubmitResponseSchema>;

export async function submitManifest(
  api: ApiClient,
  manifest: MiniAppManifest,
  bundleId: string,
): Promise<SubmitResponse> {
  return api.post(
    '/api/v1/mini-apps/submit',
    { manifest: MiniAppManifestSchema.parse(manifest), bundleId },
    (body) => SubmitResponseSchema.parse(body),
  );
}

const MyAppsSchema = z.object({
  apps: z.array(
    z.object({
      manifest: MiniAppManifestSchema,
      status: z.string(),
      version: z.string(),
      updatedAt: z.string().optional(),
    }),
  ),
});
export type MyApps = z.infer<typeof MyAppsSchema>;

export async function listMyApps(api: ApiClient): Promise<MyApps> {
  return api.get('/api/v1/mini-apps/mine', (body) => MyAppsSchema.parse(body));
}

/// Revoke the API key that authenticated this request. Powers
/// `i99dash logout --revoke` — the CLI doesn't know its own
/// key_id locally, so the backend resolves it from the Bearer
/// header and revokes that specific row. Returns void (204 on
/// success); the caller swallows non-2xx so logout never errors.
export async function revokeCurrentKey(api: ApiClient): Promise<void> {
  await api.post('/api/v1/dev/keys/me/revoke', {}, () => undefined);
}

// ---------------------------------------------------------------------------
// Beta-track endpoints
// ---------------------------------------------------------------------------

/// Promote a specific version to the beta track for an app.
export async function promoteAppToBeta(
  api: ApiClient,
  appId: string,
  version: string,
  releaseNotes?: string,
): Promise<void> {
  await api.post(
    `/api/v1/dev/apps/${encodeURIComponent(appId)}/beta/promote`,
    { version, ...(releaseNotes !== undefined ? { releaseNotes } : {}) },
    () => undefined,
  );
}

/// Clear the beta track pointer — sets beta_bundle_id back to NULL.
export async function demoteAppBeta(api: ApiClient, appId: string): Promise<void> {
  await api.delete(`/api/v1/dev/apps/${encodeURIComponent(appId)}/beta`, () => undefined);
}

/// Copy the current beta bundle into the production track.
export async function promoteAppToProduction(api: ApiClient, appId: string): Promise<void> {
  await api.post(
    `/api/v1/dev/apps/${encodeURIComponent(appId)}/promote-production`,
    {},
    () => undefined,
  );
}

const TesterSchema = z.object({
  userId: z.string().min(1),
  telegramUsername: z.string(),
  status: z.enum(['invited', 'accepted', 'revoked']),
  invitedAt: z.string(),
  acceptedAt: z.string().nullable().optional(),
  revokedAt: z.string().nullable().optional(),
});
export type Tester = z.infer<typeof TesterSchema>;

const TestersResponseSchema = z.object({
  testers: z.array(TesterSchema),
});

/// List the tester roster for an app.
export async function listTesters(api: ApiClient, appId: string): Promise<Tester[]> {
  const res = await api.get(`/api/v1/dev/apps/${encodeURIComponent(appId)}/testers`, (body) =>
    TestersResponseSchema.parse(body),
  );
  return res.testers;
}

/// Invite a single tester by Telegram username.
/// The backend always returns 200 even when the username isn't resolved yet
/// (account-enumeration mitigation). We print a generic "invite recorded"
/// message — only the `beta testers` roster reveals actual status.
export async function inviteTester(
  api: ApiClient,
  appId: string,
  telegramUsername: string,
): Promise<void> {
  await api.post(
    `/api/v1/dev/apps/${encodeURIComponent(appId)}/testers`,
    { telegramUsername },
    () => undefined,
  );
}

/// Invite multiple testers in one request. The backend applies the same
/// account-enumeration mitigation as the single-invite endpoint.
export async function inviteTestersBatch(
  api: ApiClient,
  appId: string,
  telegramUsernames: string[],
): Promise<void> {
  await api.post(
    `/api/v1/dev/apps/${encodeURIComponent(appId)}/testers/batch`,
    { telegramUsernames },
    () => undefined,
  );
}

/// Remove (revoke) a specific tester by their user_id.
export async function revokeTester(api: ApiClient, appId: string, userId: string): Promise<void> {
  await api.delete(
    `/api/v1/dev/apps/${encodeURIComponent(appId)}/testers/${encodeURIComponent(userId)}`,
    () => undefined,
  );
}

const BetaStatusSchema = z.object({
  appId: z.string(),
  betaActive: z.boolean(),
  betaVersion: z.string().nullable(),
  betaBundleSha256: z.string().nullable(),
  betaExpiresAt: z.string().nullable(),
  daysUntilExpiry: z.number().int().nullable(),
  betaReleaseNotes: z.string().nullable(),
  lastPublishedAt: z.string().nullable(),
  testerCount: z.number().int().nonnegative(),
  testerCap: z.number().int().nonnegative(),
});
export type BetaStatus = z.infer<typeof BetaStatusSchema>;

/// Single-call snapshot of an app's beta-track state. Composes
/// manifest pointers + bundle SHA + tester count so `beta status` and
/// the dev-portal Testing tab don't make 3 round trips just to render
/// the status block. Always returns a row when the caller owns the
/// app (with `betaActive: false` when no beta is running).
export async function getBetaStatus(api: ApiClient, appId: string): Promise<BetaStatus> {
  return api.get(`/api/v1/dev/apps/${encodeURIComponent(appId)}/beta/status`, (body) =>
    BetaStatusSchema.parse(body),
  );
}

// ---------------------------------------------------------------------------
// Developer-lifecycle snapshot — `i99dash status` consumes this.
// Backend: ``app/api/v1/dev_status/schemas.py:DevStatusOut`` (Pydantic).
// Drift between the two shapes is caught at integration-test time.
// ---------------------------------------------------------------------------

const DevStatusAppSchema = z.object({
  appId: z.string().min(1),
  latestVersion: z.string(),
  reviewStatus: z.string(),
  rejectionReason: z.string().nullable().optional(),
  lastPublishedAt: z.string().nullable().optional(),
  betaActive: z.boolean(),
  betaVersion: z.string().nullable().optional(),
});
export type DevStatusApp = z.infer<typeof DevStatusAppSchema>;

const DevStatusKeySchema = z.object({
  label: z.string(),
  lastUsedAt: z.string().nullable().optional(),
});
export type DevStatusKey = z.infer<typeof DevStatusKeySchema>;

const DevStatusSchema = z.object({
  isDeveloper: z.boolean(),
  hasPendingRequest: z.boolean(),
  apps: z.array(DevStatusAppSchema),
  appsTotal: z.number(),
  keys: z.array(DevStatusKeySchema),
  lastNotificationAttempt: z.string().nullable().optional(),
  lastNotificationError: z.string().nullable().optional(),
});
export type DevStatus = z.infer<typeof DevStatusSchema>;

/// One round-trip lifecycle snapshot. ``appId`` filters the apps
/// list server-side so the response stays small for power devs.
export async function getDevStatus(api: ApiClient, appId?: string): Promise<DevStatus> {
  const path = appId
    ? `/api/v1/dev/status?app_id=${encodeURIComponent(appId)}`
    : '/api/v1/dev/status';
  return api.get(path, (body) => DevStatusSchema.parse(body));
}

// ── Phase G — privilege-tier upgrade flow ─────────────────────────────

const CatalogEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  tier: z.number().int(),
  requiresStepUp: z.boolean(),
  operations: z.array(z.string()),
  grantedGrantId: z.string().uuid().nullable().optional(),
  grantedVinScope: z.unknown().nullable().optional(),
  grantedExpiresAt: z.string().nullable().optional(),
  pendingRequestId: z.string().uuid().nullable().optional(),
});
export type CatalogEntry = z.infer<typeof CatalogEntrySchema>;

const CatalogResponseSchema = z.object({
  items: z.array(CatalogEntrySchema),
  catalogVersion: z.number().int(),
});
export type CatalogResponse = z.infer<typeof CatalogResponseSchema>;

const PermRequestRowSchema = z.object({
  id: z.string().uuid(),
  permissionId: z.string(),
  requestedVinScope: z.unknown(),
  requestedExpiresAt: z.string().nullable().optional(),
  justification: z.string(),
  status: z.string(),
  submittedAt: z.string(),
  reviewedAt: z.string().nullable().optional(),
  reviewReason: z.string().nullable().optional(),
  grantedGrantId: z.string().uuid().nullable().optional(),
});
export type PermRequestRow = z.infer<typeof PermRequestRowSchema>;

const PermRequestListResponseSchema = z.object({
  items: z.array(PermRequestRowSchema),
});
export type PermRequestListResponse = z.infer<typeof PermRequestListResponseSchema>;

export async function getDevPermsCatalog(api: ApiClient): Promise<CatalogResponse> {
  return api.get('/api/v1/dev/permissions/catalog', (body) => CatalogResponseSchema.parse(body));
}

export async function listMyPermRequests(api: ApiClient): Promise<PermRequestListResponse> {
  return api.get('/api/v1/dev/perm-requests', (body) => PermRequestListResponseSchema.parse(body));
}

/// Pull a fresh cert envelope. Called from the post-login hook so the
/// CLI's local cert reflects any newly-granted perms automatically.
/// Body is a plain ``{ cert, certHash, expiresAt, permissionCount }``
/// envelope; the CLI just needs to write the encoded cert to the
/// keychain — server-side does all signing.
///
/// Endpoint lives under the ``admin-perms`` router prefix on the
/// backend (``app/api/v1/admin_perms/routes.py:235``). The earlier
/// CLI release pointed at ``/api/v1/dev/cert/issue`` (404) and the
/// schema expected ``encoded`` rather than ``cert`` — both wrong.
/// Fixed here so the post-login refresh stops emitting
/// "couldn't refresh cert (Not Found)".
export async function issueCert(
  api: ApiClient,
): Promise<{ cert: string; certHash: string; expiresAt: string; permissionCount: number }> {
  const Schema = z.object({
    cert: z.string(),
    certHash: z.string(),
    expiresAt: z.string(),
    permissionCount: z.number(),
  });
  return api.post('/api/v1/admin-perms/dev/cert/issue', undefined, (body) => Schema.parse(body));
}

const RegisterBundleResponseSchema = z.object({
  id: z.string().uuid(),
  appId: z.string(),
  version: z.string(),
  bundleSha256: z.string(),
  certHash: z.string(),
  manifestUrl: z.string(),
  registeredAt: z.string(),
  withdrawnAt: z.string().nullable().optional(),
});
export type RegisterBundleResponse = z.infer<typeof RegisterBundleResponseSchema>;

export interface RegisterBundleRequest {
  appId: string;
  version: string;
  bundleSha256: string;
  certHash: string;
  manifestUrl: string;
}

/// Bind a published bundle to the dev's active cert. Required for any
/// app that declares ``cmdExec.*`` permissions — the privileged install
/// orchestrator on the host reads ``registered_bundles`` to learn which
/// cert hash to verify against. Versions are append-only; re-publishing
/// the same ``(appId, version)`` returns 409.
export async function registerBundle(
  api: ApiClient,
  req: RegisterBundleRequest,
): Promise<RegisterBundleResponse> {
  return api.post('/api/v1/admin-perms/admin/bundles', req, (body) =>
    RegisterBundleResponseSchema.parse(body),
  );
}
