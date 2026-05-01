/// Public surface of ``@i99dash/admin-sdk``. Phase-9 simplified —
/// the cap-management surface is gone; the host owns it.

export {
  AdminClient,
  UnknownTemplateError,
  type AdminClientContext,
  type AdminClientOptions,
  type InvokeOptions,
} from './client.js';

export {
  FakeAdminBridge,
  HostAdminBridge,
  type AdminBridge,
  type AdminExecRequest,
} from './bridge.js';

// Re-exported from the public SDK — admin-sdk callers can ``catch``
// these without importing both packages.
export { BridgeTimeoutError, BridgeTransportError, NotInsideHostError } from '../runtime/index.js';

export {
  snapshotFromList,
  type AdminOpResponse,
  type CapabilityResponse,
  type CatalogSnapshot,
  type CommandTemplate,
  type ParamRule,
} from './types.js';
