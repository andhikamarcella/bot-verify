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

  if (
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
  ) {
    return true;
  }

  const adminRoleId = process.env.ADMIN_ROLE_ID || '873576371249627136';
  const staffRoleIds = [process.env.STAFF_ROLE_ID, adminRoleId].filter(Boolean);
  if (staffRoleIds.length) {
    const cache = interaction.member?.roles?.cache;
    const list = interaction.member?.roles;
    for (const roleId of staffRoleIds) {
      if (cache?.has?.(roleId)) return true;
      if (Array.isArray(list) && list.includes(roleId)) return true;
    }
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
  if (isStaff(interaction)) return true;
  const memberRoleId = process.env.MEMBER_ROLE_ID;
  if (!memberRoleId) return false;
  const cache = interaction.member?.roles?.cache;
  if (cache?.has?.(memberRoleId)) return true;
  const list = interaction.member?.roles;
  if (Array.isArray(list) && list.includes(memberRoleId)) return true;
  return false;
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
