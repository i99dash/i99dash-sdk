/// Public library entry for `i99dash` — runtime client, admin client,
/// and wire-shape types in one import. The four old packages (
/// `@i99dash/sdk-types`, `@i99dash/sdk`, `@i99dash/admin-sdk`,
/// `@i99dash/sdk-cli`) are consolidated here; everything they used
/// to export is reachable from this file.
///
/// The CLI (the binary `i99dash`) is bundled separately and exposed
/// via the `i99dash/cli` subpath; library consumers don't pull its
/// Node-only deps into their browser bundle.

// Wire-shape zod schemas + their inferred TypeScript types. Most
// downstream consumers only need the runtime client, but the schemas
// are kept reachable here for tooling that wants to validate
// manifests / contexts directly.
export * from './types/index.js';

// Runtime client (was @i99dash/sdk). Brings every family controller,
// the bridge plumbing, the error types, and `createClientOrSSR`.
export * from './runtime/index.js';

// Admin client (was @i99dash/admin-sdk). Listed explicitly because
// `admin/index.ts` re-exports BridgeTimeoutError / BridgeTransportError /
// NotInsideHostError from runtime — a wildcard re-export here would
// emit duplicate-symbol errors. Admin-only symbols only.
export {
  AdminClient,
  UnknownTemplateError,
  type AdminClientContext,
  type AdminClientOptions,
  type InvokeOptions,
} from './admin/client.js';
export {
  FakeAdminBridge,
  HostAdminBridge,
  type AdminBridge,
  type AdminExecRequest,
} from './admin/bridge.js';
export {
  snapshotFromList,
  type AdminOpResponse,
  type CapabilityResponse,
  type CatalogSnapshot,
  type CommandTemplate,
  type ParamRule,
} from './admin/types.js';
