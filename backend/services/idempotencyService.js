// JVM-local equivalent was a ConcurrentHashMap with putIfAbsent.
// Node is single-threaded, and Map.has/Map.set below run synchronously with
// no `await` between them, so the event loop cannot interleave two concurrent
// requests inside claim() — the same atomicity guarantee, different runtime.
// In production this becomes Redis: SET key NX EX 86400.
const seen = new Map(); // hash -> claimedAt (ms epoch)
const TTL_MS = 24 * 60 * 60 * 1000; // 24h, mirrors the freshness window

function claim(packetHash) {
  if (seen.has(packetHash)) return false;
  seen.set(packetHash, Date.now());
  return true;
}

function size() {
  return seen.size;
}

function reset() {
  seen.clear();
}

function evictExpired() {
  const now = Date.now();
  for (const [hash, claimedAt] of seen.entries()) {
    if (now - claimedAt > TTL_MS) seen.delete(hash);
  }
}

// Mirrors AppConfig's @EnableScheduling cache eviction job.
setInterval(evictExpired, 60 * 1000).unref();

module.exports = { claim, size, reset };
