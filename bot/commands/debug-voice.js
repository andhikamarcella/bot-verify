const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('debug-voice')
    .setDescription('Debug voice channel permissions and setup')
    .addStringOption((opt) =>
      opt
        .setName('channel')
        .setDescription('Voice channel ID (kosongkan untuk auto detect)')
        .setRequired(false)
    ),

  async execute(interaction, client) {
    const { guild, member } = interaction;
    const channelId = interaction.options.getString('channel') || process.env.VOICEVERIFY_CHANNEL_ID;
    
    await interaction.deferReply({ flags: 64 });

    const debug = [];
    
    // Check bot permissions
    const botMember = guild.members.me || (await guild.members.fetchMe().catch(() => null));
    if (!botMember) {
      debug.push('❌ Bot member tidak ditemukan');
      await interaction.editReply({ content: debug.join('\n') });
      return;
    }

    debug.push(`✅ Bot: ${botMember.user.tag}`);
    debug.push(`✅ Bot permissions: ${botMember.permissions.toArray().join(', ')}`);

    // Check voice channel
    if (!channelId) {
      debug.push('❌ VOICEVERIFY_CHANNEL_ID tidak diset');
    } else {
      const voiceChannel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
      if (!voiceChannel) {
        debug.push(`❌ Voice channel ${channelId} tidak ditemukan`);
      } else if (!voiceChannel.isVoiceBased()) {
        debug.push(`❌ Channel ${voiceChannel.name} bukan voice channel`);
      } else {
        debug.push(`✅ Voice channel: ${voiceChannel.name} (${channelId})`);
        
        // Check channel permissions for @everyone
        const everyoneRole = guild.roles.everyone;
        const everyonePerms = voiceChannel.permissionsFor(everyoneRole);
        debug.push(`🔍 @everyone permissions:`);
        debug.push(`  - Connect: ${everyonePerms.has('Connect') ? '✅' : '❌'}`);
        debug.push(`  - Speak: ${everyonePerms.has('Speak') ? '✅' : '❌'}`);
        debug.push(`  - ViewChannel: ${everyonePerms.has('ViewChannel') ? '✅' : '❌'}`);
        
        // Check channel permissions for bot
        const botPerms = voiceChannel.permissionsFor(botMember);
        debug.push(`🔍 Bot permissions in channel:`);
        debug.push(`  - Connect: ${botPerms.has('Connect') ? '✅' : '❌'}`);
        debug.push(`  - Speak: ${botPerms.has('Speak') ? '✅' : '❌'}`);
        debug.push(`  - ViewChannel: ${botPerms.has('ViewChannel') ? '✅' : '❌'}`);
        debug.push(`  - ManageChannels: ${botPerms.has('ManageChannels') ? '✅' : '❌'}`);
        debug.push(`  - MoveMembers: ${botPerms.has('MoveMembers') ? '✅' : '❌'}`);
        
        // Check user voice state
        const userVoiceState = member.voice;
        if (userVoiceState.channel) {
          debug.push(`✅ User di voice channel: ${userVoiceState.channel.name} (${userVoiceState.channelId})`);
          if (userVoiceState.channelId === channelId) {
            debug.push('✅ User di voice channel yang benar');
          } else {
            debug.push(`⚠️ User di voice channel berbeda`);
          }
        } else {
          debug.push('❌ User tidak di voice channel manapun');
        }
        
        // Try to update @everyone permissions
        try {
          await voiceChannel.permissionOverwrites.edit(everyoneRole, {
            Connect: true,
            Speak: true,
            ViewChannel: true,
          }, 'Debug: Force enable voice access');
          debug.push('✅ Berhasil update @everyone permissions');
        } catch (err) {
          debug.push(`❌ Gagal update permissions: ${err.message}`);
        }
      }
    }

    // Check environment variables
    debug.push('\n🔧 Environment Variables:');
    debug.push(`VOICEVERIFY_CHANNEL_ID: ${process.env.VOICEVERIFY_CHANNEL_ID || '❌ Tidak diset'}`);
    debug.push(`MEMBER_ROLE_ID: ${process.env.MEMBER_ROLE_ID || '❌ Tidak diset'}`);
    debug.push(`PUBLIC_FRONTEND_URL: ${process.env.PUBLIC_FRONTEND_URL || '❌ Tidak diset'}`);

    await interaction.editReply({ content: `\`\`\`\n${debug.join('\n')}\n\`\`\`` });
  },
};
