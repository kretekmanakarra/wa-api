import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import express from 'express';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import QRCode from 'qrcode'; // Pastikan sudah jalan: npm install qrcode

const app = express();
app.use(express.json());

let sock;
let lastQR = null;

async function connectToWhatsApp() {
    const { version } = await fetchLatestBaileysVersion();
    // Path folder sesi yang akan dihubungkan ke Railway Volume
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
            lastQR = qr;
            console.log('⏳ QR Code diperbarui. Silakan cek di /scan');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) setTimeout(connectToWhatsApp, 3000);
        } else if (connection === 'open') {
            lastQR = null;
            console.log('\n✅ WhatsApp Bot Manakarra Police Academy READY!');
        }
    });
}

connectToWhatsApp();

// ==========================================
// 1. ENDPOINT UNTUK SCAN QR DI BROWSER
// ==========================================
app.get('/scan', async (req, res) => {
    if (!lastQR) {
        if (sock?.user) return res.send('<h1 style="font-family:sans-serif;text-align:center;margin-top:50px;">✅ WhatsApp Bot Sudah Terhubung!</h1>');
        return res.send('<h1 style="font-family:sans-serif;text-align:center;margin-top:50px;">⏳ Menunggu QR Code... Refresh halaman ini sebentar lagi.</h1>');
    }
    
    try {
        const qrImage = await QRCode.toDataURL(lastQR);
        res.send(`
            <div style="text-align:center; padding-top:50px; font-family:sans-serif;">
                <h2 style="color:#1e1b4b;">Scan QR Manakarra Police Academy</h2>
                <img src="${qrImage}" style="border: 15px solid #f1f1f1; border-radius:20px; width:300px;" />
                <p style="color:#64748b;margin-top:20px;">Buka WhatsApp > Perangkat Tertaut > Tautkan Perangkat</p>
                <p style="font-size:12px;color:#cbd5e1;">Halaman ini otomatis refresh setiap 20 detik</p>
                <script>setTimeout(() => location.reload(), 20000);</script>
            </div>
        `);
    } catch (err) {
        res.status(500).send('Gagal generate QR');
    }
});

// ==========================================
// 2. ENDPOINT KIRIM OTP
// ==========================================
app.post('/send-otp', async (req, res) => {
    try {
        let { number, message } = req.body;
        
        if (!number || !message) {
            return res.status(400).json({ status: 'error', message: 'Data tidak lengkap' });
        }

        let cleanNumber = number.replace(/\D/g, '');
        let jid = cleanNumber.includes('@s.whatsapp.net') ? cleanNumber : `${cleanNumber}@s.whatsapp.net`;

        // Validasi nomor WhatsApp
        const [result] = await sock.onWhatsApp(jid);
        
        if (!result || !result.exists) {
            console.log(`❌ Nomor ${cleanNumber} tidak terdaftar di WhatsApp.`);
            return res.status(404).json({ status: 'error', message: 'Nomor tidak terdaftar di WA' });
        }

        await sock.sendMessage(result.jid, { text: message });
        
        console.log(`[${new Date().toLocaleTimeString()}] ✉️ Sukses ke: ${result.jid}`);
        res.status(200).json({ status: 'success', message: 'Terkirim' });

    } catch (error) {
        console.error('❌ Error kirim:', error);
        res.status(500).json({ status: 'error', message: error.toString() });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API WA Running on port ${PORT}`);
});
