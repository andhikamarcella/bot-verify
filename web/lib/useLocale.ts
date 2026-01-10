'use client';

import { useEffect, useState } from 'react';

export type LocaleKey = 'en' | 'id';

export type CopyShape = {
  titleSuffix: string;
  subtitle: string;
  button: string;
  tokenMissing: string;
  verifying: string;
  successMessage: string;
  verifyFailed: string;
  captchaMissing: string;
  captchaFallback: string;
  footer: string;
  
  // New Additions
  step0: string;
  step1: string;
  step2: string;
  step3: string;
  
  termsTitle: string;
  privacyTitle: string;
  termsCheckbox: string;
  privacyCheckbox: string;
  docs: string;
  readToEnd: string;
  agreeBtn: string;
  
  tokenExpiresIn: string;
  tokenExpired: string;
  
  envCheck: {
    botOffline: string;
    maintenance: string;
    maintenanceReason: string;
    checking: string;
    ok: string;
  };
  
  errors: {
    linkUsed: string;
    generic: string;
    apiTimeout: string;
  };
  
  welcome: string;
  rolePreview: string;
  estimatedTime: string;
  antiScam: string;
  
  accessDenied: string;
  verified: string;
  openDiscord: string;
  back: string;
  
  faq: {
    title: string;
    q1: string;
    a1: string;
  };
  
  termsContent: Array<{ title: string; text: string }>;
  privacyContent: Array<{ title: string; text: string }>;
};

