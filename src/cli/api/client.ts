import { NetworkError, ServerError } from '../util/errors.js';

/// Typed thin wrapper over fetch for talking to the i99dash backend.
/// Adds:
///   - `Authorization: Bearer <token>` automatically,
///   - JSON request/response handling,
///   - `{success, data, error, meta}` envelope unwrap,
///   - NetworkError / ServerError normalisation,
///   - response-schema validation at the call site (caller supplies
///     a parser).
///
/// Kept deliberately small — no retries, no circuit-breaker. The
/// publish command composes this with its own retry policy so that
/// idempotent vs. non-idempotent calls can't get accidentally mixed
/// up.
export class ApiClient {
  private readonly fetchFn: typeof fetch;
  constructor(
    private readonly backendUrl: string,
    private readonly token: string,
    fetchFn?: typeof fetch,
  ) {
    this.fetchFn = fetchFn ?? fetch;
  }

  async get<T>(path: string, parse: (body: unknown) => T): Promise<T> {
    return this.request('GET', path, undefined, parse);
  }

  async post<T>(path: string, body: unknown, parse: (body: unknown) => T): Promise<T> {
    return this.request('POST', path, body, parse);
  }

  async delete<T>(path: string, parse: (body: unknown) => T): Promise<T> {
    return this.request('DELETE', path, undefined, parse);
  }

  /// Direct PUT used for presigned-URL uploads. Intentionally does
  /// not add the Authorization header — the presigned URL is the
  /// only credential the storage backend accepts.
  async putRaw(url: string, body: Uint8Array | Buffer, contentType: string): Promise<void> {
    let res: Response;
    try {
      res = await this.fetchFn(url, {
        method: 'PUT',
        headers: { 'content-type': contentType },
        // Node 22's lib.dom.d.ts narrowed BodyInit to exclude bare
        // Uint8Array<ArrayBufferLike>; an explicit cast through
        // ArrayBuffer keeps the call portable across Node versions.
        body: body as unknown as BodyInit,
      });
    } catch (cause) {
      throw new NetworkError(`failed to PUT presigned URL`, cause);
    }
    if (!res.ok) {
      // Surface the S3-side reason (XML body) — without this, every
      // upload failure looks identical and operators have to grep
      // backend logs to figure out whether it was a signature
      // mismatch, expired URL, ACL denial, etc. Truncate so a
      // verbose error doesn't blow up the terminal.
      let detail = '';
      try {
        const body = (await res.text()).trim();
        if (body) detail = `: ${body.slice(0, 600)}`;
      } catch {
        /* body read can fail; non-fatal */
      }
      throw new ServerError(res.status, undefined, `presigned PUT returned ${res.status}${detail}`);
    }
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body: unknown,
    parse: (body: unknown) => T,
  ): Promise<T> {
    const url = `${this.backendUrl.replace(/\/$/, '')}${path}`;
    let res: Response;
    try {
      res = await this.fetchFn(url, {
        method,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.token}`,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (cause) {
      throw new NetworkError(`failed to ${method} ${path}`, cause);
    }

    const contentType = res.headers.get('content-type') ?? '';
    const payload = contentType.includes('application/json')
      ? await res.json().catch(() => ({}))
      : {};

    if (!res.ok) {
      const apiCode =
        payload && typeof payload === 'object' && payload !== null && 'error' in payload
          ? String((payload as { error?: { code?: string } }).error?.code ?? 'unknown')
          : undefined;
      const message =
        payload && typeof payload === 'object' && payload !== null && 'error' in payload
          ? String((payload as { error?: { message?: string } }).error?.message ?? res.statusText)
          : res.statusText;
      throw new ServerError(res.status, apiCode, message);
    }

    // Unwrap the backend's `{success, data, error, meta}` envelope when
    // it's present. Endpoints that return bare JSON (the OAuth routes,
    // which must stay RFC 8628 spec-shape) pass through unchanged.
    return parse(unwrapEnvelope(payload));
  }
}

function unwrapEnvelope(body: unknown): unknown {
  if (
    body !== null &&
    typeof body === 'object' &&
    'success' in body &&
    'data' in body &&
    'error' in body
  ) {
    return (body as { data: unknown }).data;
  }
  return body;
}
