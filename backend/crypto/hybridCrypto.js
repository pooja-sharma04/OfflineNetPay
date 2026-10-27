const crypto = require('crypto');

const RSA_KEY_BYTES = 256; // 2048-bit RSA -> 256-byte OAEP output
const IV_BYTES = 12;       // recommended GCM IV length
const TAG_BYTES = 16;      // GCM auth tag length

/**
 * Wire format (matches the original Java implementation):
 *   [ 256 bytes RSA-OAEP-encrypted AES key ][ 12 bytes IV ][ AES-GCM ciphertext ][ 16 byte GCM tag ]
 * The whole thing is base64-encoded for transport in MeshPacket.ciphertext.
 */
function encrypt(publicKeyPem, plaintextObj) {
  const aesKey = crypto.randomBytes(32); // AES-256
  const iv = crypto.randomBytes(IV_BYTES);

  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
  const plaintext = Buffer.from(JSON.stringify(plaintextObj), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  const encryptedKey = crypto.publicEncrypt(
    { key: publicKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    aesKey
  );

  const blob = Buffer.concat([encryptedKey, iv, ciphertext, tag]);
  return blob.toString('base64');
}

function decrypt(privateKeyPem, base64Blob) {
  const blob = Buffer.from(base64Blob, 'base64');

  const encryptedKey = blob.subarray(0, RSA_KEY_BYTES);
  const iv = blob.subarray(RSA_KEY_BYTES, RSA_KEY_BYTES + IV_BYTES);
  const tag = blob.subarray(blob.length - TAG_BYTES);
  const ciphertext = blob.subarray(RSA_KEY_BYTES + IV_BYTES, blob.length - TAG_BYTES);

  const aesKey = crypto.privateDecrypt(
    { key: privateKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    encryptedKey
  );

  const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
  decipher.setAuthTag(tag); // throws below if the ciphertext was tampered with

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
}

// Dedup key = hash of the full ciphertext blob, computed before any decryption.
function hashCiphertext(base64Blob) {
  return crypto.createHash('sha256').update(Buffer.from(base64Blob, 'base64')).digest('hex');
}

module.exports = { encrypt, decrypt, hashCiphertext };
