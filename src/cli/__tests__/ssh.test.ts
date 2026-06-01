import { createPublicKey, verify as cryptoVerify } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generatePrivateKey, parseKey } from 'sshpk';
import { describe, expect, it } from 'vitest';
import { loadKey, SshKeyError } from '../auth/ssh.js';

function writeTempEd25519Key(): string {
  const key = generatePrivateKey('ed25519');
  const dir = mkdtempSync(join(tmpdir(), 'i99-ssh-'));
  const p = join(dir, 'id_ed25519');
  writeFileSync(p, key.toBuffer('ssh-private'));
  return p;
}

describe('loadKey', () => {
  it('loads, fingerprints, and signs verifiably', () => {
    const loaded = loadKey(writeTempEd25519Key());
    expect(loaded.fingerprint).toMatch(/^SHA256:/);
    expect(loaded.publicOpenssh.startsWith('ssh-ed25519 ')).toBe(true);

    const nonce = Buffer.from('server-nonce-123');
    const sig = loaded.sign(nonce);
    expect(sig.length).toBe(64);

    // the raw ed25519 signature verifies against the public key — the
    // same check the backend performs server-side
    const pub = parseKey(loaded.publicOpenssh, 'ssh');
    const nodePub = createPublicKey({ key: pub.toBuffer('pkcs8'), format: 'pem', type: 'spki' });
    expect(cryptoVerify(null, nonce, nodePub, sig)).toBe(true);
  });

  it('throws SshKeyError on a missing key', () => {
    expect(() => loadKey('/nope/does-not-exist')).toThrow(SshKeyError);
  });
});
