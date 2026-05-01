import { z } from 'zod';
import { Backoff, sleep } from '../util/backoff.js';
import { NetworkError, ServerError } from '../util/errors.js';

const AuthorizeResponseSchema = z.object({
  device_code: z.string().min(1),
  user_code: z.string().min(1),
  verification_uri: z.string().url(),
  verification_uri_complete: z.string().url().optional(),
  expires_in: z.number().int().positive(),
  interval: z.number().int().positive(),
});

const TokenOkSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().default('Bearer'),
  // Accept null too — RFC 8628 §3.5 says expires_in is optional, and
  // some servers serialise "absent" as `null` rather than omitting
  // the field. `.nullish()` covers both null and undefined; the
  // value is informational only (the API key is long-lived; this is
  // hint metadata for clients that want to refresh proactively).
  expires_in: z.number().int().positive().nullish(),
});

const TokenErrorSchema = z.object({
  error: z.string(),
  error_description: z.string().optional(),
});

export type AuthorizeResponse = z.infer<typeof AuthorizeResponseSchema>;

export interface DeviceCodeClient {
  authorize(): Promise<AuthorizeResponse>;
  pollToken(
    deviceCode: string,
    intervalHintSeconds: number,
    expiresInSeconds: number,
  ): Promise<string>;
}

/// HTTP client for RFC 8628 (OAuth Device Authorization Grant) against
/// the i99dash backend. Kept narrow — no refresh-token support in v1
/// (devs re-run `login` on expiry, the server mints a fresh
/// long-lived key).
///
/// All network errors funnel through [NetworkError]; protocol errors
/// through [ServerError]. The polling loop honours `slow_down` by
/// doubling its base delay per RFC 8628 §3.5.
export class BackendDeviceCodeClient implements DeviceCodeClient {
  private readonly fetchFn: typeof fetch;
  constructor(
    private readonly backendUrl: string,
    private readonly clientId: string,
    fetchFn?: typeof fetch,
  ) {
    this.fetchFn = fetchFn ?? fetch;
  }

  // Both OAuth endpoints live under /api/v1/oauth/device/* so they
  // share the prefix the rest of the i99dash API uses. RFC 8628 is
  // agnostic about the exact paths — clients just use whatever the
  // backend advertises via verification_uri + the token endpoint.
  async authorize(): Promise<AuthorizeResponse> {
    const res = await this.post('/api/v1/oauth/device/authorize', {
      client_id: this.clientId,
    });
    const parsed = AuthorizeResponseSchema.safeParse(res.body);
    if (!parsed.success) {
      throw new ServerError(res.status, 'invalid_response', parsed.error.message);
    }
    return parsed.data;
  }

  async pollToken(
    deviceCode: string,
    intervalHintSeconds: number,
    expiresInSeconds: number,
  ): Promise<string> {
    const deadline = Date.now() + expiresInSeconds * 1000;
    const backoff = new Backoff({
      baseMs: intervalHintSeconds * 1000,
      ceilingMs: 30_000,
    });

    while (Date.now() < deadline) {
      await sleep(backoff.nextDelayMs());
      const res = await this.post('/api/v1/oauth/device/token', {
        client_id: this.clientId,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      });

      if (res.status >= 200 && res.status < 300) {
        const ok = TokenOkSchema.safeParse(res.body);
        if (!ok.success) {
          throw new ServerError(res.status, 'invalid_response', ok.error.message);
        }
        return ok.data.access_token;
      }

      // Device-code spec uses 400 with `error` field for expected
      // pending/slow_down responses. Any other status → hard fail.
      const err = TokenErrorSchema.safeParse(res.body);
      if (!err.success) {
        throw new ServerError(res.status, 'invalid_response', JSON.stringify(res.body));
      }
      switch (err.data.error) {
        case 'authorization_pending':
          continue;
        case 'slow_down':
          backoff.bumpBase();
          continue;
        case 'expired_token':
          throw new ServerError(res.status, err.data.error, 'device code expired — re-run `login`');
        case 'access_denied':
          // Two paths land here:
          //   1. User explicitly clicked Deny — re-run login to retry.
          //   2. User isn't a developer yet — the website's devices
          //      page rejected the approval and pointed them at the
          //      request-access form. Surface both possibilities so
          //      the user knows their next step without re-reading
          //      the docs.
          throw new ServerError(
            res.status,
            err.data.error,
            'authorization denied. ' +
              "If you don't have developer access yet, request it at " +
              'https://dev.i99dash.app/developers/request-access ' +
              'and re-run `i99dash login` once an admin approves.',
          );
        default:
          throw new ServerError(
            res.status,
            err.data.error,
            err.data.error_description ?? err.data.error,
          );
      }
    }
    throw new ServerError(408, 'timeout', 'device authorization timed out');
  }

  private async post(
    path: string,
    body: Record<string, string>,
  ): Promise<{ status: number; body: unknown }> {
    const url = `${this.backendUrl.replace(/\/$/, '')}${path}`;
    let res: Response;
    try {
      res = await this.fetchFn(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(body).toString(),
      });
    } catch (cause) {
      throw new NetworkError(`failed to POST ${path}`, cause);
    }
    const contentType = res.headers.get('content-type') ?? '';
    const payload = contentType.includes('application/json')
      ? await res.json().catch(() => ({}))
      : {};
    return { status: res.status, body: payload };
  }
}
