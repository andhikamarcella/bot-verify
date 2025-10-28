const express = require('express');
const cors = require('cors');
const verifyRoutes = require('./routes/verify');
const dashboardRoutes = require('./routes/dashboard');
const guildInfoRoutes = require('./routes/guildInfo');
const leaderboardRoutes = require('./routes/leaderboard');

const app = express();

app.use(cors());
app.use(express.json());
app.set('trust proxy', true);

app.use('/api', verifyRoutes);
app.use('/api', dashboardRoutes);
app.use('/api', guildInfoRoutes);
app.use('/api', leaderboardRoutes);

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'verification-api' });
});

async function startApiServer() {
  const port = Number(process.env.PORT || 3001);
  app.listen(port, () => {
    console.log(`API verifikasi berjalan di port ${port}`);
  });
  return app;
}

module.exports = {
  app,
  startApiServer,
};
