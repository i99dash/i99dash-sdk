import { Command } from 'commander';
import {
  promoteAppToBeta,
  demoteAppBeta,
  promoteAppToProduction,
  listTesters,
  inviteTester,
  inviteTestersBatch,
  revokeTester,
  getBetaStatus,
} from '../api/endpoints.js';
import { ApiClient } from '../api/client.js';
import { requireAccessToken } from '../auth/session.js';
import { resolvedBackendUrl } from '../config/paths.js';
import { UsageError } from '../util/errors.js';
import { logger } from '../util/logger.js';

/// Build and return the `beta` parent command subtree.
/// Registered in src/index.ts via `program.addCommand(makeBetaCommand())`.
export function makeBetaCommand(): Command {
  const beta = new Command('beta').description('manage the beta testing track for a mini-app');

  // -------------------------------------------------------------------------
  // beta promote <app_id> <version>
  // -------------------------------------------------------------------------
  beta
    .command('promote <app_id> <version>')
    .description('promote <version> of <app_id> to the beta track')
    .option('--release-notes <text>', 'brief notes shown to testers in the consent sheet')
    .action(async (appId: string, version: string, opts: { releaseNotes?: string }) => {
      const api = await makeApi();
      logger.start(`promoting ${appId}@${version} to beta…`);
      await promoteAppToBeta(api, appId, version, opts.releaseNotes);
      logger.success(
        `${appId}@${version} is now on the beta track` +
          (opts.releaseNotes ? ' (release notes saved)' : ''),
      );
    });

  // -------------------------------------------------------------------------
  // beta demote <app_id>
  // -------------------------------------------------------------------------
  beta
    .command('demote <app_id>')
    .description('clear the beta track for <app_id> (testers lose access)')
    .action(async (appId: string) => {
      const api = await makeApi();
      logger.start(`demoting beta track for ${appId}…`);
      await demoteAppBeta(api, appId);
      logger.success(`beta track cleared for ${appId}`);
    });

  // -------------------------------------------------------------------------
  // beta promote-production <app_id>
  // -------------------------------------------------------------------------
  beta
    .command('promote-production <app_id>')
    .description('copy the current beta bundle into the production track for <app_id>')
    .action(async (appId: string) => {
      const api = await makeApi();
      logger.start(`promoting beta to production for ${appId}…`);
      await promoteAppToProduction(api, appId);
      logger.success(`${appId} beta is now on the production track`);
    });

  // -------------------------------------------------------------------------
  // beta testers <app_id>
  // -------------------------------------------------------------------------
  beta
    .command('testers <app_id>')
    .description('list the tester roster for <app_id>')
    .action(async (appId: string) => {
      const api = await makeApi();
      const testers = await listTesters(api, appId);
      if (testers.length === 0) {
        logger.info('No testers enrolled yet.');
        return;
      }
      // Header row
      const header = padRow(['USER ID', 'TELEGRAM', 'STATUS', 'INVITED AT', 'ACCEPTED AT']);
      logger.log(header);
      logger.log('-'.repeat(header.length));
      for (const t of testers) {
        logger.log(
          padRow([
            t.userId,
            `@${t.telegramUsername}`,
            t.status,
            fmtDate(t.invitedAt),
            t.acceptedAt ? fmtDate(t.acceptedAt) : '—',
          ]),
        );
      }
    });

  // -------------------------------------------------------------------------
  // beta invite <app_id> <telegram_username>
  // -------------------------------------------------------------------------
  beta
    .command('invite <app_id> <telegram_username>')
    .description('invite a single tester by Telegram username')
    .action(async (appId: string, telegramUsername: string) => {
      const api = await makeApi();
      // Strip a leading @ if the user typed it — we normalise here so
      // the backend always receives the bare username.
      const username = telegramUsername.replace(/^@/, '');
      logger.start(`inviting @${username} as a tester for ${appId}…`);
      await inviteTester(api, appId, username);
      // The backend always returns 200 regardless of whether the user
      // exists (account-enumeration mitigation). Print a neutral message.
      logger.success(`Invite recorded for @${username}.`);
    });

  // -------------------------------------------------------------------------
  // beta invite-batch <app_id> <username1> [username2 ...] or comma-separated
  // -------------------------------------------------------------------------
  beta
    .command('invite-batch <app_id> [usernames...]')
    .description(
      'invite multiple testers at once; pass usernames as separate args or comma-separated',
    )
    .action(async (appId: string, rawUsernames: string[]) => {
      if (rawUsernames.length === 0) {
        throw new UsageError('provide at least one Telegram username');
      }
      // Accept both "user1,user2" and "user1 user2".
      const usernames = rawUsernames
        .flatMap((u) => u.split(','))
        .map((u) => u.trim().replace(/^@/, ''))
        .filter((u) => u.length > 0);
      if (usernames.length === 0) {
        throw new UsageError('no valid usernames found after parsing');
      }
      const api = await makeApi();
      logger.start(`inviting ${usernames.length} tester(s) for ${appId}…`);
      await inviteTestersBatch(api, appId, usernames);
      logger.success(`Invites recorded for ${usernames.length} user(s).`);
    });

  // -------------------------------------------------------------------------
  // beta revoke <app_id> <user_id>
  // -------------------------------------------------------------------------
  beta
    .command('revoke <app_id> <user_id>')
    .description('remove a tester from <app_id> by their user_id (see `beta testers`)')
    .action(async (appId: string, userId: string) => {
      const api = await makeApi();
      logger.start(`revoking tester ${userId} from ${appId}…`);
      await revokeTester(api, appId, userId);
      logger.success(`Tester ${userId} removed from ${appId}.`);
    });

  // -------------------------------------------------------------------------
  // beta status <app_id>
  // -------------------------------------------------------------------------
  beta
    .command('status <app_id>')
    .description('print a one-shot status block for the beta track of <app_id>')
    .action(async (appId: string) => {
      const api = await makeApi();
      const s = await getBetaStatus(api, appId);

      if (!s.betaActive) {
        logger.info(`${appId} — no beta track active.`);
        if (s.lastPublishedAt) {
          logger.log(`  last_publish: ${fmtDate(s.lastPublishedAt)}`);
        }
        logger.log(`  testers:      ${s.testerCount} active`);
        return;
      }

      const versionLabel = s.betaVersion ? `${appId} @ ${s.betaVersion}` : appId;
      logger.log(versionLabel);
      logger.log(`  status:       ACTIVE (beta-track)`);
      if (s.betaBundleSha256) {
        logger.log(`  bundle_sha:   ${s.betaBundleSha256.slice(0, 12)}…`);
      }
      if (s.betaExpiresAt && s.daysUntilExpiry !== null) {
        const expiryLabel = s.betaExpiresAt.slice(0, 10);
        const dayWord = s.daysUntilExpiry === 1 ? 'day' : 'days';
        logger.log(`  expires:      ${expiryLabel} (${s.daysUntilExpiry} ${dayWord})`);
      }
      logger.log(`  testers:      ${s.testerCount} / ${s.testerCap} active`);
      if (s.lastPublishedAt) {
        logger.log(`  last_publish: ${fmtDate(s.lastPublishedAt)}`);
      }
      if (s.betaReleaseNotes) {
        logger.log(`  release_notes:`);
        for (const line of s.betaReleaseNotes.split('\n')) {
          logger.log(`    ${line}`);
        }
      }
    });

  return beta;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

async function makeApi(): Promise<ApiClient> {
  const token = await requireAccessToken();
  return new ApiClient(resolvedBackendUrl(), token);
}

/// Fixed-width column table renderer. Each column is padded to the
/// length of the longest value we typically see, keeping the output
/// readable without a full table library.
const COL_WIDTHS = [36, 24, 10, 20, 20];

function padRow(cells: string[]): string {
  return cells.map((cell, i) => cell.padEnd(COL_WIDTHS[i] ?? 12)).join('  ');
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  } catch {
    return iso;
  }
}
