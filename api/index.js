const express = require('express');
const cors = require('cors');

// Dynamic require with fallback for deployment environment
let verifyRoutes, dashboardRoutes, guildInfoRoutes, leaderboardRoutes;

try {
  verifyRoutes = require('./routes/verify');
  dashboardRoutes = require('./routes/dashboard');
  guildInfoRoutes = require('./routes/guildInfo');
  leaderboardRoutes = require('./routes/leaderboard');
} catch (error) {
  console.error('[API] Failed to load routes from relative paths, trying absolute paths...');
  try {
    verifyRoutes = require('/app/api/routes/verify');
    dashboardRoutes = require('/app/api/routes/dashboard');
    guildInfoRoutes = require('/app/api/routes/guildInfo');
    leaderboardRoutes = require('/app/api/routes/leaderboard');
  } catch (absError) {
    console.error('[API] Failed to load routes from absolute paths:', absError);
    throw new Error('Cannot load API routes');
  }
}

const app = express();

// CORS configuration for production
app.use(cors({
  origin: [
    'http://localhost:3000',           // Local development
    'https://vfydsgn.vercel.app',       // Production frontend
    'https://vfy.up.railway.app'        // Railway API (if needed)
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

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
