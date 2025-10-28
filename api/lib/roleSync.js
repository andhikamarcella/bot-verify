async function getExtraRolesForUser(_client, _userId) {
  const raw = process.env.TRUSTED_GUILDS;
  if (!raw) {
    return [];
  }
  // TODO: implement cross-guild role lookup for premium badges.
  return [];
}

module.exports = {
  getExtraRolesForUser,
};
