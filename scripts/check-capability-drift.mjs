#!/usr/bin/env node
/**
 * Verifies that the canonical vehicle-capability taxonomy in this SDK
 * is in sync with the copies that ship in:
 *   * `car-i99dash/lib/core/car/vehicle_capability.dart`
 *   * `car-i99dash/android/app/src/main/kotlin/com/i99dev/i99dash/car/VehicleCapability.kt`
 *   * `backend-i99dash/app/domain/vehicle_capabilities/constants.py`
 *
 * Order matters — bit positions are derived from array index. A reorder
 * silently changes every persisted bitmask. The check parses each
 * mirror file with a deliberately-strict regex so a typo in any
 * downstream copy fails the SDK PR.
 *
 * Usage:
 *   node scripts/check-capability-drift.mjs
 *
 * Override paths via env vars when running outside the monorepo:
 *   CAR_REPO_PATH=/path/to/car-i99dash
 *   BACKEND_REPO_PATH=/path/to/backend-i99dash
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const SDK_FILE = join(ROOT, 'src', 'types', 'vehicle-capabilities.ts');
const CAR_REPO = process.env.CAR_REPO_PATH ?? resolve(ROOT, '..', 'car-i99dash');
const BACKEND_REPO = process.env.BACKEND_REPO_PATH ?? resolve(ROOT, '..', 'backend-i99dash');

const DART_FILE = join(CAR_REPO, 'lib', 'core', 'car', 'vehicle_capability.dart');
const KOTLIN_FILE = join(
  CAR_REPO,
  'android',
  'app',
  'src',
  'main',
  'kotlin',
  'com',
  'i99dev',
  'i99dash',
  'car',
  'VehicleCapability.kt',
);
const PY_FILE = join(BACKEND_REPO, 'app', 'domain', 'vehicle_capabilities', 'constants.py');

function fail(msg) {
  console.error(`\n❌ vehicle-capability drift: ${msg}\n`);
  process.exit(1);
}

/// Strip line comments (`// ...`) from a multi-line block before
/// pulling string entries — comments can contain stray quote chars
/// (e.g. `L5's` apostrophe) that would otherwise span the entry
/// regex across lines. Normalise CRLF to LF first so the strip
/// regex's `.*` (which doesn't match `\r` in JS) can reach EOL on
/// Windows-checked-out files.
function stripLineComments(s) {
  return s
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

/// Strip Python `# ...` line comments — same rationale as
/// stripLineComments above; Python uses `#` instead of `//`.
function stripPythonComments(s) {
  return s
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/#.*$/, ''))
    .join('\n');
}

/// Pull the SDK list — anchored on the `VEHICLE_CAPABILITIES = [...]
/// as const` block so a stray comment with brackets can't trip the
/// parser. Strip comments first so apostrophes inside them don't
/// confuse the entry regex.
async function loadSdk() {
  const raw = await readFile(SDK_FILE, 'utf8');
  const match = raw.match(/VEHICLE_CAPABILITIES\s*=\s*\[([\s\S]*?)\]\s*as const/);
  if (!match) fail(`couldn't locate VEHICLE_CAPABILITIES in ${SDK_FILE}`);
  return [...stripLineComments(match[1]).matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/// Dart: `const List<String> kVehicleCapabilities = [..., ...];`
async function loadDart() {
  if (!existsSync(DART_FILE)) {
    fail(`expected mirror at ${DART_FILE} — create it from the SDK list.`);
  }
  const raw = await readFile(DART_FILE, 'utf8');
  // Anchor on the open-bracket newline so the inline-doc example
  // `kVehicleCapabilities = <String>[...]` in the comment doesn't
  // hijack the match (it has [...] right after the bracket).
  const match = raw.match(/kVehicleCapabilities\s*=\s*<String>\[\s*\n([\s\S]*?)\];/);
  if (!match) fail(`couldn't locate kVehicleCapabilities in ${DART_FILE}`);
  return [...stripLineComments(match[1]).matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/// Kotlin: `val ALL: List<String> = listOf(..., ...)`
async function loadKotlin() {
  if (!existsSync(KOTLIN_FILE)) {
    fail(`expected mirror at ${KOTLIN_FILE} — create it from the SDK list.`);
  }
  const raw = await readFile(KOTLIN_FILE, 'utf8');
  const match = raw.match(/val\s+ALL\s*:\s*List<String>\s*=\s*listOf\(([\s\S]*?)\)/);
  if (!match) fail(`couldn't locate VehicleCapability.ALL in ${KOTLIN_FILE}`);
  return [...stripLineComments(match[1]).matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/// Python: `VEHICLE_CAPABILITIES: list[str] = [\n ... ]`. Same
/// open-bracket-newline anchor as the Dart loader so the docstring
/// example `VEHICLE_CAPABILITIES = [...]` doesn't hijack the match.
async function loadPython() {
  if (!existsSync(PY_FILE)) {
    fail(`expected mirror at ${PY_FILE} — create it from the SDK list.`);
  }
  const raw = await readFile(PY_FILE, 'utf8');
  const match = raw.match(/VEHICLE_CAPABILITIES[^=]*=\s*\[\s*\n([\s\S]*?)\n\]/);
  if (!match) fail(`couldn't locate VEHICLE_CAPABILITIES in ${PY_FILE}`);
  return [...stripPythonComments(match[1]).matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

const sdk = await loadSdk();
const [dart, kotlin, python] = await Promise.all([loadDart(), loadKotlin(), loadPython()]);

function compare(name, mirror) {
  if (mirror.length !== sdk.length || mirror.some((c, i) => c !== sdk[i])) {
    console.error(`\n❌ ${name} drift\n`);
    console.error(`   SDK   : ${JSON.stringify(sdk)}`);
    console.error(`   ${name.padEnd(6)}: ${JSON.stringify(mirror)}`);
    console.error('\n   sync the mirror (preserve order — bit positions derive from index).\n');
    process.exit(1);
  }
}

compare('Dart', dart);
compare('Kotlin', kotlin);
compare('Python', python);

console.log(
  `✓ vehicle-capability taxonomy in sync (${sdk.length} entries across SDK + Dart + Kotlin + Python).`,
);
