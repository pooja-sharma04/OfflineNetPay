const VirtualDevice = require('./virtualDevice');
const idempotencyService = require('./idempotencyService');
const bridgeIngestionService = require('./bridgeIngestionService');

// In our simulator "Bluetooth range" means everyone — same simplification the
// original README calls out. Only phone-bridge starts with internet access.
const SEED = [
  { id: 'phone-alice', hasInternet: false },
  { id: 'stranger1', hasInternet: false },
  { id: 'stranger2', hasInternet: false },
  { id: 'phone-bridge', hasInternet: true },
  { id: 'phone-dana', hasInternet: false }
];

let devices = new Map();

function seed() {
  devices = new Map(SEED.map((d) => [d.id, new VirtualDevice(d.id, { hasInternet: d.hasInternet })]));
}
seed();

function inject(packet, deviceId = 'phone-alice') {
  const device = devices.get(deviceId);
  if (!device) throw new Error(`unknown device ${deviceId}`);
  device.hold(packet);
  return device.toJSON();
}

// One gossip round: every device that holds a packet broadcasts it (TTL-1) to
// every other device. A device that already holds a fresher copy keeps it.
function gossip() {
  const broadcasts = []; // { toDeviceId, packet }

  for (const from of devices.values()) {
    for (const packet of from.packets.values()) {
      const nextTtl = packet.ttl - 1;
      if (nextTtl < 0) continue; // packet has expired, stop relaying it
      for (const to of devices.values()) {
        if (to.id === from.id) continue;
        broadcasts.push({ toDeviceId: to.id, packet: { ...packet, ttl: nextTtl } });
      }
    }
  }

  for (const { toDeviceId, packet } of broadcasts) {
    const device = devices.get(toDeviceId);
    const existing = device.packets.get(packet.packetId);
    if (!existing || existing.ttl < packet.ttl) {
      device.hold(packet);
    }
  }

  return getState();
}

// A bridge device walks outside, gets 4G, and uploads every packet it holds.
// Uploads run in parallel — this is exactly the "duplicate storm" scenario
// the idempotency layer exists to survive.
async function flushBridges() {
  const bridges = [...devices.values()].filter((d) => d.hasInternet && d.packets.size > 0);
  const results = [];

  await Promise.all(
    bridges.map(async (bridge) => {
      const packets = [...bridge.packets.values()];
      const uploads = await Promise.all(
        packets.map(async (packet) => {
          const outcome = await bridgeIngestionService.ingest(packet, bridge.id);
          return { bridgeId: bridge.id, packetId: packet.packetId, ...outcome };
        })
      );
      results.push(...uploads);
      bridge.packets.clear(); // packets are gone once "uploaded"
    })
  );

  return results;
}

function reset() {
  seed();
  idempotencyService.reset();
}

function getState() {
  return [...devices.values()].map((d) => d.toJSON());
}

module.exports = { inject, gossip, flushBridges, reset, getState };
