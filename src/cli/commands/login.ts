import open from 'open';
import { BackendDeviceCodeClient } from '../auth/device-code.js';
import { saveAccessToken } from '../auth/session.js';
import { getKeychain } from '../auth/keychain.js';
import { OAUTH_CLIENT_ID, resolvedBackendUrl } from '../config/paths.js';
import { logger } from '../util/logger.js';
import { ServerError } from '../util/errors.js';

export interface LoginOptions {
  noOpen: boolean;
  /// CI mode — don't even attempt the device-code flow. Callers that
  /// set `I99DASH_API_KEY` bypass `login` entirely; this flag is just
  /// an explicit "don't poll anything" toggle for scripts that
  /// accidentally invoked `login`.
  ci: boolean;
}

export async function runLogin(opts: LoginOptions): Promise<void> {
  if (opts.ci) {
    logger.info('`--ci` passed; set I99DASH_API_KEY in env instead of running login.');
    return;
  }

  const client = new BackendDeviceCodeClient(resolvedBackendUrl(), OAUTH_CLIENT_ID);

  logger.info('requesting device code…');
  const grant = await client.authorize();

  const url = grant.verification_uri_complete ?? grant.verification_uri;
  logger.box(
    [`open this URL in a browser:`, `  ${url}`, `and enter the code:`, `  ${grant.user_code}`].join(
      '\n',
    ),
  );

  if (!opts.noOpen) {
    await open(url).catch(() => {
      logger.warn(`couldn't open browser automatically; visit ${url} manually.`);
    });
  }

  logger.start('waiting for authorization…');
  let token: string;
  try {
    token = await client.pollToken(grant.device_code, grant.interval, grant.expires_in);
  } catch (err) {
    if (err instanceof ServerError && err.apiCode === 'access_denied') {
      logger.error('authorization denied in the browser.');
      throw err;
    }
    throw err;
  }

  await saveAccessToken(token);
  const store = await getKeychain();
  logger.success(
    store.isSecure
      ? 'logged in — API key stored in OS keychain.'
      : 'logged in — API key stored in config file (0600).',
  );

  // Phase G — post-login cert refresh. Pull a fresh IssuedCert envelope
  // so the local cert reflects any newly-granted cmdExec.* perms (a
  // dev whose request was approved between sessions sees the new
  // capabilities here without a separate command). Best-effort — a
  // failure here doesn't fail the login, just logs a hint.
  try {
    const { ApiClient } = await import('../api/client.js');
    const { issueCert } = await import('../api/endpoints.js');
    const { saveCertHash } = await import('../auth/cert.js');
    const api = new ApiClient(resolvedBackendUrl(), token);
    const cert = await issueCert(api);
    await saveCertHash({
      certHash: cert.certHash,
      expiresAt: cert.expiresAt,
      permissionCount: cert.permissionCount,
    });
    logger.info(
      `cert refreshed (${cert.permissionCount} perms, hash=${cert.certHash.slice(0, 12)}…).`,
    );
    // sdk-workflow/cli.md §6 — when the dev re-mints a cert (e.g.
    // because an admin just granted a new permission), every device
    // that has the privileged mini-app installed still holds the OLD
    // cert hash on its install row. The dispatcher's template lookup
    // keys on that hash → privileged invokes return `unknown_template`
    // until the device re-installs. Surface the advisory once at
    // login time so the dev knows to reinstall rather than chase
    // ghost errors.
    logger.info(
      'Privileged mini-apps already installed on a device keep their old cert ' +
        'until the user re-installs them (the install row stamps the cert hash ' +
        'at install time). To verify a real install end-to-end, uninstall + ' +
        'reinstall the app on the head unit.',
    );
  } catch (err) {
    logger.warn(
      `couldn't refresh cert (${(err as Error).message}); run \`i99dash perms\` to verify your grants.`,
    );
  }
}
