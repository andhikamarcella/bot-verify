/**
 * Discord client tunggal yang digunakan oleh bot dan API backend.
 * Intents mencakup guild, DM, dan konten pesan agar bot bisa memantau DM.
 */
const { Client, GatewayIntentBits, Partials } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

module.exports = client;
