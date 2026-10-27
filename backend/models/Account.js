const mongoose = require('mongoose');

// balanceMinor is stored in paise (integer) to avoid floating point drift.
const accountSchema = new mongoose.Schema({
  vpa: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  balanceMinor: { type: Number, required: true, default: 0 }
});

module.exports = mongoose.model('Account', accountSchema);
