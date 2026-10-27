const hybridCrypto = require('../crypto/hybridCrypto');
const serverKeyHolder = require('../crypto/serverKeyHolder');
const idempotencyService = require('./idempotencyService');
const settlementService = require('./settlementService');

const FRESHNESS_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * The production endpoint. Real bridges POST a MeshPacket here.
 * Returns { outcome, packetHash, reason, transactionId } — same shape as the
 * original Java response.
 */
async function ingest(packet) {
  const packetHash = hybridCrypto.hashCiphertext(packet.ciphertext);

  // Step 1: claim the hash before doing any real work. This is what makes
  // three simultaneous bridge uploads of the same packet settle exactly once.
  const claimed = idempotencyService.claim(packetHash);
  if (!claimed) {
    return { outcome: 'DUPLICATE_DROPPED', packetHash, reason: null, transactionId: null };
  }

  let instruction;
  try {
    instruction = hybridCrypto.decrypt(serverKeyHolder.privateKey, packet.ciphertext);
  } catch (err) {
    // GCM auth tag failed to verify -> tampered or corrupted ciphertext.
    return { outcome: 'INVALID', packetHash, reason: 'DECRYPTION_FAILED', transactionId: null };
  }

  const age = Date.now() - instruction.signedAt;
  if (age > FRESHNESS_WINDOW_MS || age < -60_000) {
    return { outcome: 'INVALID', packetHash, reason: 'STALE_OR_FUTURE_SIGNATURE', transactionId: null };
  }

  try {
    const tx = await settlementService.settle({
      senderVpa: instruction.senderVpa,
      receiverVpa: instruction.receiverVpa,
      amountMinor: instruction.amountMinor,
      packetHash
    });
    return { outcome: 'SETTLED', packetHash, reason: null, transactionId: tx._id.toString() };
  } catch (err) {
    return { outcome: 'INVALID', packetHash, reason: err.message, transactionId: null };
  }
}

module.exports = { ingest };
