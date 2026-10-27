require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { connectDB } = require('./config/db');
const apiRoutes = require('./routes/api');
const demoService = require('./services/demoService');

const PORT = process.env.PORT || 5000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

async function main() {
  await connectDB();
  await demoService.seedAccountsIfEmpty();

  const app = express();
  app.use(cors({ origin: FRONTEND_ORIGIN }));
  app.use(express.json());

  app.use('/api', apiRoutes);

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  app.listen(PORT, () => {
    console.log(`[server] UPI mesh backend listening on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error('[server] failed to start:', err);
  process.exit(1);
});
