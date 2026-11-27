import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const LOCAL_KEY_FILE = path.join(process.cwd(), 'data', '.vira-local.key');

interface EncryptedEnvelope {
  v: 2;
  alg: 'aes-256-gcm';
  iv: string;
  tag: string;
  data: string;
}

function getMasterKey(): Buffer {
  const envMaterial =
    process.env.FOLD_ENCRYPTION_KEY ||
    process.env.VIRA_SESSION_SECRET ||
    process.env.SCHEDULER_SECRET ||
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;

  if (envMaterial) {
    return crypto.createHash('sha256').update(envMaterial).digest();
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Encryption secret (FOLD_ENCRYPTION_KEY or VIRA_SESSION_SECRET) is required in production.');
  }

  // Local non-production fallback: auto-generate an untracked 32-byte key in /data
  try {
    if (fs.existsSync(/*turbopackIgnore: true*/ LOCAL_KEY_FILE)) {
      const existing = fs.readFileSync(/*turbopackIgnore: true*/ LOCAL_KEY_FILE, 'utf-8').trim();
      if (existing.length >= 32) {
        return crypto.createHash('sha256').update(existing).digest();
      }
    }
    fs.mkdirSync(path.dirname(/*turbopackIgnore: true*/ LOCAL_KEY_FILE), { recursive: true });
    const generated = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(/*turbopackIgnore: true*/ LOCAL_KEY_FILE, generated, { mode: 0o600 });
    return crypto.createHash('sha256').update(generated).digest();
  } catch (err) {
    throw new Error(`Unable to initialize local encryption key: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function encryptSensitiveText(plaintext: string): string {
  const key = getMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const envelope: EncryptedEnvelope = {
    v: 2,
    alg: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: ciphertext.toString('base64'),
  };
  return JSON.stringify(envelope);
}

export function isEncryptedEnvelope(value: string): boolean {
  if (!value.startsWith('{')) return false;
  try {
    const parsed = JSON.parse(value) as Partial<EncryptedEnvelope>;
    return parsed.v === 2 && parsed.alg === 'aes-256-gcm' && typeof parsed.iv === 'string' && typeof parsed.tag === 'string' && typeof parsed.data === 'string';
  } catch {
    return false;
  }
}

function decryptWithKey(envelope: EncryptedEnvelope, key: Buffer): string {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(envelope.data, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export function decryptSensitiveText(payload: string): string {
  if (!isEncryptedEnvelope(payload)) {
    // Allow reading pre-existing legacy plaintext rows (re-encrypted on next write)
    return payload;
  }
  const envelope = JSON.parse(payload) as EncryptedEnvelope;
  try {
    return decryptWithKey(envelope, getMasterKey());
  } catch (primaryErr) {
    // Allow fallback decryption if encrypted by local auto-generated key prior to .env.local key setup
    if (process.env.NODE_ENV !== 'production' && fs.existsSync(/*turbopackIgnore: true*/ LOCAL_KEY_FILE)) {
      const localSecret = fs.readFileSync(/*turbopackIgnore: true*/ LOCAL_KEY_FILE, 'utf-8').trim();
      if (localSecret.length >= 32) {
        const localKey = crypto.createHash('sha256').update(localSecret).digest();
        return decryptWithKey(envelope, localKey);
      }
    }
    throw primaryErr;
  }
}

/**
 * Removes sensitive banking identifiers (phone numbers, UPI handles,
 * account/card numbers, IFSC codes, and long transaction IDs) before
 * sending merchant descriptions to external AI services.
 */
export function scrubSensitiveFinanceText(input: string): string {
  if (!input) return '';
  return input
    // Email / UPI VPA handles (e.g. 9876543210@ybl, name@okicici)
    .replace(/[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+/g, '[UPI]')
    // Indian IFSC codes (e.g. ICIC0001234, SBIN0005438)
    .replace(/\b[A-Z]{4}0[A-Z0-9]{6}\b/gi, '[BANK]')
    // Phone numbers / account / reference digits (6+ consecutive digits, optionally spaced/dashed)
    .replace(/\b(?:\+?91[-\s]?)?\d[\d\s-]{5,}\d\b/g, '[ID]')
    .replace(/\b\d{6,}\b/g, '[ID]')
    // Collapse excess whitespace
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}
