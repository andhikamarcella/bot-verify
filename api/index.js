// Express API entry point: wires middleware, routes, and exposes a start helper.
const express = require('express');
const cors = require('cors');
const { connectMongo } = require('./lib/db');
const verifyRoutes = require('./routes/verify');
const dashboardRoutes = require('./routes/dashboard');

const app = express();
app.use(cors());
app.use(express.json());
app.set('trust proxy', true);

app.use('/api', verifyRoutes);
app.use('/api', dashboardRoutes);

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'verification-api' });
});

async function startApiServer() {
  await connectMongo();
  const port = Number(process.env.PORT || 3001);
  return new Promise((resolve) => {
    app.listen(port, () => {
      console.log(`🌐 API listening on port ${port}`);
      resolve(app);
    });
  });
}

module.exports = {
  startApiServer,
  app,
};
