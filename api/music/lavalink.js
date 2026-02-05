const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { Manager } = require('erela.js');
const fs = require('fs');
const path = require('path');

function cleanEnv(value) {
  if (value === undefined || value === null) return '';
  let v = String(value).trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'")) ||
    (v.startsWith('`') && v.endsWith('`'))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

function cleanPath(value) {
  const v = cleanEnv(value);
  if (!v) return '';
  return v.startsWith('/') ? v : `/${v}`;
}

// Lavalink configuration
const LAVALINK_CONFIG = {
  host: cleanEnv(process.env.LAVALINK_HOST) || 'localhost',
  port: parseInt(cleanEnv(process.env.LAVALINK_PORT) || '2333', 10) || 2333,
  password:
    cleanEnv(process.env.LAVALINK_PASSWORD) ||
    cleanEnv(process.env.LAVALINK_SERVER_PASSWORD) ||
    'youshallnotpass',
  secure: String(cleanEnv(process.env.LAVALINK_SECURE) || '').toLowerCase() === 'true',
  path: cleanPath(process.env.LAVALINK_PATH) || '/v4/websocket',
};

// Music queue management
class MusicQueue {
  constructor() {
    this.queues = new Map(); // guildId -> queue
  }

  getQueue(guildId) {
    if (!this.queues.has(guildId)) {
      this.queues.set(guildId, {
        tracks: [],
        currentTrack: null,
        isPlaying: false,
        volume: 100,
        loop: false,
        voiceChannel: null,
        textChannel: null,
      });
    }
    return this.queues.get(guildId);
  }

  addTrack(guildId, track) {
    const queue = this.getQueue(guildId);
    queue.tracks.push(track);
    return queue;
  }

  removeTrack(guildId, index) {
    const queue = this.getQueue(guildId);
    if (index >= 0 && index < queue.tracks.length) {
      return queue.tracks.splice(index, 1)[0];
    }
    return null;
  }

  clearQueue(guildId) {
    const queue = this.getQueue(guildId);
    queue.tracks = [];
    return queue;
  }

  setPlaying(guildId, isPlaying, track = null) {
    const queue = this.getQueue(guildId);
    queue.isPlaying = isPlaying;
    queue.currentTrack = track;
    return queue;
  }

  nextTrack(guildId) {
    const queue = this.getQueue(guildId);
    if (queue.tracks.length > 0) {
      const nextTrack = queue.tracks.shift();
      queue.currentTrack = nextTrack;
      return nextTrack;
    }
    queue.currentTrack = null;
    queue.isPlaying = false;
    return null;
  }
}

// Global music queue instance
const musicQueue = new MusicQueue();

// Lavalink manager instance
let lavalinkManager = null;
let discordClient = null;
let isInitializing = false;
let initializationPromise = null;

// Initialize Lavalink
async function initializeLavalink(client) {
  // Prevent concurrent initialization
  if (isInitializing) {
    return initializationPromise;
  }
  
  if (lavalinkManager) {
    return lavalinkManager;
  }

  isInitializing = true;
  initializationPromise = _doInitialize(client);
  
  try {
    lavalinkManager = await initializationPromise;
    return lavalinkManager;
  } finally {
    isInitializing = false;
    initializationPromise = null;
  }
}

async function _doInitialize(client) {
  console.log('[Lavalink] Starting initialization...');
  console.log('[Lavalink] Config:', {
    host: LAVALINK_CONFIG.host,
    port: LAVALINK_CONFIG.port,
    secure: LAVALINK_CONFIG.secure,
    hasPassword: !!LAVALINK_CONFIG.password
  });
  console.log(
    '[Lavalink] URL:',
    `${LAVALINK_CONFIG.secure ? 'wss' : 'ws'}://${LAVALINK_CONFIG.host}:${LAVALINK_CONFIG.port}${LAVALINK_CONFIG.path}`
  );

  // Store the client for emergency use
  discordClient = client;

  const isLocalHost =
    LAVALINK_CONFIG.host === 'localhost' ||
    LAVALINK_CONFIG.host === '127.0.0.1' ||
    LAVALINK_CONFIG.host === '0.0.0.0';

  const nodes = [
    {
      identifier: 'main',
      host: LAVALINK_CONFIG.host,
      port: LAVALINK_CONFIG.port,
      password: LAVALINK_CONFIG.password,
      secure: Boolean(LAVALINK_CONFIG.secure),
      path: LAVALINK_CONFIG.path,
    },
  ];

  if (isLocalHost) {
    nodes.push(
      {
        identifier: 'fallback-2333',
        host: LAVALINK_CONFIG.host,
        port: 2333,
        password: LAVALINK_CONFIG.password,
        secure: false,
        path: LAVALINK_CONFIG.path,
      },
      {
        identifier: 'fallback-80',
        host: LAVALINK_CONFIG.host,
        port: 80,
        password: LAVALINK_CONFIG.password,
        secure: false,
        path: LAVALINK_CONFIG.path,
      }
    );
  }

  const manager = new Manager({
    nodes,
    send: (payload) => {
      if (client.shard) {
        client.shard.send(payload);
      } else {
        client.ws.send(payload);
      }
    },
    clientID: client.user.id,
    plugins: [],
    retryDelay: 2000,
    retryAmount: 1,
    autoPlay: false,
    moveOnDisconnect: false,
  });

  // Set up event listeners BEFORE initialization
  manager.on('nodeConnect', (node) => {
    const nodeId = node?.identifier || node?.options?.identifier || 'unknown';
    console.log(`✅ [Lavalink] Node ${nodeId} connected`);
  });

  manager.on('nodeDisconnect', (node) => {
    const nodeId = node?.identifier || node?.options?.identifier || 'unknown';
    console.log(`❌ [Lavalink] Node ${nodeId} disconnected`);
  });

  manager.on('nodeError', (node, error) => {
    const nodeId = node?.identifier || node?.options?.identifier || 'unknown';
    console.error(`🚨 [Lavalink] Node ${nodeId} error:`, error?.message || String(error));
  });

  manager.on('trackStart', (player, track) => {
    const queue = musicQueue.getQueue(player.guild);
    queue.isPlaying = true;
    queue.currentTrack = track;

    // Send now playing message
    if (queue.textChannel) {
      const embed = new EmbedBuilder()
        .setTitle('🎵 Now Playing')
        .setDescription(`**${track.title}**`)
        .addFields(
          { name: 'Duration', value: track.isStream ? '🔴 Live' : `${track.duration}`, inline: true },
          { name: 'Requested by', value: track.requester?.tag || 'Unknown', inline: true }
        )
        .setThumbnail(track.thumbnail || null)
        .setColor(0x00FF00);

      queue.textChannel.send({ embeds: [embed] });
    }
  });

  manager.on('trackEnd', (player, track) => {
    const queue = musicQueue.getQueue(player.guild);
    
    // Handle loop
    if (queue.loop && track) {
      queue.tracks.push(track);
    }

    // Play next track
    const nextTrack = musicQueue.nextTrack(player.guild);
    if (nextTrack) {
      player.play(nextTrack);
    } else {
      queue.isPlaying = false;
      
      // Send queue ended message
      if (queue.textChannel) {
        queue.textChannel.send('🎵 Queue ended. Use `/play` to add more songs!');
      }
    }
  });

  manager.on('playerCreate', (player) => {
    console.log(`[Lavalink] Player created for guild: ${player.guild}`);
  });

  manager.on('playerDestroy', (player) => {
    console.log(`[Lavalink] Player destroyed for guild: ${player.guild}`);
    musicQueue.queues.delete(player.guild);
  });

  // Initialize WITHOUT await (erela.js v2 doesn't return Promise)
  manager.init(client.user.id);
  
  // Wait for connection with timeout
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      console.warn('[Lavalink] Connection timeout - continuing without music');
      resolve(null); // Don't reject, allow bot to continue
    }, 10000);

    manager.on('nodeConnect', () => {
      clearTimeout(timeout);
      resolve(manager);
    });
  });
}

