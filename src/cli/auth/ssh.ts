/// Client-side SSH-key signing for `i99dash login`.
///
/// Loads the user's OpenSSH **ed25519 private key** (via `sshpk`, which
/// also handles passphrase-protected keys), derives the `SHA256:`
/// fingerprint the server stores, and signs the login challenge nonce
/// with a raw ed25519 signature (Node `crypto`). Only the public key +
/// signature ever leave the machine; the private key never does. This
/// replaces the old OAuth device-code login.

import { createHash, createPrivateKey, sign as cryptoSign } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { PrivateKey } from 'sshpk';
// sshpk is a CommonJS module: a static named import
// (`import { parsePrivateKey }`) throws "Named export not found" once the
// CLI is bundled to ESM (dist/cli.js). Read the export off the default
// (module.exports) import instead, which Node's CJS interop guarantees.
import sshpk from 'sshpk';

const { parsePrivateKey } = sshpk;

/// ssh-keygen's default ed25519 key location.
export const DEFAULT_KEY_PATH = '~/.ssh/id_ed25519';

export class SshKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SshKeyError';
  }
}

/// The key is passphrase-protected and none was supplied.
export class SshKeyEncryptedError extends SshKeyError {
  constructor(path: string) {
    super(`${path} is passphrase-protected`);
    this.name = 'SshKeyEncryptedError';
  }
}

function expandHome(p: string): string {
  return p.startsWith('~') ? join(homedir(), p.slice(1)) : p;
}

export interface LoadedKey {
  publicOpenssh: string;
  fingerprint: string;
  sign(message: Buffer): Buffer;
}

/// Load an OpenSSH ed25519 private key at `keyPath` (or the default).
/// Throws `SshKeyEncryptedError` when it needs a passphrase.
export function loadKey(keyPath?: string, passphrase?: string): LoadedKey {
  const p = expandHome(keyPath ?? DEFAULT_KEY_PATH);
  if (!existsSync(p)) {
    throw new SshKeyError(
      `no ssh key at ${p}. Generate one with \`ssh-keygen -t ed25519\`, ` +
        `then register the public key in the web console.`,
    );
  }
  const data = readFileSync(p);

  let key: PrivateKey;
  try {
    key = parsePrivateKey(data, 'ssh', passphrase ? { passphrase } : undefined);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!passphrase && /encrypt|passphrase|password/i.test(msg)) {
      throw new SshKeyEncryptedError(p);
    }
    throw new SshKeyError(`could not load ${p}: ${msg}`);
  }
  if (key.type !== 'ed25519') {
    throw new SshKeyError(`${p} is not an ed25519 key (only ed25519 is supported)`);
  }

  const publicOpenssh = key.toPublic().toString('ssh');
  const b64 = publicOpenssh.split(' ')[1];
  if (!b64) {
    throw new SshKeyError(`could not derive a public key from ${p}`);
  }
  const blob = Buffer.from(b64, 'base64');
  const fingerprint =
    'SHA256:' + createHash('sha256').update(blob).digest('base64').replace(/=+$/, '');

  // sshpk parses the OpenSSH key; Node `crypto` does the (verified-raw)
  // ed25519 signing the server checks. We bridge by building the
  // *canonical* ed25519 PKCS#8 DER ourselves from the 32-byte private
  // seed: sshpk's own `toBuffer('pkcs8')` emits an ed25519 structure
  // that OpenSSL 3 (Node 20+/CI) rejects with ERR_OSSL_UNSUPPORTED,
  // whereas the OID-prefixed DER below is portable across OpenSSL 1.1/3.
  const kData = (key as unknown as { part: { k: { data: Buffer } } }).part.k.data;
  // OpenSSH stores ed25519 private as seed(32)||public(32); the PKCS#8
  // OCTET STRING is just the 32-byte seed (the leading 32 bytes).
  const seed = kData.length >= 32 ? kData.subarray(0, 32) : kData;
  if (seed.length !== 32) {
    throw new SshKeyError(`unexpected ed25519 private key size in ${p}`);
  }
  const pkcs8 = Buffer.concat([
    Buffer.from('302e020100300506032b657004220420', 'hex'), // ed25519 PKCS#8 prefix
    seed,
  ]);
  const nodeKey = createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' });

  return {
    publicOpenssh,
    fingerprint,
    sign: (message: Buffer): Buffer => cryptoSign(null, message, nodeKey),
  };
}
