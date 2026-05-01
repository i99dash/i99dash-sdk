import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { LocalIOError } from '../util/errors.js';

/// Cert metadata is not a credential — only the cert hash is stored
/// here. The cert envelope itself is fetched from the backend at
/// install time. Persisting the hash lets ``publish`` register a
/// privileged bundle in the same flow as upload+submit, instead of
/// requiring a manual ``POST /admin-perms/admin/bundles`` round-trip.
const CERT_FILE = join(homedir(), '.config', 'i99dash', 'cert.json');

interface CertRecord {
  certHash: string;
  expiresAt: string;
  permissionCount: number;
}

export async function saveCertHash(rec: CertRecord): Promise<void> {
  await mkdir(dirname(CERT_FILE), { recursive: true });
  await writeFile(CERT_FILE, JSON.stringify(rec), { mode: 0o600 });
}

export async function loadCertHash(): Promise<CertRecord | null> {
  try {
    const raw = await readFile(CERT_FILE, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      'certHash' in parsed &&
      typeof (parsed as CertRecord).certHash === 'string'
    ) {
      return parsed as CertRecord;
    }
    return null;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new LocalIOError(`failed to read ${CERT_FILE}`, err);
  }
}

export async function clearCertHash(): Promise<void> {
  await rm(CERT_FILE, { force: true });
}