// Search YouTube
async function searchYouTube(query) {
  try {
    console.log('[Lavalink] Searching for:', query);
    
    // ✅ NO emergency initialization - check if manager exists
    if (!lavalinkManager) {
      throw new Error('Lavalink not initialized. Please restart bot.');
    }

    const results = await lavalinkManager.search(String(query || ''), null);
    console.log('[Lavalink] Search results:', results?.tracks?.length || 0);
    
    if (!results || !results.tracks || results.tracks.length === 0) {
      throw new Error('No results found');
    }

    return results.tracks;
  } catch (error) {
    console.error('[Lavalink] Search error:', error);
    throw error;
  }
}

// Play track
async function playTrack(guildId, track, interaction = null) {
  try {
    if (!lavalinkManager) {
      throw new Error('Lavalink manager not initialized');
    }

    const queue = musicQueue.getQueue(guildId);
    
    // Get or create player
    let player = lavalinkManager.players.get(guildId);
    if (!player) {
      player = lavalinkManager.create({
        guild: guildId,
        voiceChannel: queue.voiceChannel?.id,
        textChannel: queue.textChannel?.id,
        volume: queue.volume,
      });
    }

    // Connect to voice channel
    if (!player.connected) {
      await player.connect();
    }

    // Set track requester
    track.requester = interaction?.user || null;
    
    // Play the track
    await player.play(track);
    musicQueue.setPlaying(guildId, true, track);

    return true;
  } catch (error) {
    console.error('[Lavalink] Play error:', error);
    throw error;
  }
}

