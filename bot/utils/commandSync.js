const fs = require('fs');
const path = require('path');
const { Routes } = require('discord.js');

const RAW_REST_TIMEOUT_MS =
  process.env.DISCORD_REST_TIMEOUT_MS === undefined
    ? 0
    : Number(process.env.DISCORD_REST_TIMEOUT_MS);
const REST_TIMEOUT_MS = Number.isFinite(RAW_REST_TIMEOUT_MS) && RAW_REST_TIMEOUT_MS > 0 ? RAW_REST_TIMEOUT_MS : null;

const RAW_COMMAND_SYNC_DELAY_MS =
  process.env.COMMAND_SYNC_DELAY_MS === undefined
    ? 1250
    : Number(process.env.COMMAND_SYNC_DELAY_MS);
const COMMAND_SYNC_DELAY_MS =
  Number.isFinite(RAW_COMMAND_SYNC_DELAY_MS) && RAW_COMMAND_SYNC_DELAY_MS >= 0 ? RAW_COMMAND_SYNC_DELAY_MS : 1250;

const RAW_REST_HARD_TIMEOUT_MS =
  process.env.DISCORD_REST_HARD_TIMEOUT_MS === undefined
    ? 300000
    : Number(process.env.DISCORD_REST_HARD_TIMEOUT_MS);
const REST_HARD_TIMEOUT_MS =
  Number.isFinite(RAW_REST_HARD_TIMEOUT_MS) && RAW_REST_HARD_TIMEOUT_MS > 0 ? RAW_REST_HARD_TIMEOUT_MS : null;

const RAW_REST_RETRIES =
  process.env.DISCORD_REST_RETRIES === undefined
    ? 2
    : Number(process.env.DISCORD_REST_RETRIES);
const REST_RETRIES = Number.isFinite(RAW_REST_RETRIES) && RAW_REST_RETRIES >= 0 ? RAW_REST_RETRIES : 2;

const rateLimitLoggerAttached = new WeakSet();

