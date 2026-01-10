const fs = require('fs');
const path = require('path');
const { Routes } = require('discord.js');

const REST_TIMEOUT_MS = Number(process.env.DISCORD_REST_TIMEOUT_MS || 30_000);

function withTimeout(promise, label) {
  let timer = null;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout:${label}`)), REST_TIMEOUT_MS);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

async function restCall(rest, method, route, options, label) {
  const startedAt = Date.now();
  try {
    const result = await withTimeout(rest[method](route, options), label);
    const elapsed = Date.now() - startedAt;
    console.log(`✅ ${label} (${elapsed}ms)`);
    return result;
  } catch (error) {
    const elapsed = Date.now() - startedAt;
    console.warn(`❌ ${label} gagal (${elapsed}ms): ${error?.message || error}`);
    throw error;
  }
}

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
  try {
    const globalRoute = Routes.applicationCommands(clientId);
    let commands = [];
    try {
      commands = await restCall(rest, 'get', globalRoute, undefined, 'Ambil command global');
    } catch (error) {
      console.warn('⚠️  Gagal mengambil command global:', error?.message || error);
      return;
    }

    if (!Array.isArray(commands) || commands.length === 0) {
      return;
    }

    for (const command of commands) {
      try {
        await restCall(
          rest,
          'delete',
          Routes.applicationCommand(clientId, command.id),
          undefined,
          `Hapus command global ${command.name}`
        );
      } catch (error) {
        const errorCode = error?.code ?? error?.rawError?.code;
        if (errorCode === 50240) {
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
  } catch (error) {
    const errorCode = error?.code ?? error?.rawError?.code;
    if (errorCode === 50240) {
      console.warn(
        '⚠️  Melewati pembersihan command global karena terdapat Entry Point yang tidak dapat dihapus.'
      );
      return;
    }
    console.warn('⚠️  Terjadi kesalahan saat membersihkan command global:', error?.message || error);
  }
}

async function clearGuildCommands(rest, clientId, guildId) {
  const guildRoute = Routes.applicationGuildCommands(clientId, guildId);
  await restCall(rest, 'put', guildRoute, { body: [] }, `Bersihkan command guild ${guildId}`);
  const remaining = await restCall(rest, 'get', guildRoute, undefined, `Cek sisa command guild ${guildId}`);
  if (Array.isArray(remaining) && remaining.length > 0) {
    for (const command of remaining) {
      await restCall(
        rest,
        'delete',
        Routes.applicationGuildCommand(clientId, guildId, command.id),
        undefined,
        `Hapus command guild ${command.name}`
      );
    }
  }
}

async function removeDuplicateGuildCommands(rest, clientId, guildId) {
  const guildRoute = Routes.applicationGuildCommands(clientId, guildId);
  const commands = await restCall(rest, 'get', guildRoute, undefined, `Ambil command guild ${guildId}`);
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
    await restCall(
      rest,
      'delete',
      Routes.applicationGuildCommand(clientId, guildId, command.id),
      undefined,
      `Hapus duplicate command guild ${command.name}`
    );
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
  await restCall(rest, 'put', guildRoute, { body: payload }, `Pasang command guild ${guildId}`);
  await removeDuplicateGuildCommands(rest, clientId, guildId);
  return payload.map((item) => item.name);
}

module.exports = {
  loadCommandManifest,
  clearGlobalCommands,
  syncGuildCommands,
};
