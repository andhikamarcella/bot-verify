const { EmbedBuilder, Colors } = require('discord.js');
const { describeRisk } = require('../../api/lib/riskScore');

function pickColor(riskLabel) {
  switch (riskLabel) {
    case 'HIGH':
      return Colors.Red;
    case 'MEDIUM':
      return Colors.Orange;
    default:
      return Colors.Green;
  }
}

async function sendVerificationLog({
  client,
  guildId,
  config,
  user,
  member,
  type,
  status,
  riskScore = 0,
  country = null,
  suspectReasons = [],
  reason = null,
}) {
  if (!config?.logsChannelId) {
    return;
  }
  try {
    const guild = await client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(config.logsChannelId);
    if (!channel) return;

    const risk = describeRisk(riskScore);
    const embed = new EmbedBuilder()
      .setTitle(`${type === 'success' ? '✅ Verification Success' : '⚠️ Verification Event'}`)
      .setColor(pickColor(risk.label))
      .setTimestamp(new Date())
      .addFields(
        { name: 'User', value: `${user?.tag || member?.user?.tag || 'Unknown'} (${member?.id || user?.id || 'unknown'})`, inline: false },
        {
          name: 'Status',
          value: `${status} • Risk ${risk.emoji} ${risk.text} (${riskScore})`,
          inline: false,
        }
      );

    if (member?.user?.createdAt) {
      embed.addFields({
        name: 'Account Created',
        value: member.user.createdAt.toISOString(),
        inline: true,
      });
    }

    if (country) {
      embed.addFields({ name: 'Country', value: country, inline: true });
    }

    if (suspectReasons.length > 0) {
      embed.addFields({ name: 'Flags', value: suspectReasons.join(', '), inline: false });
    }

    if (reason) {
      embed.addFields({ name: 'Notes', value: reason, inline: false });
    }

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Failed to send verification log', error);
  }
}

module.exports = {
  sendVerificationLog,
};
