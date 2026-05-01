import { ApiClient } from '../api/client.js';
import {
  getDevPermsCatalog,
  listMyPermRequests,
  type CatalogEntry,
  type PermRequestRow,
} from '../api/endpoints.js';
import { requireAccessToken } from '../auth/session.js';
import { resolvedBackendUrl } from '../config/paths.js';
import { logger } from '../util/logger.js';

/**
 * `i99dash perms` — list the developer-portal capability catalog
 * with this dev's grant + pending-request status per row.
 *
 * Output is a compact terminal report. Mirrors the shape of
 * `i99dash status` so a developer who knows one knows both.
 *
 * Phase G plan: see ``now-use-context7-for-vast-boole.md`` Phase G.7.
 */
export async function runPerms(): Promise<void> {
  const token = await requireAccessToken();
  const api = new ApiClient(resolvedBackendUrl(), token);
  const [catalog, requests] = await Promise.all([getDevPermsCatalog(api), listMyPermRequests(api)]);
  printCatalog(catalog.items);
  if (requests.items.length > 0) {
    logger.info('');
    printMyRequests(requests.items);
  }
}

function printCatalog(items: CatalogEntry[]): void {
  if (items.length === 0) {
    logger.info('No capabilities defined.');
    return;
  }
  logger.info(`Capabilities (${items.length}):`);
  for (const e of items) {
    const status = e.grantedGrantId ? 'GRANTED' : e.pendingRequestId ? 'PENDING' : 'AVAILABLE';
    const tier = `tier ${e.tier}${e.requiresStepUp ? '+step-up' : ''}`;
    logger.info(
      `  ${e.id.padEnd(28)}  [${tier.padEnd(14)}]  ${status.padEnd(10)}  ${e.description}`,
    );
  }
  logger.info('');
  logger.info('Request a capability from the developer portal:');
  logger.info('  https://dev.i99dash.app/developers/permissions');
}

function printMyRequests(items: PermRequestRow[]): void {
  logger.info(`My requests (${items.length}):`);
  for (const r of items) {
    const reviewedSuffix = r.reviewReason ? `  (${r.reviewReason})` : '';
    logger.info(
      `  ${r.permissionId.padEnd(28)}  ${r.status.toUpperCase().padEnd(10)}  ${formatRelative(r.submittedAt)}${reviewedSuffix}`,
    );
  }
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}
