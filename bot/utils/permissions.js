const { PermissionFlagsBits } = require('discord.js');

function hasAtLeastRole(member, roleId) {
  if (!member || !roleId) return false;
  const role = member.guild?.roles?.cache?.get(roleId);
  if (!role) return false;
  const highest = member.roles?.highest;
  if (!highest) return false;
  return highest.position >= role.position;
}

function isStaff(interaction) {
  if (!interaction?.inGuild?.() || !interaction.member) return false;

  if (interaction.guild?.ownerId && interaction.user?.id === interaction.guild.ownerId) {
    return true;
  }

  const memberHighestRole = interaction.member?.roles?.highest;
  const guildRoles = interaction.guild?.roles?.cache;
  if (memberHighestRole && guildRoles) {
    let guildHighestManualRole = null;
    for (const role of guildRoles.values()) {
      if (role.managed) continue;
      if (interaction.guild?.id && role.id === interaction.guild.id) continue;
      if (!guildHighestManualRole || role.position > guildHighestManualRole.position) {
        guildHighestManualRole = role;
      }
    }

    if (guildHighestManualRole && memberHighestRole.position >= guildHighestManualRole.position) {
      return true;
    }
  }

  if (
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
  ) {
    return true;
  }

  const staffRoleId = process.env.STAFF_ROLE_ID || process.env.ADMIN_ROLE_ID;
  if (staffRoleId && hasAtLeastRole(interaction.member, staffRoleId)) {
    return true;
  }

  return false;
}

function ensureStaff(interaction) {
  if (!isStaff(interaction)) {
    throw new Error('no-permission');
  }
}

function isMemberOrHigher(interaction) {
  if (!interaction?.inGuild?.() || !interaction.member) return false;
  const memberRoleId = process.env.MEMBER_ROLE_ID;
  if (!memberRoleId) return false;
  return hasAtLeastRole(interaction.member, memberRoleId);
}

function ensureMemberOrHigher(interaction) {
  if (!isMemberOrHigher(interaction)) {
    throw new Error('no-permission');
  }
}

module.exports = {
  hasAtLeastRole,
  isStaff,
  ensureStaff,
  isMemberOrHigher,
  ensureMemberOrHigher,
};
