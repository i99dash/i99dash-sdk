import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type * as PathsModule from '../config/paths.js';
import { runPublish } from '../commands/publish.js';
import { UsageError } from '../util/errors.js';

// ---------------------------------------------------------------------------
// Module mocks — keep tests fast and hermetic.
// ---------------------------------------------------------------------------

// Auth: always return a fake token.
vi.mock('../auth/session.js', () => ({
  requireAccessToken: vi.fn().mockResolvedValue('fake-token'),
}));

// Config: fixed backend URL; also export projectPaths so load.ts doesn't break.
vi.mock('../config/paths.js', async (importOriginal) => {
  const actual = await importOriginal<PathsModule>();
  return {
    ...actual,
    resolvedBackendUrl: () => 'https://api.test',
  };
});

// Build: pretend we already have a built bundle by returning the temp dir.
// The path is resolved from the test file, so it's ../commands/build.js
// (one level up, then into commands/).
vi.mock('../commands/build.js', () => ({
  runBuild: vi.fn().mockResolvedValue(undefined),
}));

// Validate: no-op. The test is about publish-track mechanics. Validate
// runs network checks (`getDevStatus`) that would consume the fetch
// mock queue and throw the per-test fetch counts off — outside the
// scope of what these tests actually exercise.
vi.mock('../commands/validate.js', () => ({
  runValidate: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Fetch mock that records calls and returns success envelopes.
// ---------------------------------------------------------------------------
type FetchRecord = { url: string; method: string; body: string };

let fetchCalls: FetchRecord[] = [];

function setupFetchMock(responses: Array<{ status: number; body: unknown }>) {
  let i = 0;
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    fetchCalls.push({
      url: url.toString(),
      method: init?.method ?? 'GET',
      body: (init?.body as string) ?? '',
    });
    const r = responses[i++];
    if (!r) throw new Error('ran out of fetch responses');
    return new Response(JSON.stringify(r.body), {
      status: r.status,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GOOD_MANIFEST = JSON.stringify({
  id: 'beta_test_app',
  name: { en: 'Beta Test App' },
  icon: './assets/icon.svg',
  url: 'https://miniapps.i99dash.app/beta/',
  version: '1.1.0',
  category: 'services',
});

const UPLOAD_URL_RESPONSE = {
  status: 200,
  body: {
    success: true,
    data: { uploadUrl: 'https://storage.test/put', bundleId: 'bundle-abc' },
    error: null,
  },
};
const PUT_RESPONSE = { status: 200, body: {} };
const SUBMIT_RESPONSE = {
  status: 200,
  body: {
    success: true,
    data: { ok: true, reviewStatus: 'auto-approved', publishedAt: '2025-01-01T00:00:00Z' },
    error: null,
  },
};
const BETA_PROMOTE_RESPONSE = {
  status: 200,
  body: { success: true, data: null, error: null },
};

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'publish-beta-'));
  fetchCalls = [];
  // Write manifest
  await writeFile(join(dir, 'manifest.json'), GOOD_MANIFEST);
  // Write a minimal dist dir so the tarball step has something to pack.
  await writeFile(join(dir, 'index.html'), '<html></html>');
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runPublish --track beta', () => {
  it('calls beta/promote after submit when track=beta', async () => {
    setupFetchMock([UPLOAD_URL_RESPONSE, PUT_RESPONSE, SUBMIT_RESPONSE, BETA_PROMOTE_RESPONSE]);

    await runPublish({
      cwd: dir,
      bundle: dir, // skip build step, treat dir itself as the bundle
      dryRun: false,
      track: 'beta',
    });

    // Should have made 4 requests: upload-url, PUT, submit, beta/promote.
    expect(fetchCalls).toHaveLength(4);
    const promoteCall = fetchCalls[3];
    expect(promoteCall?.url).toContain('/beta/promote');
    expect(promoteCall?.method).toBe('POST');
    const body = JSON.parse(promoteCall?.body ?? '{}') as { version?: string };
    expect(body.version).toBe('1.1.0');
  });

  it('includes release notes in the promote request when provided', async () => {
    setupFetchMock([UPLOAD_URL_RESPONSE, PUT_RESPONSE, SUBMIT_RESPONSE, BETA_PROMOTE_RESPONSE]);

    await runPublish({
      cwd: dir,
      bundle: dir,
      dryRun: false,
      track: 'beta',
      releaseNotes: 'Fixed dark mode',
    });

    const promoteCall = fetchCalls[3];
    const body = JSON.parse(promoteCall?.body ?? '{}') as {
      version?: string;
      releaseNotes?: string;
    };
    expect(body.releaseNotes).toBe('Fixed dark mode');
  });

  it('does NOT call beta/promote when track=production (default)', async () => {
    setupFetchMock([UPLOAD_URL_RESPONSE, PUT_RESPONSE, SUBMIT_RESPONSE]);

    await runPublish({
      cwd: dir,
      bundle: dir,
      dryRun: false,
      track: 'production',
    });

    // Only 3 calls: upload-url, PUT, submit — no promote.
    expect(fetchCalls).toHaveLength(3);
    for (const call of fetchCalls) {
      expect(call.url).not.toContain('/beta/promote');
    }
  });

  it('does NOT call beta/promote on dry-run even with track=beta', async () => {
    // No fetch mock needed — dry-run exits before any network call.
    await runPublish({
      cwd: dir,
      bundle: dir,
      dryRun: true,
      track: 'beta',
    });

    expect(fetchCalls).toHaveLength(0);
  });

  it('throws UsageError when --release-notes is used with production track', async () => {
    await expect(
      runPublish({
        cwd: dir,
        bundle: dir,
        dryRun: false,
        track: 'production',
        releaseNotes: 'should not be here',
      }),
    ).rejects.toBeInstanceOf(UsageError);
  });
});
