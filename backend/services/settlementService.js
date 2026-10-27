const Account = require('../models/Account');
const Transaction = require('../models/Transaction');

class InsufficientFundsError extends Error {
  constructor(vpa) {
    super(`insufficient funds for ${vpa}`);
    this.name = 'InsufficientFundsError';
  }
}

class UnknownAccountError extends Error {
  constructor(vpa) {
    super(`unknown account ${vpa}`);
    this.name = 'UnknownAccountError';
  }
}

/**
 * Debit and credit each use an atomic findOneAndUpdate — the query's own filter
 * (balanceMinor >= amount) is what MongoDB checks before applying the $inc, so
 * two concurrent debits against the same account can never both succeed and
 * push the balance negative. No multi-document transaction is required.
 *
 * A unique index on Transaction.packetHash is the final defense-in-depth layer:
 * if the idempotency cache were ever bypassed, the DB write itself would reject
 * a second settlement of the same packet with a duplicate-key error.
 */
async function settle({ senderVpa, receiverVpa, amountMinor, packetHash }) {
  const sender = await Account.findOne({ vpa: senderVpa });
  if (!sender) throw new UnknownAccountError(senderVpa);
  const receiver = await Account.findOne({ vpa: receiverVpa });
  if (!receiver) throw new UnknownAccountError(receiverVpa);

  const debited = await Account.findOneAndUpdate(
    { vpa: senderVpa, balanceMinor: { $gte: amountMinor } },
    { $inc: { balanceMinor: -amountMinor } },
    { new: true }
  );
  if (!debited) throw new InsufficientFundsError(senderVpa);

  await Account.findOneAndUpdate(
    { vpa: receiverVpa },
    { $inc: { balanceMinor: amountMinor } }
  );

  const tx = await Transaction.create({
    senderVpa,
    receiverVpa,
    amountMinor,
    packetHash,
    status: 'SETTLED'
  });

  return tx;
}

module.exports = { settle, InsufficientFundsError, UnknownAccountError };
