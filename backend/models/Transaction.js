const mongoose = require('mongoose');

// unique index on packetHash = defense-in-depth against duplicate settlement,
// mirroring the unique index on transactions.packet_hash in the original schema.
const transactionSchema = new mongoose.Schema({
  senderVpa: { type: String, required: true },
  receiverVpa: { type: String, required: true },
  amountMinor: { type: Number, required: true },
  packetHash: { type: String, required: true, unique: true, index: true },
  status: { type: String, enum: ['SETTLED'], default: 'SETTLED' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Transaction', transactionSchema);
