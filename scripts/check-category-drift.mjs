#!/usr/bin/env node
/**
 * Verifies that the canonical category slug list in this SDK is
 * byte-identical to the copy vendored in backend-i99dash. The two
 * MUST stay in sync — Pydantic builds its enum from the backend
 * copy at module init, and any drift produces "category invalid"
 * errors at publish time with no matching client-side hint.
 *
 * Usage:
 *   node scripts/check-category-drift.mjs
 *
 * Override the backend path via env var when running outside the
 * monorepo checkout:
 *   BACKEND_REPO_PATH=/path/to/backend-i99dash node scripts/check-category-drift.mjs
 *
 * Exits non-zero on drift OR when the backend copy is missing —
 * "missing file" is the same failure mode as drift from a CI
 * perspective.
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const SDK_FILE = join(ROOT, 'src', 'types', 'category-slugs.json');
const BACKEND_FILE =
  process.env.BACKEND_REPO_PATH !== undefined
    ? join(
        process.env.BACKEND_REPO_PATH,
        'app',
        'api',
        'v1',
        'mini_apps_publish',
        'category_slugs.json',
      )
    : resolve(
        ROOT,
        '..',
        'backend-i99dash',
        'app',
        'api',
        'v1',
        'mini_apps_publish',
        'category_slugs.json',
      );

function fail(msg) {
  console.error(`\n❌ category-slugs drift: ${msg}\n`);
  process.exit(1);
}

if (!existsSync(BACKEND_FILE)) {
  fail(
    `expected vendored copy at ${BACKEND_FILE} but it does not exist.\n` +
      `   sync the SDK file there (and import it via json.load() in schemas.py).`,
  );
}

const [sdkRaw, backendRaw] = await Promise.all([
  readFile(SDK_FILE, 'utf8'),
  readFile(BACKEND_FILE, 'utf8'),
]);

let sdkSlugs;
let backendSlugs;
try {
  sdkSlugs = JSON.parse(sdkRaw);
  backendSlugs = JSON.parse(backendRaw);
} catch (e) {
  fail(`one of the files is not valid JSON: ${e.message}`);
}

if (!Array.isArray(sdkSlugs) || !sdkSlugs.every((s) => typeof s === 'string')) {
  fail(`SDK file ${SDK_FILE} must be an array of strings`);
}
if (!Array.isArray(backendSlugs) || !backendSlugs.every((s) => typeof s === 'string')) {
  fail(`backend file ${BACKEND_FILE} must be an array of strings`);
}

// Order matters — Pydantic enum values come out in declaration order,
// so a reorder is also drift even though the set is the same.
const sameLength = sdkSlugs.length === backendSlugs.length;
const sameOrder = sameLength && sdkSlugs.every((s, i) => s === backendSlugs[i]);

if (!sameOrder) {
  console.error('\n❌ category-slugs drift detected\n');
  console.error(`   SDK     (${SDK_FILE}):`);
  console.error(`     ${JSON.stringify(sdkSlugs)}`);
  console.error(`   backend (${BACKEND_FILE}):`);
  console.error(`     ${JSON.stringify(backendSlugs)}`);
  console.error('\n   sync the two files (and re-deploy whichever side is behind).\n');
  process.exit(1);
}

console.log(`✓ category-slugs in sync (${sdkSlugs.length} slugs).`);
