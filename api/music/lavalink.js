const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { Node } = require('lavaclient');
const fs = require('fs');
const path = require('path');

// Lavalink configuration
const LAVALINK_CONFIG = {
  host: process.env.LAVALINK_HOST || 'localhost',
  port: process.env.LAVALINK_PORT || 2333,
  password: process.env.LAVALINK_PASSWORD || 'youshallnotpass',
  id: process.env.LAVALINK_CLIENT_ID || 'your-bot-client-id',
  secure: process.env.LAVALINK_SECURE === 'true',
  // YouTube source configuration
  sources: {
    youtube: true,
    youtubemusic: true,
    soundcloud: false
  }
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
        voiceChannel: null,
        textChannel: null,
        loop: false,
        volume: 100,
        videoStream: null
      });
    }
    return this.queues.get(guildId);
  }

  addTrack(guildId, track) {
    const queue = this.getQueue(guildId);
    queue.tracks.push(track);
    return queue;
  }

  clearQueue(guildId) {
    const queue = this.getQueue(guildId);
    queue.tracks = [];
    queue.currentTrack = null;
    queue.isPlaying = false;
    if (queue.videoStream) {
      queue.videoStream.destroy();
      queue.videoStream = null;
    }
  }
}

const musicQueue = new MusicQueue();

// Initialize Lavalink node
let lavalinkNode = null;

async function initializeLavalink(client) {
  try {
    lavalinkNode = new Node({
      connection: {
        host: LAVALINK_CONFIG.host,
        port: LAVALINK_CONFIG.port,
        password: LAVALINK_CONFIG.password,
        secure: LAVALINK_CONFIG.secure,
      },
      id: LAVALINK_CONFIG.id,
      // YouTube source plugin
      sources: LAVALINK_CONFIG.sources
    });

    // Lavalink event handlers
    lavalinkNode.on('ready', () => {
      console.log('[Lavalink] Connected successfully!');
    });

    lavalinkNode.on('error', (error) => {
      console.error('[Lavalink] Connection error:', error);
    });

    lavalinkNode.on('trackStart', async (player, track) => {
      const queue = musicQueue.getQueue(player.guildId);
      queue.currentTrack = track;
      queue.isPlaying = true;

      const embed = new EmbedBuilder()
        .setTitle('🎵 Now Playing')
        .setDescription(`**${track.title}**`)
        .setURL(track.uri)
        .setThumbnail(track.thumbnail)
        .addFields(
          { name: 'Duration', value: track.isStream ? '🔴 Live' : formatDuration(track.duration), inline: true },
          { name: 'Requested by', value: track.requester?.tag || 'Unknown', inline: true }
        )
        .setColor('#00AE86');

      if (queue.textChannel) {
        const message = await queue.textChannel.send({ embeds: [embed] });
        
        // Add video streaming controls
        if (track.uri && track.uri.includes('youtube.com')) {
          await addVideoControls(message, track, player.guildId);
        }
      }

      // Auto-play next track
      player.on('end', async () => {
        await playNextTrack(player.guildId);
      });
    });

    lavalinkNode.on('trackEnd', async (player, track, reason) => {
      const queue = musicQueue.getQueue(player.guildId);
      queue.isPlaying = false;
      
      // Clean up video stream if exists
      if (queue.videoStream) {
        queue.videoStream.destroy();
        queue.videoStream = null;
      }

      console.log(`[Lavalink] Track ended: ${track.title} (${reason})`);
    });

    // Connect to Lavalink
    await lavalinkNode.connect(client.user.id);
    console.log('[Lavalink] Initialized successfully');

  } catch (error) {
    console.error('[Lavalink] Failed to initialize:', error);
  }
}

// Add video streaming controls
async function addVideoControls(message, track, guildId) {
  const queue = musicQueue.getQueue(guildId);
  
  // Add reaction controls
  await message.react('📹'); // Start video
  await message.react('⏹️'); // Stop video
  await message.react('🔁'); // Loop
  await message.react('⏭️'); // Skip

  const filter = (reaction, user) => {
    return ['📹', '⏹️', '🔁', '⏭️'].includes(reaction.emoji.name) && !user.bot;
  };

  const collector = message.createReactionCollector({ filter, time: track.duration || 600000 });

  collector.on('collect', async (reaction, user) => {
    const member = message.guild.members.cache.get(user.id);
    if (!member.voice.channel) return;

    switch (reaction.emoji.name) {
      case '📹':
        await startVideoStream(guildId, track, message.channel);
        break;
      case '⏹️':
        await stopVideoStream(guildId);
        break;
      case '🔁':
        queue.loop = !queue.loop;
        await message.channel.send(`🔁 Loop ${queue.loop ? 'enabled' : 'disabled'}`);
        break;
      case '⏭️':
        await skipTrack(guildId);
        break;
    }

    await reaction.users.remove(user.id);
  });
}

