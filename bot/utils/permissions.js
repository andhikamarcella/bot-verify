const { PermissionFlagsBits } = require('discord.js');

function hasAtLeastRole(member, roleId) {
  if (!member || !roleId) return false;
  const role = member.guild?.roles?.cache?.get(roleId);
  if (!role) return false;
  const highest = member.roles?.highest;
  if (!highest) return false;
  return highest.position >= role.position;
}

function hasNonEveryoneRole(member) {
  const cache = member?.roles?.cache;
  const guildId = member?.guild?.id;
  if (!cache || !guildId) return false;
  return cache.some((role) => role?.id && role.id !== guildId);
}

function isStaffMember(member) {
  if (!member) return false;

  if (member.guild?.ownerId && member.id === member.guild.ownerId) {
    return true;
  }

  if (
    member.permissions?.has(PermissionFlagsBits.Administrator) ||
    member.permissions?.has(PermissionFlagsBits.ManageGuild)
  ) {
    return true;
  }

  const adminRoleId = process.env.ADMIN_ROLE_ID || '873576371249627136';
  const staffRoleIds = [process.env.STAFF_ROLE_ID, adminRoleId].filter(Boolean);
  const cache = member.roles?.cache;
  for (const roleId of staffRoleIds) {
    if (cache?.has?.(roleId)) return true;
  }
  return false;
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
  hasNonEveryoneRole,
  isStaff,
  isStaffMember,
  ensureStaff,
  isMemberOrHigher,
  ensureMemberOrHigher,
};
