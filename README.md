# UPI Offline Mesh — MERN port

This is a MERN (MongoDB, Express, React, Node) rebuild of the original Spring
Boot demo. Same story: a payment gets encrypted, hops across a Bluetooth-style
mesh of phones, and one "bridge" phone eventually walks outside, gets 4G, and
uploads it. The backend decrypts, deduplicates, and settles exactly once even
if several bridges upload the same packet at once.

Everything that mattered in the original — the hybrid RSA+AES-GCM encryption,
atomic idempotency on the ciphertext hash, and the tamper/replay checks — is
ported as-is, just in JavaScript instead of Java.

## Stack mapping

| Original (Spring Boot)                  | This port (MERN)                                   |
|------------------------------------------|------------------------------------------------------|
| H2 in-memory DB                          | MongoDB (local or Atlas) via Mongoose                |
| JPA `Account` / `Transaction` entities   | `models/Account.js`, `models/Transaction.js`         |
| `HybridCryptoService` (RSA-OAEP+AES-GCM) | `crypto/hybridCrypto.js` (Node's built-in `crypto`)  |
| `ServerKeyHolder`                        | `crypto/serverKeyHolder.js`                          |
| `IdempotencyService` (ConcurrentHashMap) | `services/idempotencyService.js` (`Map`, sync claim) |
| `SettlementService` (`@Transactional`)   | `services/settlementService.js` (atomic `findOneAndUpdate`) |
| `MeshSimulatorService` / `VirtualDevice` | `services/meshSimulatorService.js` / `virtualDevice.js` |
| `BridgeIngestionService`                 | `services/bridgeIngestionService.js`                 |
| `ApiController` REST endpoints           | `routes/api.js`                                      |
| Thymeleaf dashboard (`dashboard.html`)   | React SPA in `frontend/` (Vite)                      |
| `IdempotencyConcurrencyTest`             | `backend/test/idempotency.test.js` (Node's test runner) |

Why no multi-document Mongo transaction for settlement: a single-node MongoDB
doesn't support them, and it's unnecessary here — debit and credit each use an
atomic `findOneAndUpdate` where the *query filter itself* checks the balance,
so two concurrent debits against the same account can never both succeed. A
unique index on `Transaction.packetHash` is the defense-in-depth backstop,
same role the DB-level unique index played in the original.

## Project layout

```
upi-mesh-mern/
├── backend/
│   ├── server.js                 Express app entrypoint
│   ├── config/db.js              Mongoose connection
│   ├── models/                   Account, Transaction schemas
│   ├── crypto/                   Hybrid RSA+AES-GCM, server keypair
│   ├── services/                 Idempotency, settlement, mesh sim, bridge ingest, demo
│   ├── routes/api.js             All REST endpoints
│   └── test/idempotency.test.js  Concurrency + tamper tests
└── frontend/
    ├── src/App.jsx               Dashboard (compose form, controls, ledgers)
    ├── src/components/MeshGraph.jsx  Live mesh topology visualization
    └── vite.config.js            Dev server + /api proxy to :5000
```

## How to run it

### Prerequisites
- Node.js 18+
- A running MongoDB instance — either local (`mongod` on `27017`) or a free
  [MongoDB Atlas](https://www.mongodb.com/atlas) cluster. No schema setup
  needed; collections and the seed accounts are created automatically.

### 1. Backend
```bash
cd backend
npm install
cp .env.example .env      # edit MONGODB_URI if you're not using local Mongo
npm start
```
You should see `UPI mesh backend listening on http://localhost:5000`.

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
```
Open **http://localhost:5173**.

## The demo flow

Same four steps as the original:

1. **Compose a payment** — pick sender, receiver, amount, PIN, click
   **📤 Inject into mesh**. The server plays the sender's phone: builds the
   payment instruction, hybrid-encrypts it, and hands the packet to
   `phone-alice`.
2. **Run gossip rounds** — click **🔄 Run gossip round** a couple of times.
   Every device holding a packet rebroadcasts it to every other device
   (TTL decrements each hop). Watch the mesh graph light up.
3. **Bridge walks outside** — click **📡 Bridges upload to backend**.
   `phone-bridge` is the only device with internet; it uploads every packet it
   holds. Watch the pulse travel to the `BACKEND` node, and the ledger update.
4. **Idempotency** — the real proof is the concurrency test:
   ```bash
   cd backend
   npm test
   ```
   `singlePacketDeliveredByThreeBridgesSettlesExactlyOnce` fires the same
   packet at `bridgeIngestionService.ingest()` from three concurrent calls and
   asserts exactly one `SETTLED`, two `DUPLICATE_DROPPED`, and the sender
   debited exactly once. In Node this holds even under concurrency because
   `IdempotencyService.claim()` runs entirely synchronously — the event loop
   can't interleave two calls in the middle of a `Map.has`/`Map.set` pair, the
   same guarantee `ConcurrentHashMap.putIfAbsent` gave the Java version, via a
   different mechanism (single-threaded event loop vs. thread-safe map).

## API reference

Identical shape to the original:

| Method | Path                | What it does                              |
|--------|---------------------|--------------------------------------------|
| GET    | `/api/server-key`   | Server's RSA public key (base64)          |
| GET    | `/api/accounts`     | All accounts and balances                 |
| GET    | `/api/transactions` | Last 20 transactions                      |
| GET    | `/api/mesh/state`   | Current state of every virtual device     |
| POST   | `/api/demo/send`    | Simulate sender phone — encrypt + inject  |
| POST   | `/api/mesh/gossip`  | Run one gossip round                      |
| POST   | `/api/mesh/flush`   | Bridges with internet upload (parallel)   |
| POST   | `/api/mesh/reset`   | Clear mesh + idempotency cache            |
| POST   | `/api/bridge/ingest`| The production endpoint — real bridges POST here |

## Honest limitations (unchanged from the original)

This is still a teaching demo, not a real offline-payments protocol:

- The receiver has no proof the sender actually has the funds until the
  packet reaches the backend — it's an IOU until settlement, exactly like
  before.
- A malicious sender can still double-spend offline by sending two packets to
  two different baskets before either reaches the backend.
- The mesh is *simulated*. Real background BLE between phones (Android
  throttling, iOS peripheral-mode restrictions) is genuinely hard and is not
  attempted here.
- A stranger's phone still carries your encrypted packet as metadata even
  though they can't read it — same privacy consideration as before.

Name this concept honestly as "mesh-routed deferred settlement," not
"real-time offline UPI."

## What's not production-shaped yet

| In this demo                      | In production                                      |
|------------------------------------|-----------------------------------------------------|
| Local MongoDB, no replica set      | Managed MongoDB (Atlas) with replicas               |
| In-memory `Map` for idempotency    | Redis (`SET key NX EX 86400`)                       |
| RSA keypair generated on boot      | Private key in an HSM / KMS                         |
| No auth on `/api/bridge/ingest`    | Mutual TLS or signed bridge-node certificates        |
| Software-simulated mesh            | Real BLE / Wi-Fi Direct between phones               |
| No rate limiting                   | Per-bridge rate limit, per-sender velocity checks     |