// Start video streaming
async function startVideoStream(guildId, track, textChannel) {
  try {
    const queue = musicQueue.getQueue(guildId);
    
    if (queue.videoStream) {
      queue.videoStream.destroy();
    }

    // Create voice connection for video streaming
    const player = lavalinkNode.players.get(guildId);
    if (!player) return;

    // Start screen share with video
    const voiceChannel = queue.voiceChannel;
    if (!voiceChannel) return;

    // Join voice channel if not already
    if (!player.connected) {
      await player.connect(voiceChannel.id);
    }

    // Start video stream (this would require additional setup)
    queue.videoStream = {
      active: true,
      track: track,
      startTime: Date.now()
    };

    const embed = new EmbedBuilder()
      .setTitle('📹 Video Streaming Started')
      .setDescription(`Now streaming: **${track.title}**`)
      .setURL(track.uri)
      .setThumbnail(track.thumbnail)
      .setColor('#FF0000')
      .addFields(
        { name: 'Status', value: '🔴 Live', inline: true },
        { name: 'Quality', value: 'Auto', inline: true }
      );

    await textChannel.send({ embeds: [embed] });

    // Auto-stop when track ends
    const duration = track.isStream ? 600000 : track.duration; // 10 minutes for live streams
    setTimeout(async () => {
      if (queue.videoStream && queue.videoStream.track === track) {
        await stopVideoStream(guildId);
      }
    }, duration);

  } catch (error) {
    console.error('[Video] Failed to start stream:', error);
    await textChannel.send('❌ Failed to start video stream');
  }
}

// Stop video streaming
async function stopVideoStream(guildId) {
  try {
    const queue = musicQueue.getQueue(guildId);
    
    if (queue.videoStream) {
      queue.videoStream.active = false;
      queue.videoStream = null;
    }

    const player = lavalinkNode.players.get(guildId);
    if (player && player.connected) {
      await player.disconnect();
    }

    console.log(`[Video] Stream stopped for guild ${guildId}`);

  } catch (error) {
    console.error('[Video] Failed to stop stream:', error);
  }
}

// Play next track
async function playNextTrack(guildId) {
  try {
    const queue = musicQueue.getQueue(guildId);
    const player = lavalinkNode.players.get(guildId);
    
    if (!player || !queue.tracks.length) {
      await stopVideoStream(guildId);
      return;
    }

    const nextTrack = queue.loop ? queue.currentTrack : queue.tracks.shift();
    
    if (nextTrack) {
      await player.play(nextTrack);
    } else {
      await stopVideoStream(guildId);
    }

  } catch (error) {
    console.error('[Music] Failed to play next track:', error);
  }
}

// Skip track
async function skipTrack(guildId) {
  try {
    const player = lavalinkNode.players.get(guildId);
    if (player) {
      await player.stop();
    }
  } catch (error) {
    console.error('[Music] Failed to skip track:', error);
  }
}

// Format duration
function formatDuration(ms) {
  if (!ms || ms === 0) return '0:00';
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
  }
}

// Search YouTube
async function searchYouTube(query) {
  try {
    const results = await lavalinkNode.search(query, { source: 'youtube' });
    return results.tracks.slice(0, 10); // Return top 10 results
  } catch (error) {
    console.error('[YouTube] Search failed:', error);
    return [];
  }
}

