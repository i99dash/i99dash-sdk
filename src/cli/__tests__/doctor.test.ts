import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runDoctor } from '../commands/doctor.js';
import { UsageError } from '../util/errors.js';

const validManifest = {
  id: 'fuel_prices',
  name: { en: 'Fuel Prices' },
  icon: './assets/icon.svg',
  url: 'https://miniapps.i99dash.app/fuel/',
  version: '1.0.0',
  category: 'services',
};

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doctor-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('runDoctor', () => {
  it('passes on a canonical project (no fixtures, dev-server skipped)', async () => {
    await writeFile(join(dir, 'manifest.json'), JSON.stringify(validManifest));
    await expect(runDoctor({ cwd: dir, skipDevServer: true })).resolves.not.toThrow();
  });

  it('fails when manifest is invalid', async () => {
    await writeFile(join(dir, 'manifest.json'), JSON.stringify({ id: 'X' }));
    await expect(runDoctor({ cwd: dir, skipDevServer: true })).rejects.toBeInstanceOf(UsageError);
  });

  it('fails when a fixture is malformed JSON', async () => {
    await writeFile(join(dir, 'manifest.json'), JSON.stringify(validManifest));
    await mkdir(join(dir, 'mocks'));
    await writeFile(join(dir, 'mocks', 'broken.json'), '{ not json');
    await expect(runDoctor({ cwd: dir, skipDevServer: true })).rejects.toBeInstanceOf(UsageError);
  });

  it('passes with a valid Fixture envelope (the wrapped {match, response} shape)', async () => {
    await writeFile(join(dir, 'manifest.json'), JSON.stringify(validManifest));
    await mkdir(join(dir, 'mocks'));
    await writeFile(
      join(dir, 'mocks', 'ok.json'),
      JSON.stringify({
        match: { path: '/api/v1/fuel-stations', method: 'GET' },
        response: { success: true, data: { stations: [] } },
      }),
    );
    await expect(runDoctor({ cwd: dir, skipDevServer: true })).resolves.not.toThrow();
  });

  it('fails when a fixture is the bare CallApiResponse shape (missing match)', async () => {
    // Regression: the scaffold writes wrapped fixtures and FixtureStore
    // parses wrapped fixtures, so doctor must reject the bare envelope
    // even though it parses as a CallApiResponse.
    await writeFile(join(dir, 'manifest.json'), JSON.stringify(validManifest));
    await mkdir(join(dir, 'mocks'));
    await writeFile(
      join(dir, 'mocks', 'bare.json'),
      JSON.stringify({ success: true, data: { stations: [] } }),
    );
    await expect(runDoctor({ cwd: dir, skipDevServer: true })).rejects.toBeInstanceOf(UsageError);
  });

  it('fails when a fixture is not a Fixture envelope', async () => {
    await writeFile(join(dir, 'manifest.json'), JSON.stringify(validManifest));
    await mkdir(join(dir, 'mocks'));
    await writeFile(join(dir, 'mocks', 'wrong-shape.json'), JSON.stringify({ foo: 'bar' }));
    await expect(runDoctor({ cwd: dir, skipDevServer: true })).rejects.toBeInstanceOf(UsageError);
  });
});
