const express = require('express');
const { Events } = require('discord.js');
const client = require('../../bot/discordClient');
const { connectMongo } = require('../lib/db');

const router = express.Router();

async function ensureReady() {
  await connectMongo();
  if (!client.isReady()) {
    await new Promise((resolve) => client.once(Events.ClientReady, resolve));
  }
}

router.get('/guild-info', async (_req, res) => {
  try {
    await ensureReady();
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    res.json({
      ok: true,
      guildName: guild.name,
      guildIconUrl: guild.iconURL({ size: 256, extension: 'png' }),
      targetRoleId: process.env.MEMBER_ROLE_ID,
      browserUrl: process.env.DISCORD_BROWSER_URL || null,
    });
  } catch (error) {
    console.error('guild-info error', error);
    res.status(500).json({ ok: false, error: 'guild-info-failed' });
  }
});

module.exports = router;