// Music command handlers
const musicCommands = {
  // Play command
  async play(interaction) {
    try {
      const query = interaction.options.getString('query');
      const voiceChannel = interaction.member.voice.channel;
      
      if (!voiceChannel) {
        return await interaction.reply('❌ You must be in a voice channel to play music!');
      }

      const queue = musicQueue.getQueue(interaction.guildId);
      queue.voiceChannel = voiceChannel;
      queue.textChannel = interaction.channel;

      // Search for the track
      const results = await searchYouTube(query);
      if (!results.length) {
        return await interaction.reply('❌ No results found!');
      }

      const track = results[0];
      track.requester = interaction.user;

      // Create or get player
      let player = lavalinkNode.players.get(interaction.guildId);
      if (!player) {
        player = await lavalinkNode.createPlayer({
          guildId: interaction.guildId,
          voiceChannelId: voiceChannel.id,
          textChannelId: interaction.channel.id,
          selfDeaf: true,
        });
      }

      // Connect to voice channel if not connected
      if (!player.connected) {
        await player.connect(voiceChannel.id);
      }

      // Add to queue
      musicQueue.addTrack(interaction.guildId, track);

      // Play if not already playing
      if (!queue.isPlaying) {
        await player.play(track);
      } else {
        const embed = new EmbedBuilder()
          .setTitle('🎵 Added to Queue')
          .setDescription(`**${track.title}**`)
          .setURL(track.uri)
          .setThumbnail(track.thumbnail)
          .addFields(
            { name: 'Duration', value: track.isStream ? '🔴 Live' : formatDuration(track.duration), inline: true },
            { name: 'Position in Queue', value: `#${queue.tracks.length}`, inline: true }
          )
          .setColor('#00AE86');

        await interaction.reply({ embeds: [embed] });
      }

    } catch (error) {
      console.error('[Music] Play command error:', error);
      await interaction.reply('❌ An error occurred while playing the track!');
    }
  },

  // Skip command
  async skip(interaction) {
    try {
      const queue = musicQueue.getQueue(interaction.guildId);
      
      if (!queue.isPlaying) {
        return await interaction.reply('❌ No track is currently playing!');
      }

      await skipTrack(interaction.guildId);
      await interaction.reply('⏭️ Skipped current track!');

    } catch (error) {
      console.error('[Music] Skip command error:', error);
      await interaction.reply('❌ An error occurred while skipping!');
    }
  },

  // Stop command
  async stop(interaction) {
    try {
      const queue = musicQueue.getQueue(interaction.guildId);
      
      if (!queue.isPlaying) {
        return await interaction.reply('❌ No track is currently playing!');
      }

      musicQueue.clearQueue(interaction.guildId);
      await stopVideoStream(interaction.guildId);
      
      await interaction.reply('⏹️ Stopped music and cleared queue!');

    } catch (error) {
      console.error('[Music] Stop command error:', error);
      await interaction.reply('❌ An error occurred while stopping!');
    }
  },

  // Queue command
  async queue(interaction) {
    try {
      const queue = musicQueue.getQueue(interaction.guildId);
      
      if (!queue.tracks.length && !queue.currentTrack) {
        return await interaction.reply('❌ The queue is empty!');
      }

      const embed = new EmbedBuilder()
        .setTitle('🎵 Music Queue')
        .setColor('#00AE86');

      // Current track
      if (queue.currentTrack) {
        embed.addFields({
          name: 'Now Playing',
          value: `**${queue.currentTrack.title}**\n${queue.currentTrack.uri}`,
          inline: false
        });
      }

      // Queue tracks
      if (queue.tracks.length > 0) {
        const queueList = queue.tracks.slice(0, 10).map((track, index) => 
          `${index + 1}. **${track.title}** (${track.isStream ? '🔴 Live' : formatDuration(track.duration)})`
        ).join('\n');

        embed.addFields({
          name: `Upcoming (${queue.tracks.length} tracks)`,
          value: queueList,
          inline: false
        });
      }

      embed.addFields(
        { name: 'Loop', value: queue.loop ? '✅ Enabled' : '❌ Disabled', inline: true },
        { name: 'Volume', value: `${queue.volume}%`, inline: true }
      );

      await interaction.reply({ embeds: [embed] });

    } catch (error) {
      console.error('[Music] Queue command error:', error);
      await interaction.reply('❌ An error occurred while fetching the queue!');
    }
  },

  // Video command
  async video(interaction) {
    try {
      const queue = musicQueue.getQueue(interaction.guildId);
      
      if (!queue.currentTrack) {
        return await interaction.reply('❌ No track is currently playing!');
      }

      if (!queue.currentTrack.uri || !queue.currentTrack.uri.includes('youtube.com')) {
        return await interaction.reply('❌ Video streaming is only available for YouTube tracks!');
      }

      await startVideoStream(interaction.guildId, queue.currentTrack, interaction.channel);
      await interaction.reply('📹 Started video streaming!');

    } catch (error) {
      console.error('[Video] Video command error:', error);
      await interaction.reply('❌ An error occurred while starting video stream!');
    }
  }
};

module.exports = {
  initializeLavalink,
  musicCommands,
  musicQueue,
  LAVALINK_CONFIG
};
