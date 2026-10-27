class VirtualDevice {
  constructor(id, { hasInternet = false } = {}) {
    this.id = id;
    this.hasInternet = hasInternet;
    this.packets = new Map(); // packetId -> MeshPacket
  }

  hold(packet) {
    this.packets.set(packet.packetId, packet);
  }

  drop(packetId) {
    this.packets.delete(packetId);
  }

  toJSON() {
    return {
      id: this.id,
      hasInternet: this.hasInternet,
      packetCount: this.packets.size,
      packets: [...this.packets.values()].map((p) => ({
        packetId: p.packetId,
        ttl: p.ttl
      }))
    };
  }
}

module.exports = VirtualDevice;
