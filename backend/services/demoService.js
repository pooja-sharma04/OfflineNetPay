const crypto = require('crypto');
const Account = require('../models/Account');
const hybridCrypto = require('../crypto/hybridCrypto');
const serverKeyHolder = require('../crypto/serverKeyHolder');

const SEED_ACCOUNTS = [
  { vpa: 'alice@upimesh', name: 'Alice', balanceMinor: 200000 }, // ₹2000.00
  { vpa: 'bob@upimesh', name: 'Bob', balanceMinor: 50000 },
  { vpa: 'carol@upimesh', name: 'Carol', balanceMinor: 75000 },
  { vpa: 'dana@upimesh', name: 'Dana', balanceMinor: 10000 }
];

async function seedAccountsIfEmpty() {
  const count = await Account.countDocuments();
  if (count > 0) return;
  await Account.insertMany(SEED_ACCOUNTS);
  console.log('[demo] seeded accounts:', SEED_ACCOUNTS.map((a) => a.vpa).join(', '));
}

// Server pretends to be the sender's phone: builds the PaymentInstruction,
// hybrid-encrypts it with the server's own public key, and wraps it in a
// MeshPacket ready to be injected into the mesh.
function composePacket({ senderVpa, receiverVpa, amountMinor, pin }) {
  const instruction = {
    senderVpa,
    receiverVpa,
    amountMinor,
    pinHash: crypto.createHash('sha256').update(String(pin)).digest('hex'),
    nonce: crypto.randomUUID(),
    signedAt: Date.now()
  };

  const ciphertext = hybridCrypto.encrypt(serverKeyHolder.publicKey, instruction);

  return {
    packetId: crypto.randomUUID(),
    ttl: 5,
    createdAt: Date.now(),
    ciphertext
  };
}

module.exports = { seedAccountsIfEmpty, composePacket, SEED_ACCOUNTS };
