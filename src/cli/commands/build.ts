import { spawn } from 'node:child_process';
import { cp, mkdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadManifest, loadSdkConfig } from '../config/load.js';
import { formatIssue, validateAssets } from '../util/assets.js';
import { LocalIOError } from '../util/errors.js';
import { logger } from '../util/logger.js';

export class BuildAssetsMissingError extends LocalIOError {
  override name = 'BuildAssetsMissingError' as const;
}

export interface BuildOptions {
  cwd: string;
  out?: string;
}

/// Build a mini-app bundle.
///
/// Two paths:
///   1. `sdk.config.json.buildCommand` set → run it (framework build).
///   2. Otherwise → copy `appRoot/` → `distDir/` unchanged (vanilla HTML).
///
/// Always copies `manifest.json` into `distDir` so the tarball is
/// self-describing on the server side.
export async function runBuild(opts: BuildOptions): Promise<string> {
  const cfg = await loadSdkConfig(opts.cwd);
  const distDir = resolve(opts.cwd, opts.out ?? cfg.distDir);

  if (cfg.buildCommand) {
    logger.info(`running build command: ${cfg.buildCommand}`);
    await runShell(cfg.buildCommand, opts.cwd);
  } else {
    const src = resolve(opts.cwd, cfg.appRoot);
    if (!existsSync(src)) {
      throw new LocalIOError(`appRoot does not exist: ${src}`);
    }
    await mkdir(distDir, { recursive: true });
    await cp(src, distDir, { recursive: true });
    logger.info(`copied ${src} → ${distDir}`);
  }

  // Always stamp manifest.json into dist so publish has a
  // canonical file to pick up.
  const manifestSrc = resolve(opts.cwd, 'manifest.json');
  const manifestDst = resolve(distDir, 'manifest.json');
  await copyFile(manifestSrc, manifestDst);

  // Authoritative asset check against the BUILD output. The manifest's
  // relative paths must resolve inside distDir — that's the tree the
  // publish tarball ships, and the only place the backend will look
  // when it re-extracts. A framework that didn't copy public/ correctly
  // surfaces here, with a clear error.
  const manifest = await loadManifest(opts.cwd);
  const issues = await validateAssets(manifest, { rootDir: distDir });
  if (issues.length > 0) {
    for (const i of issues) logger.error(formatIssue(i));
    throw new BuildAssetsMissingError(
      `manifest declares ${issues.length} asset(s) that aren't in dist — ` +
        `for framework projects, the file probably needs to live in your public/ folder ` +
        `(e.g. public/assets/icon.svg for a Next.js icon path of ./assets/icon.svg).`,
    );
  }

  logger.success(`build complete → ${distDir}`);
  return distDir;
}

function runShell(command: string, cwd: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    // `shell: true` runs the command through the system shell — matches
    // how npm-run scripts invoke it. Stdout/stderr stream through so
    // the dev sees real build output.
    const child = spawn(command, { shell: true, cwd, stdio: 'inherit' });
    child.on('exit', (code) => {
      if (code === 0) resolvePromise();
      else reject(new LocalIOError(`build command exited with ${code ?? 'null'}`));
    });
    child.on('error', (err) => reject(new LocalIOError('build command failed to spawn', err)));
  });
}
