function normalizeLang(value) {
  const raw = String(value || '').toLowerCase().trim();
  if (raw === 'id' || raw === 'en') return raw;
  return null;
}

function detectLangFromInteraction(interaction, fallback = 'id') {
  const locale = interaction?.locale || interaction?.guildLocale;
  const raw = String(locale || '').toLowerCase();
  if (raw.startsWith('en')) return 'en';
  if (raw.startsWith('id')) return 'id';
  return fallback;
}

function t(lang, key) {
  const L = lang === 'en' ? 'en' : 'id';
  const dict = {
    id: {
      rulesTitle: '📜 Rules Server',
      rulesMissing: 'Admin belum set rules. Minta staff untuk set rules channel/link ya.',
      resendTitle: '🔁 Kirim Ulang Verifikasi',
      resendSent: 'Sudah aku kirim ulang link verifikasi ke DM kamu. Cek DM ya.',
      resendCantDm: 'Aku nggak bisa kirim DM ke kamu. Tolong buka DM kamu dulu, lalu coba lagi.',
      resendNoFrontend: 'Link frontend belum diset. Hubungi admin server.',
      languageSet: 'Sip! Bahasa DM kamu sekarang: **{lang}**.',
      languageHelp: 'Pilih bahasa untuk DM bot.',
    },
    en: {
      rulesTitle: '📜 Server Rules',
      rulesMissing: 'Rules are not configured yet. Ask staff to set rules channel/link.',
      resendTitle: '🔁 Resend Verification',
      resendSent: 'I re-sent your verification link via DM. Please check your DMs.',
      resendCantDm: "I can't DM you. Please enable DMs and try again.",
      resendNoFrontend: 'Frontend link is not configured. Contact server admins.',
      languageSet: 'Done! Your DM language is now: **{lang}**.',
      languageHelp: 'Pick your DM language.',
    },
  };
  return dict[L][key] || key;
}

module.exports = {
  normalizeLang,
  detectLangFromInteraction,
  t,
};

