/// HTTP client for the SSH-key login challenge/verify against the
/// i99dash backend (`/api/v1/auth/ssh/{challenge,verify}`). Both are
/// public (no bearer) and return the standard `{success,data,error}`
/// envelope — unlike the removed device-code endpoints, which were
/// spec-raw. Network errors funnel through [NetworkError]; protocol
/// errors through [ServerError] (carrying the backend `error.code`).

import { z } from 'zod';
import { NetworkError, ServerError } from '../util/errors.js';

interface Envelope {
  success?: boolean;
  data?: unknown;
  error?: { code?: string; message?: string } | null;
}

export class SshLoginClient {
  private readonly fetchFn: typeof fetch;

  constructor(
    private readonly backendUrl: string,
    fetchFn?: typeof fetch,
  ) {
    this.fetchFn = fetchFn ?? fetch;
  }

  /// Ask for a one-time nonce bound to this key's fingerprint.
  async challenge(fingerprint: string): Promise<string> {
    const data = await this.post('/api/v1/auth/ssh/challenge', { fingerprint });
    return z.object({ nonce: z.string().min(1) }).parse(data).nonce;
  }

  /// Trade the signature over the nonce for an access token.
  async verify(nonce: string, signatureBase64: string): Promise<string> {
    const data = await this.post('/api/v1/auth/ssh/verify', {
      nonce,
      signature: signatureBase64,
    });
    return z.object({ access_token: z.string().min(1) }).parse(data).access_token;
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const url = this.backendUrl.replace(/\/$/, '') + path;
    let resp: Response;
    try {
      resp = await this.fetchFn(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new NetworkError(`could not reach ${this.backendUrl}`, err);
    }
    const json = (await resp.json().catch(() => null)) as Envelope | null;
    if (!resp.ok || !json?.success) {
      throw new ServerError(
        resp.status,
        json?.error?.code,
        json?.error?.message ?? `HTTP ${resp.status}`,
      );
    }
    return json.data;
  }
}
