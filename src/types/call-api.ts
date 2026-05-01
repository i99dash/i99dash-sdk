import { z } from 'zod';

/// HTTP methods the host's `callApi` bridge accepts. v1 is read-only;
/// extensions here must land in lockstep with the host's own allow-list.
export const ApiMethodSchema = z.enum(['GET']);
export type ApiMethod = z.infer<typeof ApiMethodSchema>;

export const CallApiRequestSchema = z.object({
  /// Server-relative path. Must start with `/` and match one of the
  /// host's allow-listed prefixes — the host rejects everything else
  /// without touching the backend.
  path: z.string().startsWith('/', 'path must start with /'),
  method: ApiMethodSchema,
  /// Optional query parameters. Values are serialised by the host's
  /// `ApiClient`, so any JSON-serialisable scalar is fine; nested
  /// objects are flattened with bracket notation.
  query: z.record(z.string(), z.unknown()).optional(),
});

export type CallApiRequest = z.infer<typeof CallApiRequestSchema>;

/// Response envelope — mirrors the host's bridge protocol exactly.
/// The SDK does NOT throw on `success: false` — protocol-level
/// failures are first-class data the caller chooses to handle.
/// Network / bridge-transport failures (which are genuine errors)
/// throw typed errors from `@i99dash/sdk` instead.
export type CallApiResponse<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

/// Zod-validated version — useful for the dev-server, which receives
/// fixture data and needs to sanity-check author-written JSON.
///
/// Type is left inferred rather than pinned to `CallApiResponse<unknown>`:
/// zod treats `z.unknown()` as optional in the output type, which
/// doesn't match our `{data: T}` contract. Consumers cast to
/// `CallApiResponse<T>` after validation; the envelope shape is
/// already guaranteed by the parse.
export const CallApiResponseSchema = z.union([
  z.object({ success: z.literal(true), data: z.unknown() }),
  z.object({
    success: z.literal(false),
    error: z.object({ code: z.string(), message: z.string() }),
  }),
]);
