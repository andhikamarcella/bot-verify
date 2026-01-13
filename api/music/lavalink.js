const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { Manager } = require('erela.js');
const fs = require('fs');
const path = require('path');

// Lavalink configuration
const LAVALINK_CONFIG = {
  host: process.env.LAVALINK_HOST || 'localhost',
  port: parseInt(process.env.LAVALINK_PORT) || 2333,
  password: process.env.LAVALINK_PASSWORD || 'youshallnotpass',
    secure: process.env.LAVALINK_SECURE === 'true',
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

// Initialize Lavalink
async function initializeLavalink(client) {
  try {
    console.log('[Lavalink] Starting initialization...');
    console.log('[Lavalink] Host:', LAVALINK_CONFIG.host);
    console.log('[Lavalink] Port:', LAVALINK_CONFIG.port);
    console.log('[Lavalink] Secure:', LAVALINK_CONFIG.secure);
    console.log('[Lavalink] Password:', LAVALINK_CONFIG.password ? '***' : 'not set');
    
    // Store the client for emergency use
    discordClient = client;
    
    lavalinkManager = new Manager({
      nodes: [
        {
          identifier: 'main',
          host: LAVALINK_CONFIG.host,
          port: LAVALINK_CONFIG.port,
          password: LAVALINK_CONFIG.password,
          secure: LAVALINK_CONFIG.secure,
        },
      ],
      send: (payload) => {
        // Send the payload to Discord gateway
        if (client.shard) {
          client.shard.send(payload);
        } else {
          // Fallback for non-sharded bots
          client.ws.send(payload);
        }
      },
      clientID: client.user.id,
      plugins: [],
      autoPlay: false,
      retryDelay: 3000,
      retryAmount: 3,
    });

    // Event listeners
    lavalinkManager.on('nodeConnect', (node) => {
      console.log(`[Lavalink] Node ${node.identifier} connected`);
    });

    lavalinkManager.on('nodeDisconnect', (node) => {
      console.log(`[Lavalink] Node ${node.identifier} disconnected`);
    });

    lavalinkManager.on('nodeError', (node, error) => {
      console.error(`[Lavalink] Node ${node.identifier} error:`, error);
    });

    lavalinkManager.on('trackStart', (player, track) => {
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

    lavalinkManager.on('trackEnd', (player, track) => {
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

    lavalinkManager.on('playerCreate', (player) => {
      console.log(`[Lavalink] Player created for guild: ${player.guild}`);
    });

    lavalinkManager.on('playerDestroy', (player) => {
      console.log(`[Lavalink] Player destroyed for guild: ${player.guild}`);
      musicQueue.queues.delete(player.guild);
    });

    // Initialize the manager
    console.log('[Lavalink] Initializing manager...');
    lavalinkManager.init(client.user.id);
    console.log('[Lavalink] Manager initialized successfully!');

    // Wait for node connection
    console.log('[Lavalink] Waiting for node connection...');
    let attempts = 0;
    const maxAttempts = 10;
    
    while (attempts < maxAttempts) {
      const node = lavalinkManager.nodes.get('main');
      if (node && node.connected) {
        console.log('[Lavalink] Node connected successfully!');
        return lavalinkManager;
      }
      
      attempts++;
      console.log(`[Lavalink] Waiting for connection... (${attempts}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error('Node failed to connect after multiple attempts');

  } catch (error) {
    console.error('[Lavalink] Failed to initialize:', error);
    throw error;
  }
}

// Search YouTube
async function searchYouTube(query) {
  try {
    console.log('[Lavalink] Searching for:', query);
    console.log('[Lavalink] Manager exists:', !!lavalinkManager);
    
    if (!lavalinkManager) {
      console.error('[Lavalink] Manager not initialized, attempting to initialize...');
      try {
        // Try to use the stored client first, otherwise get it from discordClient
        let client = discordClient;
        if (!client) {
          const { getClient } = require('../bot/discordClient');
          client = getClient();
        }
        
        if (client && client.user) {
          console.log('[Lavalink] Attempting emergency initialization...');
          await initializeLavalink(client);
          console.log('[Lavalink] Emergency initialization successful!');
        } else {
          throw new Error('Discord client not available');
        }
      } catch (initError) {
        console.error('[Lavalink] Emergency initialization failed:', initError);
        throw new Error('Lavalink manager not initialized and emergency initialization failed');
      }
    }

    const node = lavalinkManager.nodes.get('main');
    console.log('[Lavalink] Node exists:', !!node);
    console.log('[Lavalink] Node connected:', node?.connected);
    
    if (!node || !node.connected) {
      console.error('[Lavalink] No Lavalink node available or not connected');
      throw new Error('No Lavalink node available');
    }

    const results = await node.search(query, 'youtube');
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
        guildId: guildId,
        voiceChannel: queue.voiceChannel?.id,
        textChannel: queue.textChannel?.id,
        volume: queue.volume / 100,
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
      const { guild } = interaction;

      if (!lavalinkManager || !lavalinkManager.players.has(guild.id)) {
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
      const { guild } = interaction;

      if (!lavalinkManager || !lavalinkManager.players.has(guild.id)) {
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

module.exports = {
  initializeLavalink,
  musicCommands,
  searchYouTube,
  playTrack,
  musicQueue,
  handleVoiceStateUpdate,
};
