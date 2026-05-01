import { ApiClient } from '../api/client.js';
import { revokeCurrentKey } from '../api/endpoints.js';
import { clearAccessToken, requireAccessToken } from '../auth/session.js';
import { resolvedBackendUrl } from '../config/paths.js';
import { logger } from '../util/logger.js';

export interface LogoutOptions {
  /// Also call the backend to revoke the API key, not just delete the
  /// local copy. Without this, the local file/keychain entry is
  /// removed but the key remains valid server-side until it ages out
  /// (which is "never" today — keys are long-lived). Recommended for
  /// shared / lost / suspected-compromised machines.
  revoke: boolean;
}

export async function runLogout(opts: LogoutOptions): Promise<void> {
  if (opts.revoke) {
    // Try to revoke first. If the local token is missing or already
    // invalid, treat as already-logged-out and skip — no point
    // erroring at the user. Other errors (network, etc.) surface
    // a warning but still clear the local copy so the user isn't
    // stuck in a half-state.
    try {
      const token = await requireAccessToken();
      const api = new ApiClient(resolvedBackendUrl(), token);
      await revokeCurrentKey(api);
      logger.success('API key revoked on server.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`could not revoke server-side key: ${msg}`);
      logger.warn('clearing local copy anyway — manage keys at /developers/keys.');
    }
  }
  await clearAccessToken();
  logger.success('logged out — local credential removed.');
}
