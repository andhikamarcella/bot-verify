const fs = require('fs');
const path = require('path');
const { Routes } = require('discord.js');

function collectCommandFiles(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.resolve(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectCommandFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

function loadCommandManifest(commandsDir, options = {}) {
  const { requireExecute = false } = options;
  const files = collectCommandFiles(commandsDir);
  const manifest = [];
  const duplicates = [];
  const seen = new Map();

  for (const file of files) {
    delete require.cache[require.resolve(file)];
    const commandModule = require(file);
    if (!commandModule?.data) {
      continue;
    }
    if (requireExecute && typeof commandModule.execute !== 'function') {
      console.warn(`⚠️  Command file ${file} tidak memiliki fungsi execute, dilewati.`);
      continue;
    }

    const name = commandModule.data.name;
    if (!name) {
      console.warn(`⚠️  Command file ${file} tidak memiliki nama, dilewati.`);
      continue;
    }

    if (seen.has(name)) {
      duplicates.push({ name, file, original: seen.get(name).file });
      continue;
    }

    const entry = {
      name,
      file,
      module: commandModule,
      json: commandModule.data.toJSON(),
    };

    seen.set(name, entry);
    manifest.push(entry);
  }

  return { manifest, duplicates };
}

async function clearGlobalCommands(rest, clientId) {
  const globalRoute = Routes.applicationCommands(clientId);
  let commands = [];
  try {
    commands = await rest.get(globalRoute);
  } catch (error) {
    console.warn('⚠️  Gagal mengambil command global:', error?.message || error);
    return;
  }

  if (!Array.isArray(commands) || commands.length === 0) {
    return;
  }

  for (const command of commands) {
    try {
      await rest.delete(Routes.applicationCommand(clientId, command.id));
    } catch (error) {
      if (error?.code === 50240) {
        console.warn(
          `⚠️  Command global ${command.name} tidak dapat dihapus (entry point). Melewati.`
        );
        continue;
      }
      console.warn(
        `⚠️  Gagal menghapus command global ${command.name}: ${error?.message || error}`
      );
    }
  }
}

async function clearGuildCommands(rest, clientId, guildId) {
  const guildRoute = Routes.applicationGuildCommands(clientId, guildId);
  await rest.put(guildRoute, { body: [] });
  const remaining = await rest.get(guildRoute);
  if (Array.isArray(remaining) && remaining.length > 0) {
    for (const command of remaining) {
      await rest.delete(Routes.applicationGuildCommand(clientId, guildId, command.id));
    }
  }
}

async function removeDuplicateGuildCommands(rest, clientId, guildId) {
  const guildRoute = Routes.applicationGuildCommands(clientId, guildId);
  const commands = await rest.get(guildRoute);
  if (!Array.isArray(commands) || commands.length === 0) {
    return;
  }
  const seen = new Set();
  const duplicates = [];
  for (const command of commands) {
    if (seen.has(command.name)) {
      duplicates.push(command);
    } else {
      seen.add(command.name);
    }
  }
  if (duplicates.length === 0) {
    return;
  }
  for (const command of duplicates) {
    await rest.delete(Routes.applicationGuildCommand(clientId, guildId, command.id));
  }
  console.warn(
    `⚠️  Duplicate slash command dihapus: ${duplicates.map((cmd) => cmd.name).join(', ')}`
  );
}

async function syncGuildCommands(rest, clientId, guildId, manifest) {
  if (!Array.isArray(manifest) || manifest.length === 0) {
    return [];
  }
  await clearGuildCommands(rest, clientId, guildId);
  const guildRoute = Routes.applicationGuildCommands(clientId, guildId);
  const payload = [];
  const seen = new Set();
  for (const entry of manifest) {
    if (!entry?.json?.name) continue;
    if (seen.has(entry.json.name)) continue;
    seen.add(entry.json.name);
    payload.push(entry.json);
  }
  await rest.put(guildRoute, { body: payload });
  await removeDuplicateGuildCommands(rest, clientId, guildId);
  return payload.map((item) => item.name);
}

module.exports = {
  loadCommandManifest,
  clearGlobalCommands,
  syncGuildCommands,
};
