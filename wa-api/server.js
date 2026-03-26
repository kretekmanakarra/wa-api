import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import express from 'express';
import pino from 'pino';
import qrcode from 'qrcode-terminal';

const app = express();
app.use(express.json());

let sock;

async function connectToWhatsApp() {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Manakarra Police Academy", "Chrome", "1.0.0"],
        printQRInTerminal: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('\n==================================================');
            console.log('⏳ SCAN QR CODE BARU:');
            qrcode.generate(qr, { small: true });
            console.log('==================================================\n');
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) setTimeout(connectToWhatsApp, 3000);
        } else if (connection === 'open') {
            console.log('\n✅ WhatsApp Bot Manakarra Police Academy READY!');
        }
    });
}

connectToWhatsApp();

// ==========================================
// ENDPOINT DENGAN VALIDASI NOMOR (FIX)
// ==========================================
app.post('/send-otp', async (req, res) => {
    try {
        let { number, message } = req.body;
        
        if (!number || !message) {
            return res.status(400).json({ status: 'error', message: 'Data tidak lengkap' });
        }

        // 1. Bersihkan nomor (hanya angka)
        let cleanNumber = number.replace(/\D/g, '');

        // 2. Pastikan berakhiran @s.whatsapp.net
        let jid = cleanNumber.includes('@s.whatsapp.net') ? cleanNumber : `${cleanNumber}@s.whatsapp.net`;

        // 3. Cek apakah nomor terdaftar di WA (PENTING!)
        const [result] = await sock.onWhatsApp(jid);
        
        if (!result || !result.exists) {
            console.log(`❌ Nomor ${cleanNumber} tidak terdaftar di WhatsApp.`);
            return res.status(404).json({ status: 'error', message: 'Nomor tidak terdaftar di WA' });
        }

        // 4. Kirim menggunakan JID hasil validasi
        await sock.sendMessage(result.jid, { text: message });
        
        console.log(`[${new Date().toLocaleTimeString()}] ✉️ Sukses ke: ${result.jid}`);
        res.status(200).json({ status: 'success', message: 'Terkirim' });

    } catch (error) {
        console.error('❌ Error kirim:', error);
        res.status(500).json({ status: 'error', message: error.toString() });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 API WA Port ${PORT} Running...`);
});