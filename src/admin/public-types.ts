/// Type-only entry point for `i99dash`.
///
/// `import type { ... } from 'i99dash'` lets a
/// consumer reference admin-sdk shapes (e.g. in shared schema or
/// server-rendered glue) without pulling in any runtime code.
///
/// All re-exports here are `type` re-exports; the emitted JS bundle
/// is empty.
export type { AdminClientContext, AdminClientOptions, InvokeOptions } from './client.js';

export type { AdminBridge, AdminExecRequest } from './bridge.js';

export type {
  AdminOpResponse,
  CapabilityResponse,
  CatalogSnapshot,
  CommandTemplate,
  ParamRule,
} from './types.js';