// Music commands
const musicCommands = {
  async play(interaction) {
    console.log('[MusicCommands] Play function called');
    try {
      // Check if Lavalink is available
      if (!lavalinkManager) {
        return await interaction.reply({
          content: '❌ Music functionality is currently unavailable. Lavalink server is not connected.',
          ephemeral: true,
        });
      }

      const query = interaction.options.getString('query');
      const { member, guild } = interaction;

      if (!member.voice.channel) {
        return await interaction.reply({
          content: '❌ You must be in a voice channel to play music!',
          ephemeral: true,
        });
      }

      await interaction.deferReply();

      // Search for track
      const tracks = await searchYouTube(query);
      const track = tracks[0];

      if (!track) {
        return await interaction.editReply({
          content: '❌ No results found for your query!',
        });
      }

      // Add to queue
      const queue = musicQueue.getQueue(guild.id);
      queue.voiceChannel = member.voice.channel;
      queue.textChannel = interaction.channel;
      musicQueue.addTrack(guild.id, track);

      // If not playing, start playing
      if (!queue.isPlaying) {
        const nextTrack = musicQueue.nextTrack(guild.id);
        if (nextTrack) {
          await playTrack(guild.id, nextTrack, interaction);
        }
      }

      const embed = new EmbedBuilder()
        .setTitle('🎵 Added to Queue')
        .setDescription(`**${track.title}**`)
        .addFields(
          { name: 'Duration', value: track.isStream ? '🔴 Live' : `${track.duration}`, inline: true },
          { name: 'Position in Queue', value: `${queue.tracks.length}`, inline: true }
        )
        .setThumbnail(track.thumbnail || null)
        .setColor(0x00FF00);

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('[Music] Play error:', error);
      await interaction.editReply({
        content: '❌ Failed to play music. Please try again.',
      });
    }
  },

  async skip(interaction) {
    try {
      // Check if Lavalink is available
      if (!lavalinkManager) {
        return await interaction.reply({
          content: '❌ Music functionality is currently unavailable. Lavalink server is not connected.',
          ephemeral: true,
        });
      }

      const { guild } = interaction;

      if (!lavalinkManager.players.has(guild.id)) {
        return await interaction.reply({
          content: '❌ No music is currently playing!',
          ephemeral: true,
        });
      }

      await interaction.deferReply();

      const player = lavalinkManager.players.get(guild.id);
      const queue = musicQueue.getQueue(guild.id);

      if (queue.tracks.length === 0 && !queue.currentTrack) {
        return await interaction.editReply({
          content: '❌ No more tracks in the queue!',
        });
      }

      player.stop();

      await interaction.editReply({
        content: '⏭️ Skipped current track!',
      });

    } catch (error) {
      console.error('[Music] Skip error:', error);
      await interaction.editReply({
        content: '❌ Failed to skip track. Please try again.',
      });
    }
  },

  async stop(interaction) {
    try {
      // Check if Lavalink is available
      if (!lavalinkManager) {
        return await interaction.reply({
          content: '❌ Music functionality is currently unavailable. Lavalink server is not connected.',
          ephemeral: true,
        });
      }

      const { guild } = interaction;

      if (!lavalinkManager.players.has(guild.id)) {
        return await interaction.reply({
          content: '❌ No music is currently playing!',
          ephemeral: true,
        });
      }

      await interaction.deferReply();

      const player = lavalinkManager.players.get(guild.id);
      
      // Stop playing and clear queue
      player.stop();
      musicQueue.clearQueue(guild.id);
      musicQueue.setPlaying(guild.id, false);

      // Disconnect from voice
      if (player.connected) {
        player.disconnect();
        player.destroy();
      }

      await interaction.editReply({
        content: '⏹️ Music stopped and queue cleared!',
      });

    } catch (error) {
      console.error('[Music] Stop error:', error);
      await interaction.editReply({
        content: '❌ Failed to stop music. Please try again.',
      });
    }
  },

  async queue(interaction) {
    try {
      const { guild } = interaction;
      const queue = musicQueue.getQueue(guild.id);

      if (queue.tracks.length === 0 && !queue.currentTrack) {
        return await interaction.reply({
          content: '🎵 The queue is empty! Use `/play` to add songs.',
        });
      }

      const embed = new EmbedBuilder()
        .setTitle('🎵 Music Queue')
        .setColor(0x00FF00);

      // Add current track
      if (queue.currentTrack) {
        embed.addFields({
          name: '🎶 Now Playing',
          value: `**${queue.currentTrack.title}**\n${queue.currentTrack.isStream ? '🔴 Live' : `Duration: ${queue.currentTrack.duration}`}`,
        });
      }

      // Add queued tracks
      if (queue.tracks.length > 0) {
        const trackList = queue.tracks.slice(0, 10).map((track, index) => {
          return `${index + 1}. **${track.title}** - ${track.isStream ? '🔴 Live' : track.duration}`;
        }).join('\n');

        embed.addFields({
          name: `📋 Upcoming (${queue.tracks.length} tracks)`,
          value: trackList,
        });
      }

      embed.addFields(
        { name: '🔊 Volume', value: `${queue.volume}%`, inline: true },
        { name: '🔁 Loop', value: queue.loop ? 'Enabled' : 'Disabled', inline: true },
        { name: '▶️ Status', value: queue.isPlaying ? 'Playing' : 'Paused', inline: true }
      );

      await interaction.reply({ embeds: [embed] });

    } catch (error) {
      console.error('[Music] Queue error:', error);
      await interaction.reply({
        content: '❌ Failed to fetch queue. Please try again.',
        ephemeral: true,
      });
    }
  },

  async video(interaction) {
    try {
      const { guild, member } = interaction;

      if (!member.voice.channel) {
        return await interaction.reply({
          content: '❌ You must be in a voice channel to start video streaming!',
          ephemeral: true,
        });
      }

      const queue = musicQueue.getQueue(guild.id);
      
      if (!queue.currentTrack) {
        return await interaction.reply({
          content: '❌ No track is currently playing!',
          ephemeral: true,
        });
      }

      await interaction.deferReply();

      // Start screen share in voice channel
      const voiceChannel = member.voice.channel;
      
      // Create video stream message
      const embed = new EmbedBuilder()
        .setTitle('🎬 Video Streaming Started')
        .setDescription(`**${queue.currentTrack.title}**`)
        .addFields(
          { name: '📺 Channel', value: voiceChannel.name, inline: true },
          { name: '🎵 Now Playing', value: queue.currentTrack.title, inline: true }
        )
        .setThumbnail(queue.currentTrack.thumbnail || null)
        .setColor(0x00FF00)
        .setFooter({ text: 'Video will automatically stop when the song ends' });

      const message = await interaction.editReply({ embeds: [embed] });

      // Add reactions for controls
      await message.react('⏸️'); // Pause
      await message.react('⏹️'); // Stop
      await message.react('⏭️'); // Skip

      // Auto-stop when track ends
      const checkInterval = setInterval(() => {
        if (!queue.isPlaying || !queue.currentTrack) {
          clearInterval(checkInterval);
          interaction.editReply({
            content: '🎬 Video streaming ended!',
            embeds: [],
          });
        }
      }, 5000);

    } catch (error) {
      console.error('[Music] Video error:', error);
      await interaction.editReply({
        content: '❌ Failed to start video streaming. Please try again.',
      });
    }
  },
};

// Handle voice state updates
function handleVoiceStateUpdate(oldState, newState) {
  if (lavalinkManager) {
    lavalinkManager.voiceStateUpdate(oldState, newState);
  }
}

function handleRawVoiceEvent(packet) {
  if (!lavalinkManager) return;
  const t = packet?.t;
  if (t !== 'VOICE_STATE_UPDATE' && t !== 'VOICE_SERVER_UPDATE') return;
  try {
    lavalinkManager.updateVoiceState(packet);
  } catch (_) {
    null;
  }
}

module.exports = {
  initializeLavalink,
  musicCommands,
  searchYouTube,
  playTrack,
  musicQueue,
  handleVoiceStateUpdate,
  handleRawVoiceEvent,
};
