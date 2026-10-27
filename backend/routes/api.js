const express = require('express');
const Account = require('../models/Account');
const Transaction = require('../models/Transaction');
const serverKeyHolder = require('../crypto/serverKeyHolder');
const demoService = require('../services/demoService');
const meshSimulatorService = require('../services/meshSimulatorService');
const bridgeIngestionService = require('../services/bridgeIngestionService');

const router = express.Router();

router.get('/server-key', (req, res) => {
  res.json({ publicKeyBase64: serverKeyHolder.publicKeyBase64() });
});

router.get('/accounts', async (req, res) => {
  const accounts = await Account.find().sort({ vpa: 1 });
  res.json(accounts.map((a) => ({ vpa: a.vpa, name: a.name, balanceMinor: a.balanceMinor })));
});

router.get('/transactions', async (req, res) => {
  const txs = await Transaction.find().sort({ createdAt: -1 }).limit(20);
  res.json(
    txs.map((t) => ({
      id: t._id,
      senderVpa: t.senderVpa,
      receiverVpa: t.receiverVpa,
      amountMinor: t.amountMinor,
      packetHash: t.packetHash,
      status: t.status,
      createdAt: t.createdAt
    }))
  );
});

router.get('/mesh/state', (req, res) => {
  res.json(meshSimulatorService.getState());
});

router.post('/demo/send', async (req, res) => {
  try {
    const { senderVpa, receiverVpa, amountMinor, pin, deviceId } = req.body;
    if (!senderVpa || !receiverVpa || !amountMinor || !pin) {
      return res.status(400).json({ error: 'senderVpa, receiverVpa, amountMinor and pin are required' });
    }
    const packet = demoService.composePacket({ senderVpa, receiverVpa, amountMinor, pin });
    const device = meshSimulatorService.inject(packet, deviceId || 'phone-alice');
    res.json({ packet, device });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/mesh/gossip', (req, res) => {
  res.json(meshSimulatorService.gossip());
});

router.post('/mesh/flush', async (req, res) => {
  const results = await meshSimulatorService.flushBridges();
  res.json({ results, mesh: meshSimulatorService.getState() });
});

router.post('/mesh/reset', (req, res) => {
  meshSimulatorService.reset();
  res.json(meshSimulatorService.getState());
});

router.post('/bridge/ingest', async (req, res) => {
  try {
    const packet = req.body;
    if (!packet || !packet.packetId || !packet.ciphertext) {
      return res.status(400).json({ error: 'packetId and ciphertext are required' });
    }
    const outcome = await bridgeIngestionService.ingest(packet, req.headers['x-bridge-node-id']);
    res.json(outcome);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