function attachRateLimitLogger(rest) {
  if (!rest || typeof rest.on !== 'function') return;
  if (rateLimitLoggerAttached.has(rest)) return;
  rateLimitLoggerAttached.add(rest);

  rest.on('rateLimited', (info) => {
    try {
      const timeout = info?.timeout;
      const limit = info?.limit;
      const method = info?.method;
      const route = info?.route || info?.path;
      const global = info?.global;
      console.warn(
        `🛑 Discord rate limit${global ? ' (GLOBAL)' : ''}: ${method || ''} ${route || ''} • limit=${limit ?? '?'} • wait=${timeout ?? '?'}ms`
      );
    } catch (_) {
      console.warn('🛑 Discord rate limit: (detail tidak terbaca)');
    }
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, label) {
  const normalizedLabel = String(label || '').toLowerCase();
  if (normalizedLabel.includes('command guild')) {
    return promise;
  }
  if (!REST_TIMEOUT_MS) {
    return promise;
  }
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

function withHardTimeout(promise, label) {
  if (!REST_HARD_TIMEOUT_MS) {
    return promise;
  }
  let timer = null;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout-hard:${label}`)), REST_HARD_TIMEOUT_MS);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

function shouldBypassTimeout(label, route) {
  const normalizedLabel = String(label || '').toLowerCase();
  if (normalizedLabel.includes('command guild')) {
    return true;
  }
  const normalizedRoute = String(route || '');
  return normalizedRoute.includes('/guilds/') && normalizedRoute.includes('/commands');
}

async function restCall(rest, method, route, options, label) {
  attachRateLimitLogger(rest);

  const heartbeatRaw =
    process.env.DISCORD_REST_HEARTBEAT_MS === undefined
      ? 15000
      : Number(process.env.DISCORD_REST_HEARTBEAT_MS);
  const heartbeatMs = Number.isFinite(heartbeatRaw) && heartbeatRaw > 0 ? heartbeatRaw : null;

  const isGuildCommandOp = shouldBypassTimeout(label, route);
  const maxAttempts = isGuildCommandOp ? Math.max(1, REST_RETRIES + 1) : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const attemptLabel = attempt > 1 ? `${label} (attempt ${attempt}/${maxAttempts})` : label;
    const startedAt = Date.now();
    let heartbeatTimer = null;
    try {
      console.log(`➡️  ${attemptLabel}... [${String(method || '').toUpperCase()} ${route}]`);
      if (heartbeatMs) {
        heartbeatTimer = setInterval(() => {
          const elapsed = Date.now() - startedAt;
          console.log(`⏳ ${attemptLabel} masih berjalan... (${elapsed}ms)`);
        }, heartbeatMs);
      }

      const callPromise = rest[method](route, options);
      const guarded = isGuildCommandOp ? withHardTimeout(callPromise, attemptLabel) : withTimeout(callPromise, attemptLabel);
      const result = await guarded;

      const elapsed = Date.now() - startedAt;
      console.log(`✅ ${attemptLabel} (${elapsed}ms)`);
      return result;
    } catch (error) {
      const elapsed = Date.now() - startedAt;
      console.warn(`❌ ${attemptLabel} gagal (${elapsed}ms): ${error?.message || error}`);
      if (attempt < maxAttempts) {
        const backoffMs = Math.min(15000, 2000 * attempt);
        console.warn(`🔁 Retry dalam ${backoffMs}ms...`);
        await sleep(backoffMs);
        continue;
      }
      throw error;
    } finally {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
      }
    }
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

async function syncGuildCommandsIndividually(rest, clientId, guildId, payload) {
  const guildRoute = Routes.applicationGuildCommands(clientId, guildId);
  const existing = await restCall(rest, 'get', guildRoute, undefined, `Ambil command guild ${guildId}`);
  const existingByName = new Map();
  if (Array.isArray(existing)) {
    for (const cmd of existing) {
      if (cmd?.name) {
        existingByName.set(cmd.name, cmd);
      }
    }
  }

  const desiredNames = new Set(payload.map((cmd) => cmd.name));

  for (let index = 0; index < payload.length; index += 1) {
    const cmd = payload[index];
    console.log(`🛠️  Sync command guild [${index + 1}/${payload.length}]: ${cmd.name}`);
    const found = existingByName.get(cmd.name);
    if (found?.id) {
      await restCall(
        rest,
        'patch',
        Routes.applicationGuildCommand(clientId, guildId, found.id),
        { body: cmd },
        `Update command guild ${cmd.name}`
      );
    } else {
      await restCall(rest, 'post', guildRoute, { body: cmd }, `Buat command guild ${cmd.name}`);
    }
    await sleep(COMMAND_SYNC_DELAY_MS);
  }

  if (Array.isArray(existing)) {
    for (const cmd of existing) {
      if (!cmd?.id || !cmd?.name) continue;
      if (!desiredNames.has(cmd.name)) {
        await restCall(
          rest,
          'delete',
          Routes.applicationGuildCommand(clientId, guildId, cmd.id),
          undefined,
          `Hapus command guild ${cmd.name}`
        );
        await sleep(COMMAND_SYNC_DELAY_MS);
      }
    }
  }
}

async function syncGuildCommands(rest, clientId, guildId, manifest) {
  if (!Array.isArray(manifest) || manifest.length === 0) {
    return [];
  }

  const onlyNamesRaw = process.env.COMMAND_SYNC_ONLY || '';
  const onlyNames = new Set(
    onlyNamesRaw
      .split(',')
      .map((v) => String(v || '').trim())
      .filter(Boolean)
  );

  if (process.env.COMMAND_SYNC_SKIP_CLEAR !== 'true') {
    await clearGuildCommands(rest, clientId, guildId);
  } else {
    console.warn(`⚠️  Melewati clear guild commands karena COMMAND_SYNC_SKIP_CLEAR=true`);
  }

  const guildRoute = Routes.applicationGuildCommands(clientId, guildId);
  const payload = [];
  const seen = new Set();
  for (const entry of manifest) {
    if (!entry?.json?.name) {
      console.warn(`⚠️  Mengabaikan command tanpa nama dari manifest:`, entry?.json);
      continue;
    }
    if (seen.has(entry.json.name)) continue;
    if (onlyNames.size > 0 && !onlyNames.has(entry.json.name)) continue;
    seen.add(entry.json.name);
    payload.push(entry.json);
  }
  const payloadBytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  console.log(
    `🧾 Menyiapkan ${payload.length} command untuk guild ${guildId} (~${Math.round(payloadBytes / 1024)}KB)...`
  );

  const modeRaw = String(process.env.COMMAND_SYNC_MODE || 'individual').toLowerCase();
  const mode = modeRaw === 'bulk' || modeRaw === 'individual' ? modeRaw : 'auto';

  if (mode === 'individual') {
    await syncGuildCommandsIndividually(rest, clientId, guildId, payload);
  } else {
    try {
      await restCall(rest, 'put', guildRoute, { body: payload }, `Pasang command guild ${guildId}`);
    } catch (error) {
      console.warn(`⚠️  Bulk overwrite gagal, mencoba mode individual...`);
      await syncGuildCommandsIndividually(rest, clientId, guildId, payload);
    }
  }

  await removeDuplicateGuildCommands(rest, clientId, guildId);
  return payload.map((item) => item.name);
}

module.exports = {
  loadCommandManifest,
  clearGlobalCommands,
  syncGuildCommands,
};
