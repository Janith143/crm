import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import fs from 'fs';

console.log('Starting minimal WA client...');

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ]
    }
});

client.on('qr', (qr) => {
    console.log('QR RECEIVED', qr);
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('Client is ready!');
});

client.initialize()
    .then(() => console.log('Client initialized promise resolved'))
    .catch(e => {
        fs.writeFileSync('wa_error_string.txt', e.toString() + "\n" + e.stack);
        console.error('Initialize failed, wrote to wa_error_string.txt');
    });
