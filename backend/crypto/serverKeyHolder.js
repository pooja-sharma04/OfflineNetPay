const crypto = require('crypto');

// Regenerated on every process start, exactly like the original ServerKeyHolder.
// In production this would be an HSM/KMS-backed keypair, not an in-process one.
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

function publicKeyBase64() {
  // Strip PEM armor, return raw base64 — matches the original /api/server-key shape.
  return publicKey
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s/g, '');
}

module.exports = { publicKey, privateKey, publicKeyBase64 };
