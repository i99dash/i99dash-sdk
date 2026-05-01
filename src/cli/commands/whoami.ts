import { ApiClient } from '../api/client.js';
import { getDevMe } from '../api/endpoints.js';
import { requireAccessToken } from '../auth/session.js';
import { resolvedBackendUrl } from '../config/paths.js';
import { logger } from '../util/logger.js';

export async function runWhoami(): Promise<void> {
  const token = await requireAccessToken();
  const api = new ApiClient(resolvedBackendUrl(), token);
  const me = await getDevMe(api);
  logger.info(`logged in as ${me.email ?? '<no email>'}  (devId=${me.devId})`);
}
