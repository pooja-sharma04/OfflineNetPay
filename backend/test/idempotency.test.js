// Requires a running MongoDB (see MONGODB_URI in .env). Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
require('dotenv').config();

const { connectDB } = require('../config/db');
const Account = require('../models/Account');
const Transaction = require('../models/Transaction');
const hybridCrypto = require('../crypto/hybridCrypto');
const serverKeyHolder = require('../crypto/serverKeyHolder');
const demoService = require('../services/demoService');
const bridgeIngestionService = require('../services/bridgeIngestionService');
const idempotencyService = require('../services/idempotencyService');

test.before(async () => {
  await connectDB();
  await Account.deleteMany({});
  await Transaction.deleteMany({});
  await Account.insertMany(demoService.SEED_ACCOUNTS);
});

test.after(async () => {
  await mongoose.disconnect();
});

test('encryptDecryptRoundTrip: hybrid encryption is symmetric', () => {
  const payload = { senderVpa: 'alice@upimesh', receiverVpa: 'bob@upimesh', amountMinor: 5000 };
  const ciphertext = hybridCrypto.encrypt(serverKeyHolder.publicKey, payload);
  const decrypted = hybridCrypto.decrypt(serverKeyHolder.privateKey, ciphertext);
  assert.deepEqual(decrypted, payload);
});

test('tamperedCiphertextIsRejected: flipped byte -> INVALID, not a crash or settlement', async () => {
  const packet = demoService.composePacket({
    senderVpa: 'alice@upimesh',
    receiverVpa: 'bob@upimesh',
    amountMinor: 5000,
    pin: '1234'
  });

  const buf = Buffer.from(packet.ciphertext, 'base64');
  buf[buf.length - 1] ^= 0xff; // flip the last byte (inside the GCM tag)
  const tampered = { ...packet, ciphertext: buf.toString('base64') };

  const outcome = await bridgeIngestionService.ingest(tampered);
  assert.equal(outcome.outcome, 'INVALID');
});

test('singlePacketDeliveredByThreeBridgesSettlesExactlyOnce', async () => {
  idempotencyService.reset();
  const before = await Account.findOne({ vpa: 'alice@upimesh' });

  const packet = demoService.composePacket({
    senderVpa: 'alice@upimesh',
    receiverVpa: 'bob@upimesh',
    amountMinor: 5000,
    pin: '1234'
  });

  // Three "threads" (concurrent async calls) deliver the identical packet at once.
  const outcomes = await Promise.all([
    bridgeIngestionService.ingest(packet),
    bridgeIngestionService.ingest(packet),
    bridgeIngestionService.ingest(packet)
  ]);

  const settled = outcomes.filter((o) => o.outcome === 'SETTLED');
  const dropped = outcomes.filter((o) => o.outcome === 'DUPLICATE_DROPPED');

  assert.equal(settled.length, 1, 'exactly one delivery should settle');
  assert.equal(dropped.length, 2, 'the other two should be dropped as duplicates');

  const after = await Account.findOne({ vpa: 'alice@upimesh' });
  assert.equal(before.balanceMinor - after.balanceMinor, 5000, 'sender debited exactly once');

  const txCount = await Transaction.countDocuments({ packetHash: outcomes[0].packetHash });
  assert.equal(txCount, 1, 'exactly one ledger row for this packet hash');
});