const COPY: Record<LocaleKey, CopyShape> = {
  en: {
    titleSuffix: 'Verification',
    subtitle: 'Complete these steps to unlock full access.',
    button: 'Start Verification',
    tokenMissing: 'Invalid or expired token. Please request a new one.',
    verifying: 'Verifying your account...',
    successMessage: '✅ Verification successful! You are now a Member.',
    verifyFailed: 'Verification failed. Please try again.',
    captchaMissing: 'Please complete the security check.',
    captchaFallback: 'Click the emoji {emoji} to continue.',
    footer: 'Need help? Use /help in the server.',
    
    step0: 'Agreement',
    step1: 'Security Check',
    step2: 'Confirm',
    step3: 'Done',
    
    termsTitle: 'Terms of Service',
    privacyTitle: 'Privacy Policy',
    termsCheckbox: 'I have read and agree to the Terms of Service',
    privacyCheckbox: 'I agree to the Privacy Policy',
    docs: 'Docs',
    readToEnd: 'Please scroll to the end to agree',
    agreeBtn: 'I Understand',
    
    tokenExpiresIn: 'Token expires in',
    tokenExpired: 'Token Expired',
    
    envCheck: {
      botOffline: 'Bot is currently offline',
      maintenance: 'System is under maintenance',
      maintenanceReason: 'Reason:',
      checking: 'Checking system status...',
      ok: 'System Operational',
    },
    
    errors: {
      linkUsed: 'This link has already been used on another device.',
      generic: 'An unexpected error occurred.',
      apiTimeout: 'Discord API is busy, retrying...',
    },
    
    welcome: 'Welcome to',
    rolePreview: 'You will receive the Member role',
    estimatedTime: '⏱️ Takes about 10-20 seconds',
    antiScam: '⚠️ Admins will never ask for your password or token.',
    
    accessDenied: 'Access Denied',
    verified: 'Verified!',
    openDiscord: 'Open Discord',
    back: 'Back',
    
    faq: {
      title: 'Common Issues',
      q1: 'Why do I need to verify?',
      a1: 'To prevent spam and bots in our community.',
    },
    
    termsContent: [
      { title: '1. Introduction', text: 'Welcome to {guildName}. By verifying your account, you agree to be bound by these Terms of Service. These terms govern your access to and use of our Discord server and verification system. Please read these terms carefully before proceeding with verification.' },
      { title: '2. Eligibility', text: 'You must be at least 13 years old to use Discord and verify on this server. By verifying, you represent and warrant that you meet the age requirement and have the legal capacity to enter into this agreement. You must also comply with Discord\'s Terms of Service and Community Guidelines.' },
      { title: '3. User Conduct', text: 'You agree not to spam, raid, or harass other members. Multiple accounts are strictly prohibited. You must not share your verification token with others, attempt to bypass security measures, use automated tools to verify, or engage in any activity that disrupts the server or violates Discord\'s Terms of Service. Prohibited activities include but are not limited to: harassment, hate speech, sharing illegal content, doxxing, or any form of abuse.' },
      { title: '4. Account Security', text: 'You are responsible for maintaining the security of your Discord account. Do not share your password, verification tokens, or any authentication credentials with anyone. Admins will never ask for your password or token. If you suspect your account has been compromised, contact server staff immediately.' },
      { title: '5. Bot Usage and Data Collection', text: 'Our verification bot collects your Discord User ID, Username, and IP address (hashed) for security purposes. This data is used solely for verification, preventing abuse, and maintaining server security. The bot operates automatically and may perform security checks to ensure legitimate access.' },
      { title: '6. Verification Process', text: 'The verification process requires you to complete security checks, including CAPTCHA verification. You must complete all steps honestly and accurately. Attempting to bypass or circumvent the verification process is strictly prohibited and may result in permanent ban from the server.' },
      { title: '7. Termination', text: 'Admins reserve the right to revoke your verified status at any time for violations of these terms, suspicious activity, or any reason deemed necessary for server security. Termination may occur without prior notice. You may also request account deletion by contacting server staff.' },
      { title: '8. Intellectual Property', text: 'All content, logos, and materials on this server are the property of {guildName} or their respective owners. You may not copy, reproduce, or distribute any server content without explicit written permission. User-generated content remains the property of the creator but grants the server a license to use it within the server.' },
      { title: '9. Liability and Disclaimers', text: 'We are not responsible for any issues arising from Discord API downtimes, third-party service failures, or technical issues beyond our control. The server is provided "as is" without warranties of any kind. We do not guarantee uninterrupted access or that the service will be error-free. You use the server at your own risk.' },
      { title: '10. Indemnification', text: 'You agree to indemnify and hold harmless {guildName}, its administrators, moderators, and affiliates from any claims, damages, losses, or expenses arising from your use of the server, violation of these terms, or infringement of any rights of another party.' },
      { title: '11. Modifications to Terms', text: 'These terms may change at any time without prior notice. Continued use of the server after changes constitutes acceptance of the modified terms. It is your responsibility to review these terms periodically. Significant changes will be announced in the server, but you should check these terms regularly.' },
      { title: '12. Severability', text: 'If any provision of these terms is found to be invalid or unenforceable, the remaining provisions will continue in full force and effect. The invalid provision will be replaced with a valid provision that most closely reflects the intent of the original provision.' },
      { title: '13. Governing Law', text: 'These terms are governed by applicable local laws. Any disputes arising from these terms or your use of the server will be resolved through appropriate legal channels. By agreeing to these terms, you consent to the jurisdiction of the relevant courts.' },
      { title: '14. Final Agreement', text: 'By clicking "I Understand", you confirm that you have read, understood, and agree to be bound by these Terms of Service. You confirm that you are human, eligible to join, and will comply with all server rules and Discord\'s Terms of Service. This agreement is effective immediately upon verification.' },
    ],
    
    privacyContent: [
      { title: '1. Introduction', text: 'This Privacy Policy explains how {guildName} collects, uses, stores, and protects your personal information when you use our Discord server and verification system. We are committed to protecting your privacy and handling your data responsibly in accordance with applicable data protection laws.' },
      { title: '2. Data Collection', text: 'We collect the following information during verification: Discord User ID, Username, Discriminator, Avatar URL, IP Address (hashed using secure hashing algorithms), verification timestamp, and device information provided by Cloudflare Turnstile. We may also collect information about your server activity, messages, and interactions for moderation and security purposes.' },
      { title: '3. Purpose of Data Collection', text: 'This data is used solely for verification, preventing abuse, spam prevention, maintaining server security, enforcing server rules, investigating violations, improving our services, and complying with legal obligations. We do not use your data for marketing purposes or sell it to third parties.' },
      { title: '4. Data Processing and Storage', text: 'Your data is processed securely using industry-standard encryption and security measures. Verification logs are stored securely on our servers for 30 days, after which they are anonymized or deleted. Anonymized data may be retained for statistical purposes but cannot be linked back to your identity.' },
      { title: '5. Data Sharing and Third Parties', text: 'We use Cloudflare Turnstile for CAPTCHA verification, which may collect device information, browser data, and interaction patterns. Cloudflare processes this data according to their Privacy Policy. We may share data with Discord Inc. as required by their Terms of Service. We do not share your data with other third parties except as required by law or to protect our rights and safety.' },
      { title: '6. Data Security', text: 'We implement appropriate technical and organizational measures to protect your data against unauthorized access, alteration, disclosure, or destruction. This includes encryption, secure servers, access controls, and regular security audits. However, no method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.' },
      { title: '7. Your Rights', text: 'You have the right to access, correct, delete, or restrict processing of your personal data. You can request data deletion by contacting the server owner or staff. You may also object to processing of your data or request data portability. To exercise these rights, contact server staff with your Discord User ID and a clear description of your request.' },
      { title: '8. Cookies and Local Storage', text: 'We use local storage (not cookies) to save your language preference and verification state. This data is stored locally on your device and is not transmitted to our servers except as part of the verification process. You can clear this data at any time through your browser settings.' },
      { title: '9. Children\'s Privacy', text: 'Our services are not directed to children under 13. We do not knowingly collect personal information from children under 13. If you are a parent or guardian and believe your child has provided us with personal information, please contact us immediately so we can delete such information.' },
      { title: '10. International Data Transfers', text: 'Your data may be transferred to and processed in countries other than your country of residence. These countries may have different data protection laws. By using our services, you consent to the transfer of your data to these countries. We ensure appropriate safeguards are in place to protect your data.' },
      { title: '11. Data Breach Notification', text: 'In the event of a data breach that may affect your personal information, we will notify affected users and relevant authorities as required by applicable law. We will take immediate steps to contain the breach and mitigate any potential harm.' },
      { title: '12. Changes to Privacy Policy', text: 'We may update this Privacy Policy from time to time to reflect changes in our practices or legal requirements. We will notify you of significant changes by posting the updated policy in the server or through other communication channels. Your continued use of our services after changes constitutes acceptance of the updated policy.' },
      { title: '13. Contact Information', text: 'For privacy concerns, data requests, or questions about this Privacy Policy, reach out to server staff through Discord. Include your Discord User ID and a clear description of your request. We will respond to your inquiry within a reasonable timeframe, typically within 7-14 business days.' },
      { title: '14. Consent', text: 'By using our verification system and clicking "I Understand", you consent to the collection, processing, and storage of your data as described in this Privacy Policy. You acknowledge that you have read and understood this policy and agree to its terms.' },
    ],
  },
  id: {
    titleSuffix: 'Verifikasi',
    subtitle: 'Selesaikan langkah ini untuk akses penuh.',
    button: 'Mulai Verifikasi',
    tokenMissing: 'Token tidak valid atau sudah kadaluarsa.',
    verifying: 'Memproses verifikasi...',
    successMessage: '✅ Verifikasi berhasil! Kamu sudah menjadi Member.',
    verifyFailed: 'Verifikasi gagal. Silakan coba lagi.',
    captchaMissing: 'Silakan selesaikan pemeriksaan keamanan.',
    captchaFallback: 'Klik emoji {emoji} untuk lanjut.',
    footer: 'Butuh bantuan? Gunakan /help di server.',
    
    step0: 'Persetujuan',
    step1: 'Cek Keamanan',
    step2: 'Konfirmasi',
    step3: 'Selesai',
    
    termsTitle: 'Syarat & Ketentuan',
    privacyTitle: 'Kebijakan Privasi',
    termsCheckbox: 'Saya telah membaca dan menyetujui Syarat & Ketentuan',
    privacyCheckbox: 'Saya setuju dengan Kebijakan Privasi',
    docs: 'Dokumen',
    readToEnd: 'Scroll sampai bawah untuk menyetujui',
    agreeBtn: 'Saya Mengerti',
    
    tokenExpiresIn: 'Token berakhir dalam',
    tokenExpired: 'Token Kadaluarsa',
    
    envCheck: {
      botOffline: 'Bot sedang offline',
      maintenance: 'Sistem sedang maintenance',
      maintenanceReason: 'Alasan:',
      checking: 'Mengecek status sistem...',
      ok: 'Sistem Normal',
    },
    
    errors: {
      linkUsed: 'Link ini sudah dibuka di perangkat lain.',
      generic: 'Terjadi kesalahan tidak terduga.',
      apiTimeout: 'Discord API sedang sibuk, mencoba ulang...',
    },
    
    welcome: 'Selamat datang di',
    rolePreview: 'Kamu akan mendapatkan role Member',
    estimatedTime: '⏱️ Proses ±10-20 detik',
    antiScam: '⚠️ Admin tidak pernah meminta password/token kamu.',
    
    accessDenied: 'Akses Ditolak',
    verified: 'Terverifikasi!',
    openDiscord: 'Buka Discord',
    back: 'Kembali',
    
    faq: {
      title: 'Masalah Umum',
      q1: 'Kenapa harus verifikasi?',
      a1: 'Untuk mencegah spam dan bot di komunitas kami.',
    },
    
    termsContent: [
      { title: '1. Pengenalan', text: 'Selamat datang di {guildName}. Dengan memverifikasi akun Anda, Anda menyetujui untuk terikat oleh Syarat & Ketentuan ini. Ketentuan ini mengatur akses dan penggunaan server Discord dan sistem verifikasi kami. Harap baca ketentuan ini dengan seksama sebelum melanjutkan verifikasi.' },
      { title: '2. Kelayakan', text: 'Anda harus berusia minimal 13 tahun untuk menggunakan Discord dan memverifikasi di server ini. Dengan memverifikasi, Anda menyatakan dan menjamin bahwa Anda memenuhi persyaratan usia dan memiliki kapasitas hukum untuk memasuki perjanjian ini. Anda juga harus mematuhi Syarat Layanan dan Pedoman Komunitas Discord.' },
      { title: '3. Perilaku Pengguna', text: 'Anda setuju untuk tidak melakukan spam, raid, atau melecehkan anggota lain. Akun ganda sangat dilarang. Anda tidak boleh membagikan token verifikasi kepada orang lain, mencoba mem-bypass tindakan keamanan, menggunakan alat otomatis untuk verifikasi, atau terlibat dalam aktivitas apa pun yang mengganggu server atau melanggar Syarat Layanan Discord. Aktivitas yang dilarang termasuk tetapi tidak terbatas pada: pelecehan, ujaran kebencian, berbagi konten ilegal, doxxing, atau bentuk penyalahgunaan apa pun.' },
      { title: '4. Keamanan Akun', text: 'Anda bertanggung jawab untuk menjaga keamanan akun Discord Anda. Jangan membagikan kata sandi, token verifikasi, atau kredensial autentikasi apa pun kepada siapa pun. Admin tidak akan pernah meminta kata sandi atau token Anda. Jika Anda mencurigai akun Anda telah diretas, hubungi staf server segera.' },
      { title: '5. Penggunaan Bot dan Pengumpulan Data', text: 'Bot verifikasi kami mengumpulkan ID Pengguna Discord, Nama Pengguna, dan alamat IP Anda (dihash) untuk keamanan. Data ini digunakan semata-mata untuk verifikasi, mencegah penyalahgunaan, dan menjaga keamanan server. Bot beroperasi secara otomatis dan dapat melakukan pemeriksaan keamanan untuk memastikan akses yang sah.' },
      { title: '6. Proses Verifikasi', text: 'Proses verifikasi mengharuskan Anda menyelesaikan pemeriksaan keamanan, termasuk verifikasi CAPTCHA. Anda harus menyelesaikan semua langkah dengan jujur dan akurat. Mencoba mem-bypass atau mengelak dari proses verifikasi sangat dilarang dan dapat mengakibatkan larangan permanen dari server.' },
      { title: '7. Pengakhiran', text: 'Admin berhak mencabut status terverifikasi Anda kapan saja karena pelanggaran ketentuan ini, aktivitas mencurigakan, atau alasan apa pun yang dianggap perlu untuk keamanan server. Pengakhiran dapat terjadi tanpa pemberitahuan sebelumnya. Anda juga dapat meminta penghapusan akun dengan menghubungi staf server.' },
      { title: '8. Kekayaan Intelektual', text: 'Semua konten, logo, dan materi di server ini adalah milik {guildName} atau pemilik masing-masing. Anda tidak boleh menyalin, mereproduksi, atau mendistribusikan konten server apa pun tanpa izin tertulis eksplisit. Konten yang dibuat pengguna tetap menjadi milik pembuat tetapi memberikan server lisensi untuk menggunakannya di dalam server.' },
      { title: '9. Tanggung Jawab dan Penolakan', text: 'Kami tidak bertanggung jawab atas masalah yang timbul dari downtime API Discord, kegagalan layanan pihak ketiga, atau masalah teknis di luar kendali kami. Server disediakan "sebagaimana adanya" tanpa jaminan apa pun. Kami tidak menjamin akses tanpa gangguan atau bahwa layanan akan bebas dari kesalahan. Anda menggunakan server dengan risiko Anda sendiri.' },
      { title: '10. Ganti Rugi', text: 'Anda setuju untuk mengganti rugi dan membebaskan {guildName}, administrator, moderator, dan afiliasinya dari klaim, kerusakan, kerugian, atau pengeluaran apa pun yang timbul dari penggunaan server Anda, pelanggaran ketentuan ini, atau pelanggaran hak pihak lain.' },
      { title: '11. Modifikasi Ketentuan', text: 'Ketentuan ini dapat berubah sewaktu-waktu tanpa pemberitahuan sebelumnya. Penggunaan server yang berkelanjutan setelah perubahan merupakan penerimaan ketentuan yang dimodifikasi. Adalah tanggung jawab Anda untuk meninjau ketentuan ini secara berkala. Perubahan signifikan akan diumumkan di server, tetapi Anda harus memeriksa ketentuan ini secara teratur.' },
      { title: '12. Pemisahan', text: 'Jika ketentuan ketentuan ini ditemukan tidak valid atau tidak dapat dilaksanakan, ketentuan yang tersisa akan terus berlaku penuh. Ketentuan yang tidak valid akan diganti dengan ketentuan yang valid yang paling dekat mencerminkan maksud ketentuan asli.' },
      { title: '13. Hukum yang Berlaku', text: 'Ketentuan ini diatur oleh hukum lokal yang berlaku. Setiap sengketa yang timbul dari ketentuan ini atau penggunaan server Anda akan diselesaikan melalui saluran hukum yang sesuai. Dengan menyetujui ketentuan ini, Anda menyetujui yurisdiksi pengadilan yang relevan.' },
      { title: '14. Persetujuan Akhir', text: 'Dengan mengklik "Saya Mengerti", Anda mengonfirmasi bahwa Anda telah membaca, memahami, dan menyetujui untuk terikat oleh Syarat & Ketentuan ini. Anda mengonfirmasi bahwa Anda adalah manusia, memenuhi syarat untuk bergabung, dan akan mematuhi semua aturan server dan Syarat Layanan Discord. Perjanjian ini berlaku segera setelah verifikasi.' },
    ],
    
    privacyContent: [
      { title: '1. Pengenalan', text: 'Kebijakan Privasi ini menjelaskan bagaimana {guildName} mengumpulkan, menggunakan, menyimpan, dan melindungi informasi pribadi Anda ketika Anda menggunakan server Discord dan sistem verifikasi kami. Kami berkomitmen untuk melindungi privasi Anda dan menangani data Anda secara bertanggung jawab sesuai dengan undang-undang perlindungan data yang berlaku.' },
      { title: '2. Pengumpulan Data', text: 'Kami mengumpulkan informasi berikut selama verifikasi: ID Pengguna Discord, Nama Pengguna, Discriminator, URL Avatar, Alamat IP (dihash menggunakan algoritma hashing yang aman), stempel waktu verifikasi, dan informasi perangkat yang disediakan oleh Cloudflare Turnstile. Kami juga dapat mengumpulkan informasi tentang aktivitas server, pesan, dan interaksi Anda untuk tujuan moderasi dan keamanan.' },
      { title: '3. Tujuan Pengumpulan Data', text: 'Data ini digunakan semata-mata untuk verifikasi, mencegah penyalahgunaan, pencegahan spam, menjaga keamanan server, menegakkan aturan server, menyelidiki pelanggaran, meningkatkan layanan kami, dan mematuhi kewajiban hukum. Kami tidak menggunakan data Anda untuk tujuan pemasaran atau menjualnya kepada pihak ketiga.' },
      { title: '4. Pemrosesan dan Penyimpanan Data', text: 'Data Anda diproses dengan aman menggunakan enkripsi dan tindakan keamanan standar industri. Log verifikasi disimpan dengan aman di server kami selama 30 hari, setelah itu dianonimkan atau dihapus. Data yang dianonimkan dapat disimpan untuk tujuan statistik tetapi tidak dapat dikaitkan kembali dengan identitas Anda.' },
      { title: '5. Berbagi Data dan Pihak Ketiga', text: 'Kami menggunakan Cloudflare Turnstile untuk verifikasi CAPTCHA, yang dapat mengumpulkan informasi perangkat, data browser, dan pola interaksi. Cloudflare memproses data ini sesuai dengan Kebijakan Privasi mereka. Kami dapat membagikan data dengan Discord Inc. sesuai yang dipersyaratkan oleh Syarat Layanan mereka. Kami tidak membagikan data Anda dengan pihak ketiga lain kecuali sebagaimana diwajibkan oleh hukum atau untuk melindungi hak dan keselamatan kami.' },
      { title: '6. Keamanan Data', text: 'Kami menerapkan langkah-langkah teknis dan organisasi yang sesuai untuk melindungi data Anda dari akses tidak sah, perubahan, pengungkapan, atau penghancuran. Ini termasuk enkripsi, server yang aman, kontrol akses, dan audit keamanan rutin. Namun, tidak ada metode transmisi melalui internet yang 100% aman, dan kami tidak dapat menjamin keamanan absolut.' },
      { title: '7. Hak Anda', text: 'Anda berhak untuk mengakses, memperbaiki, menghapus, atau membatasi pemrosesan data pribadi Anda. Anda dapat meminta penghapusan data dengan menghubungi pemilik server atau staf. Anda juga dapat menolak pemrosesan data Anda atau meminta portabilitas data. Untuk menggunakan hak-hak ini, hubungi staf server dengan ID Pengguna Discord Anda dan deskripsi yang jelas tentang permintaan Anda.' },
      { title: '8. Cookies dan Penyimpanan Lokal', text: 'Kami menggunakan penyimpanan lokal (bukan cookies) untuk menyimpan preferensi bahasa dan status verifikasi Anda. Data ini disimpan secara lokal di perangkat Anda dan tidak dikirim ke server kami kecuali sebagai bagian dari proses verifikasi. Anda dapat menghapus data ini kapan saja melalui pengaturan browser Anda.' },
      { title: '9. Privasi Anak', text: 'Layanan kami tidak ditujukan untuk anak-anak di bawah 13 tahun. Kami tidak secara sengaja mengumpulkan informasi pribadi dari anak-anak di bawah 13 tahun. Jika Anda adalah orang tua atau wali dan percaya anak Anda telah memberikan informasi pribadi kepada kami, harap hubungi kami segera agar kami dapat menghapus informasi tersebut.' },
      { title: '10. Transfer Data Internasional', text: 'Data Anda dapat ditransfer ke dan diproses di negara selain negara tempat tinggal Anda. Negara-negara ini mungkin memiliki undang-undang perlindungan data yang berbeda. Dengan menggunakan layanan kami, Anda menyetujui transfer data Anda ke negara-negara ini. Kami memastikan perlindungan yang sesuai untuk melindungi data Anda.' },
      { title: '11. Pemberitahuan Pelanggaran Data', text: 'Dalam hal pelanggaran data yang dapat mempengaruhi informasi pribadi Anda, kami akan memberi tahu pengguna yang terkena dampak dan otoritas yang relevan sesuai yang dipersyaratkan oleh hukum yang berlaku. Kami akan mengambil langkah segera untuk menahan pelanggaran dan mengurangi potensi bahaya.' },
      { title: '12. Perubahan Kebijakan Privasi', text: 'Kami dapat memperbarui Kebijakan Privasi ini dari waktu ke waktu untuk mencerminkan perubahan dalam praktik kami atau persyaratan hukum. Kami akan memberi tahu Anda tentang perubahan signifikan dengan memposting kebijakan yang diperbarui di server atau melalui saluran komunikasi lain. Penggunaan layanan kami yang berkelanjutan setelah perubahan merupakan penerimaan kebijakan yang diperbarui.' },
      { title: '13. Informasi Kontak', text: 'Untuk masalah privasi, permintaan data, atau pertanyaan tentang Kebijakan Privasi ini, hubungi staf server melalui Discord. Sertakan ID Pengguna Discord Anda dan deskripsi yang jelas tentang permintaan Anda. Kami akan menanggapi pertanyaan Anda dalam kerangka waktu yang wajar, biasanya dalam 7-14 hari kerja.' },
      { title: '14. Persetujuan', text: 'Dengan menggunakan sistem verifikasi kami dan mengklik "Saya Mengerti", Anda menyetujui pengumpulan, pemrosesan, dan penyimpanan data Anda seperti yang dijelaskan dalam Kebijakan Privasi ini. Anda mengakui bahwa Anda telah membaca dan memahami kebijakan ini dan menyetujui ketentuannya.' },
    ],
  },
};

export function useLocaleCopy() {
  const [locale, setLocale] = useState<LocaleKey>('id');

  useEffect(() => {
    // Persist language preference
    const saved = localStorage.getItem('verify_lang') as LocaleKey;
    if (saved && (saved === 'en' || saved === 'id')) {
      setLocale(saved);
    } else if (typeof navigator !== 'undefined') {
      // Default to ID if starts with id, else EN
      setLocale(navigator.language.startsWith('id') ? 'id' : 'en');
    }
  }, []);

  const changeLocale = (l: LocaleKey) => {
    setLocale(l);
    localStorage.setItem('verify_lang', l);
  };

  return { t: COPY[locale], locale, setLocale: changeLocale };
}
