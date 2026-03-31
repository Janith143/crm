import 'dotenv/config';
import express from 'express';
import whatsappWeb from 'whatsapp-web.js';
import qrcode from 'qrcode';
import qrcodeTerminal from 'qrcode-terminal';
import cors from 'cors';
import pool from './db.js';
import { MOCK_AUTOMATION_RULES, MOCK_TEACHER_METADATA, MOCK_PIPELINE_STAGES } from './mockData.js';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createServer } from 'http';
import { Server } from 'socket.io';
import multer from 'multer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Client, LocalAuth, MessageMedia } = whatsappWeb;

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const port = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

// Configure Multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

// Helper to get settings
const getAppSettings = async () => {
    try {
        const [rows] = await pool.query('SELECT * FROM app_settings');
        const settings = {};
        rows.forEach(row => {
            settings[row.setting_key] = row.setting_value;
        });
        return settings;
    } catch (e) {
        console.warn("Failed to fetch settings, returning empty object", e.message);
        return {};
    }
};

// --- Auth Middleware ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// --- Auth Endpoints ---

// 1. Login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        if (username === 'admin' && password === 'admin123') {
            const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', ['admin']);
            if (rows.length === 0) {
                const hashedPassword = await bcrypt.hash('admin123', 10);
                await pool.query('INSERT INTO users (id, username, password_hash, role, permissions) VALUES (?, ?, ?, ?, ?)',
                    ['admin-id', 'admin', hashedPassword, 'admin', JSON.stringify(['all'])]);
            }
        }

        const [users] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
        const user = users[0];

        if (!user) {
            return res.status(400).json({ success: false, error: 'User not found' });
        }

        if (await bcrypt.compare(password, user.password_hash)) {
            const accessToken = jwt.sign({ id: user.id, username: user.username, role: user.role, permissions: user.permissions }, JWT_SECRET);
            res.json({ success: true, accessToken, user: { id: user.id, username: user.username, role: user.role, permissions: user.permissions } });
        } else {
            res.status(403).json({ success: false, error: 'Invalid password' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 2. Get Users (Admin only)
app.get('/api/users', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    try {
        const [users] = await pool.query('SELECT id, username, role, permissions, created_at FROM users');
        res.json({ success: true, users });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 3. Create User (Admin only)
app.post('/api/users', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const { username, password, role, permissions } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const id = Date.now().toString();
        await pool.query('INSERT INTO users (id, username, password_hash, role, permissions) VALUES (?, ?, ?, ?, ?)',
            [id, username, hashedPassword, role || 'agent', JSON.stringify(permissions || [])]);
        res.json({ success: true, user: { id, username, role, permissions } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 4. Update User (Admin only)
app.put('/api/users/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const { id } = req.params;
    const { password, permissions } = req.body;
    try {
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hashedPassword, id]);
        }
        if (permissions) {
            await pool.query('UPDATE users SET permissions = ? WHERE id = ?', [JSON.stringify(permissions), id]);
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 5. Delete User (Admin only)
app.delete('/api/users/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM users WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// WhatsApp Client Setup
const client = new Client({
    restartOnAuthFail: true,
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-extensions',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-software-rasterizer',
            '--mute-audio',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-site-isolation-trials',
            '--disable-sync'
        ]
    }
});

let qrCodeData = null;
let isClientReady = false;
let clientInfo = null;
let isAuthenticated = false;

// Events
client.on('qr', (qr) => {
    console.log('QR RECEIVED');
    qrcodeTerminal.generate(qr, { small: true });
    qrcode.toDataURL(qr, (err, url) => {
        qrCodeData = url;
        io.emit('qr', { qr: url });
    });
});

let readyTimeout = null;

client.on('ready', () => {
    if (readyTimeout) clearTimeout(readyTimeout);
    console.log('Client is ready!');
    isClientReady = true;
    isAuthenticated = true;
    io.emit('status', { connected: true, authenticated: true });
    syncChats();
    processPendingMessages();
    clientInfo = {
        number: client.info.wid.user,
        name: client.info.pushname
    };
});

client.on('authenticated', () => {
    console.log('AUTHENTICATED');
    isAuthenticated = true;
    qrCodeData = null;
    io.emit('authenticated', { authenticated: true });

    if (readyTimeout) clearTimeout(readyTimeout);
    readyTimeout = setTimeout(() => {
        if (!isClientReady) {
            console.warn('⚠️ Force-triggering READY state due to timeout.');
            isClientReady = true;
            io.emit('status', { connected: true, authenticated: true });
            syncChats();
            processPendingMessages();
            if (client.info) {
                clientInfo = {
                    number: client.info.wid.user,
                    name: client.info.pushname
                };
            }
        }
    }, 30000);
});

client.on('auth_failure', msg => {
    if (readyTimeout) clearTimeout(readyTimeout);
    console.error('AUTHENTICATION FAILURE', msg);
    isAuthenticated = false;
    isClientReady = false;
    io.emit('auth_failure', { message: msg });
});

client.on('disconnected', (reason) => {
    console.log('Client was logged out', reason);
    isClientReady = false;
    clientInfo = null;
    client.initialize();
});

// Queue Processor
const processPendingMessages = async () => {
    if (!isClientReady) return;
    try {
        const [rows] = await pool.query("SELECT * FROM messages WHERE status = 'pending' ORDER BY timestamp ASC");
        for (const msg of rows) {
            try {
                await client.sendMessage(msg.chat_id, msg.body);
                await pool.query("UPDATE messages SET status = 'sent', ack = 1 WHERE id = ?", [msg.id]);
                io.emit('message_update', { id: msg.id, status: 'sent', ack: 1 });
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (err) {
                console.error(`Failed to send pending msg ${msg.id}`, err);
            }
        }
    } catch (error) {
        console.error("Queue processing error:", error);
    }
};

client.on('message_ack', async (msg, ack) => {
    const status = ack === 3 ? 'read' : ack === 2 ? 'received' : 'sent';
    try {
        await pool.query('UPDATE messages SET ack = ?, status = ? WHERE id = ?', [ack, status, msg.id.id]);
        io.emit('message_update', { id: msg.id.id, status, ack });
    } catch (e) {
        console.error("Failed to update ack", e);
    }
});

// Shared handler for messages
async function handleIncomingOrCreatedMessage(msg, eventSource = 'message_create') {
    let actualBody = msg.body;
    let actualType = msg.type;
    const chatId = msg.id.remote;

    let quotedMsgId = null, quotedMsgBody = null, quotedMsgSender = null;
    try {
        if (msg.hasQuotedMsg) {
            const quotedMsg = await msg.getQuotedMessage();
            if (quotedMsg) {
                quotedMsgId = quotedMsg.id?.id || null;
                quotedMsgBody = quotedMsg.body || null;
                quotedMsgSender = quotedMsg.fromMe ? 'agent' : (quotedMsg.author || quotedMsg.from || 'teacher');
            }
        }
    } catch (e) { }

    try {
        await pool.query(
            `INSERT INTO messages (id, chat_id, sender_id, from_me, body, timestamp, status, type, has_media, ack, quoted_msg_id, quoted_msg_body, quoted_msg_sender) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE body = VALUES(body), status = VALUES(status), ack = VALUES(ack), type = VALUES(type), has_media = VALUES(has_media)`,
            [msg.id.id, chatId, msg.author || msg.from, msg.fromMe, actualBody, msg.timestamp, msg.ack === 3 ? 'read' : msg.ack === 2 ? 'received' : 'sent', actualType, msg.hasMedia, msg.ack, quotedMsgId, quotedMsgBody, quotedMsgSender]
        );

        let chatName = '';
        try {
            const contact = await msg.getContact();
            chatName = contact.pushname || contact.name || contact.number || '';
        } catch (e) {
            chatName = chatId.replace('@c.us', '').replace('@g.us', '');
        }

        await pool.query(
            `INSERT INTO chats (id, name, unread_count, timestamp, last_message, last_message_type, last_message_status, last_message_from_me)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE timestamp = VALUES(timestamp), last_message = VALUES(last_message), last_message_type = VALUES(last_message_type), last_message_status = VALUES(last_message_status), last_message_from_me = VALUES(last_message_from_me), unread_count = IF(VALUES(last_message_from_me) = 0, unread_count + 1, 0)`,
            [chatId, chatName, msg.fromMe ? 0 : 1, msg.timestamp, actualBody || (msg.hasMedia ? '📷 Media' : ''), actualType, msg.ack || 0, msg.fromMe]
        );

        io.emit('message_new', {
            id: msg.id.id, chatId, senderId: msg.fromMe ? 'agent' : 'teacher', text: actualBody,
            timestamp: new Date(msg.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isIncoming: !msg.fromMe, status: msg.ack === 3 ? 'read' : msg.ack === 2 ? 'received' : 'sent',
            type: actualType, hasMedia: msg.hasMedia, mediaType: actualType,
            quotedMessage: quotedMsgId ? { id: quotedMsgId, body: quotedMsgBody, senderId: quotedMsgSender } : undefined
        });

    } catch (dbErr) {
        console.error(`❌ Failed to save message ${msg.id.id} to DB:`, dbErr.message);
    }

    if (msg.fromMe) return;
    const body = (actualBody || '').toLowerCase();
    if (!body.trim()) return;

    if (body.includes('live chat') || body.includes('livechat')) {
        await pool.query('DELETE FROM automation_sessions WHERE user_id = ?', [msg.from]);
        await msg.reply("Connecting you to a human agent. Automation stopped.");
        return;
    }

    // --- Automation Sessions ---
    try {
        const [sessionRows] = await pool.query('SELECT * FROM automation_sessions WHERE user_id = ?', [msg.from]);
        if (sessionRows.length > 0) {
            const session = sessionRows[0];
            const [rules] = await pool.query('SELECT * FROM automation_rules WHERE id = ?', [session.workflow_id]);
            if (rules.length > 0) {
                const steps = JSON.parse(rules[0].steps || '[]');
                const currentStep = steps.find(s => s.id === session.current_step_index.toString());
                if (currentStep) {
                    const matchedOption = currentStep.options?.find(opt => body.includes(opt.keyword.toLowerCase()));
                    if (matchedOption) {
                        const nextStep = steps.find(s => s.id === matchedOption.nextStepId);
                        if (nextStep) {
                            await msg.reply(nextStep.content);
                            await pool.query('UPDATE automation_sessions SET current_step_index = ?, last_interaction = NOW() WHERE user_id = ?', [nextStep.id, msg.from]);
                            return;
                        }
                    } else if (!currentStep.options || currentStep.options.length === 0) {
                        const currentIdx = steps.findIndex(s => s.id === currentStep.id);
                        if (currentIdx < steps.length - 1) {
                            const nextStep = steps[currentIdx + 1];
                            await msg.reply(nextStep.content);
                            await pool.query('UPDATE automation_sessions SET current_step_index = ?, last_interaction = NOW() WHERE user_id = ?', [nextStep.id, msg.from]);
                            return;
                        }
                    }
                }
            }
            await pool.query('DELETE FROM automation_sessions WHERE user_id = ?', [msg.from]);
        }

        const [activeRules] = await pool.query('SELECT * FROM automation_rules WHERE active = 1');
        for (const rule of activeRules) {
            const match = rule.match_type === 'exact' ? body === rule.trigger_text.toLowerCase() : body.includes(rule.trigger_text.toLowerCase());
            if (match) {
                const steps = JSON.parse(rule.steps || '[]');
                let content = rule.response_text;
                let stepId = '0';
                if (steps.length > 0) { content = steps[0].content; stepId = steps[0].id; }
                await msg.reply(content);
                await pool.query('UPDATE automation_rules SET hit_count = hit_count + 1 WHERE id = ?', [rule.id]);
                if (steps.length > 1 || (steps[0] && steps[0].options?.length > 0)) {
                    await pool.query('INSERT INTO automation_sessions (user_id, workflow_id, current_step_index) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE workflow_id = ?, current_step_index = ?',
                        [msg.from, rule.id, stepId, rule.id, stepId]);
                }
                break;
            }
        }
    } catch (e) {
        console.error('Automation error:', e);
    }
}

client.on('message', msg => handleIncomingOrCreatedMessage(msg, 'message'));
client.on('message_create', msg => { if (msg.fromMe) handleIncomingOrCreatedMessage(msg, 'message_create'); });

// --- Automation API ---
app.get('/api/automations', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM automation_rules');
        res.json({
            success: true, rules: rows.map(r => ({
                id: r.id, name: r.name, trigger: r.trigger_text, response: r.response_text,
                active: !!r.active, matchType: r.match_type, hitCount: r.hit_count,
                steps: JSON.parse(r.steps || '[]')
            }))
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/automations', async (req, res) => {
    const { name, trigger, response, matchType, steps } = req.body;
    const id = Date.now().toString();
    try {
        await pool.query('INSERT INTO automation_rules (id, name, trigger_text, response_text, match_type, steps) VALUES (?, ?, ?, ?, ?, ?)',
            [id, name, trigger, response, matchType || 'contains', JSON.stringify(steps || [])]);
        res.json({ success: true, id });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/automations/:id', async (req, res) => {
    const { id } = req.params;
    const { name, trigger, response, active, matchType, steps } = req.body;
    try {
        const updates = []; const values = [];
        if (name !== undefined) { updates.push('name = ?'); values.push(name); }
        if (trigger !== undefined) { updates.push('trigger_text = ?'); values.push(trigger); }
        if (response !== undefined) { updates.push('response_text = ?'); values.push(response); }
        if (active !== undefined) { updates.push('active = ?'); values.push(active ? 1 : 0); }
        if (matchType !== undefined) { updates.push('match_type = ?'); values.push(matchType); }
        if (steps !== undefined) { updates.push('steps = ?'); values.push(JSON.stringify(steps)); }
        if (updates.length > 0) { values.push(id); await pool.query(`UPDATE automation_rules SET ${updates.join(', ')} WHERE id = ?`, values); }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/automations/:id', async (req, res) => {
    try { await pool.query('DELETE FROM automation_rules WHERE id = ?', [req.params.id]); res.json({ success: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Templates ---
app.get('/api/templates', async (req, res) => {
    try {
        await pool.query('CREATE TABLE IF NOT EXISTS message_templates (id VARCHAR(255) PRIMARY KEY, name VARCHAR(255) NOT NULL, content TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
        const [rows] = await pool.query('SELECT * FROM message_templates ORDER BY created_at DESC');
        res.json({ success: true, templates: rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/templates', async (req, res) => {
    const { name, content } = req.body; const id = Date.now().toString();
    try { await pool.query('INSERT INTO message_templates (id, name, content) VALUES (?, ?, ?)', [id, name, content]); res.json({ success: true, template: { id, name, content } }); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/templates/:id', async (req, res) => {
    try { await pool.query('DELETE FROM message_templates WHERE id = ?', [req.params.id]); res.json({ success: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Metadata & Pipeline ---
app.get('/api/metadata', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM teacher_metadata');
        const metadata = {};
        rows.forEach(r => { metadata[r.id] = { name: r.name, source: r.source, status: r.status, subStatus: r.sub_status, tags: JSON.parse(r.tags || '[]'), notes: r.notes, location: r.location, email: r.email }; });
        res.json({ success: true, metadata });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/metadata/:id', async (req, res) => {
    const { id } = req.params;
    const { name, source, status, subStatus, tags, notes, location, email } = req.body;
    try {
        await pool.query(`INSERT INTO teacher_metadata (id, name, source, status, sub_status, tags, notes, location, email) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), source = VALUES(source), status = VALUES(status), sub_status = VALUES(sub_status), tags = VALUES(tags), notes = VALUES(notes), location = VALUES(location), email = VALUES(email)`,
            [id, name, source, status, subStatus || null, JSON.stringify(tags || []), notes, location, email]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/pipeline-stages', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM pipeline_stages ORDER BY position ASC');
        res.json({ success: true, stages: rows.map(r => ({ id: r.id, name: r.name, position: r.position, color: r.color, subStages: JSON.parse(r.sub_stages || '[]') })) });
    } catch (e) { res.status(500).json({ success: true, stages: MOCK_PIPELINE_STAGES }); }
});

app.post('/api/pipeline-stages', async (req, res) => {
    const { name, color, subStages } = req.body;
    try {
        const [rows] = await pool.query('SELECT MAX(position) as maxPos FROM pipeline_stages');
        const pos = (rows[0].maxPos || 0) + 1;
        await pool.query('INSERT INTO pipeline_stages (id, name, position, color, sub_stages) VALUES (?, ?, ?, ?, ?)', [name, name, pos, color, JSON.stringify(subStages || [])]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/pipeline-stages/:id', async (req, res) => {
    const { id } = req.params; const { name, color, subStages } = req.body;
    try {
        const updates = []; const values = [];
        if (name !== undefined) { updates.push('name = ?'); values.push(name); }
        if (color !== undefined) { updates.push('color = ?'); values.push(color); }
        if (subStages !== undefined) { updates.push('sub_stages = ?'); values.push(JSON.stringify(subStages)); }
        if (updates.length > 0) { values.push(id); await pool.query(`UPDATE pipeline_stages SET ${updates.join(', ')} WHERE id = ?`, values); }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/pipeline-stages/:id', async (req, res) => {
    try { await pool.query('DELETE FROM pipeline_stages WHERE id = ?', [req.params.id]); res.json({ success: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/pipeline-stages/reorder', async (req, res) => {
    const { stageIds } = req.body;
    try {
        for (let i = 0; i < stageIds.length; i++) { await pool.query('UPDATE pipeline_stages SET position = ? WHERE id = ?', [i + 1, stageIds[i]]); }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Settings & Status ---
app.get('/api/settings', async (req, res) => {
    const settings = await getAppSettings(); res.json({ success: true, settings });
});

app.post('/api/settings', async (req, res) => {
    const { settings } = req.body;
    try {
        const queries = Object.keys(settings).map(k => pool.query('INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)', [k, settings[k]]));
        await Promise.all(queries); res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/status', async (req, res) => {
    const settings = await getAppSettings();
    const provider = settings['WA_PROVIDER'] || 'webjs';
    if (provider === 'official' || provider === 'cloud_api') {
        const connected = !!(settings['WA_PHONE_ID'] && settings['WA_CLOUD_TOKEN']);
        return res.json({ connected, authenticated: connected, info: { pushname: 'Cloud API' }, provider });
    }
    res.json({ connected: isClientReady, qrCode: qrCodeData, info: clientInfo, authenticated: isAuthenticated, provider });
});

app.post('/api/sync', async (req, res) => { syncChats(); res.json({ success: true }); });

app.delete('/api/clear-cache', async (req, res) => {
    try { await pool.query('DELETE FROM messages'); await pool.query('DELETE FROM chats'); syncChats(); res.json({ success: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Chats & Messages ---
const mapRowsToChats = (rows) => rows.map(r => ({
    id: r.id, name: r.metadata_name || r.name, phone: r.id, unreadCount: r.unread_count, timestamp: r.timestamp,
    lastMessage: { body: r.last_message, type: r.last_message_type, status: r.last_message_status, fromMe: !!r.last_message_from_me },
    source: r.source || 'whatsapp', status: r.status || 'New Lead', tags: JSON.parse(r.tags || '[]'), notes: r.notes || '', location: r.location || '', email: r.email || ''
}));

app.get('/api/chats', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT c.*, tm.source, tm.status, tm.sub_status, tm.tags, tm.notes, tm.location, tm.email, tm.name as metadata_name FROM chats c LEFT JOIN teacher_metadata tm ON c.id = tm.id ORDER BY c.timestamp DESC');
        res.json({ success: true, chats: mapRowsToChats(rows) });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/messages/:phone', async (req, res) => {
    const { phone } = req.params;
    const chatId = phone.includes('@') ? phone : `${phone.replace(/[^0-9]/g, '')}@c.us`;
    try {
        if (isClientReady) {
            try {
                const chat = await client.getChatById(chatId);
                const msgs = await chat.fetchMessages({ limit: 100 });
                for (const m of msgs) {
                    await pool.query('INSERT INTO messages (id, chat_id, sender_id, from_me, body, timestamp, status, type, has_media, ack) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE status = VALUES(status), ack = VALUES(ack)',
                        [m.id.id, chatId, m.author || m.from, m.fromMe, m.body, m.timestamp, m.ack === 3 ? 'read' : m.ack === 2 ? 'received' : 'sent', m.type, m.hasMedia, m.ack]);
                }
            } catch (e) { }
        }
        const [rows] = await pool.query('SELECT * FROM messages WHERE chat_id = ? ORDER BY timestamp ASC', [chatId]);
        res.json({
            success: true, messages: rows.map(m => ({
                id: m.id, senderId: m.from_me ? 'agent' : 'teacher', text: m.body,
                timestamp: new Date(m.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                isIncoming: !m.from_me, status: m.status, type: m.type, hasMedia: !!m.has_media,
                quotedMessage: m.quoted_msg_id ? { id: m.quoted_msg_id, body: m.quoted_msg_body, senderId: m.quoted_msg_sender } : undefined
            }))
        });
    } catch (e) { res.status(500).json({ messages: [] }); }
});

app.post('/api/send', upload.single('file'), async (req, res) => {
    const { phone, message } = req.body;
    const sanitized = phone.replace(/[^0-9]/g, '');
    const chatId = phone.includes('@') ? phone : `${sanitized}@c.us`;
    const settings = await getAppSettings();
    const provider = settings['WA_PROVIDER'];

    if (provider === 'official' || provider === 'cloud_api') {
        const token = settings['WA_CLOUD_TOKEN'], phoneId = settings['WA_PHONE_ID'];
        if (!token || !phoneId) return res.status(400).json({ error: 'Config missing' });
        try {
            const r = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
                method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ messaging_product: "whatsapp", to: sanitized, type: "text", text: { body: message } })
            });
            const data = await r.json();
            await pool.query('INSERT INTO messages (id, chat_id, sender_id, from_me, body, timestamp, status, type, has_media, ack) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [data.messages?.[0]?.id || Date.now().toString(), chatId, 'agent', 1, message, Math.floor(Date.now() / 1000), 'sent', 'text', 0, 1]);
            return res.json({ success: true });
        } catch (e) { return res.status(500).json({ error: e.message }); }
    }

    if (!isClientReady) {
        await pool.query('INSERT INTO messages (id, chat_id, sender_id, from_me, body, timestamp, status, type, has_media, ack) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [Date.now().toString(), chatId, 'agent', 1, message || '', Math.floor(Date.now() / 1000), 'pending', req.file ? 'media' : 'text', Buffer.isBuffer(req.file?.buffer), 0]);
        return res.json({ success: true, status: 'queued' });
    }

    try {
        let resp;
        if (req.file) {
            const media = new MessageMedia(req.file.mimetype, req.file.buffer.toString('base64'), req.file.originalname);
            resp = await client.sendMessage(chatId, media, { caption: message });
        } else {
            resp = await client.sendMessage(chatId, message);
        }
        res.json({ success: true, resp });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/messages/:chatId/:messageId', async (req, res) => {
    try {
        const chat = await client.getChatById(req.params.chatId);
        const msgs = await chat.fetchMessages({ limit: 100 });
        const m = msgs.find(x => x.id.id === req.params.messageId);
        if (m) { await m.delete(true); res.json({ success: true }); }
        else res.status(404).json({ error: 'Not found' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/messages/:messageId/forward', async (req, res) => {
    const { fromChatId, toChatId } = req.body;
    try {
        const chat = await client.getChatById(fromChatId);
        const msgs = await chat.fetchMessages({ limit: 100 });
        const m = msgs.find(x => x.id.id === req.params.messageId);
        if (m) { await m.forward(toChatId); res.json({ success: true }); }
        else res.status(404).json({ error: 'Not found' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/messages/:phone/:msgId/media', async (req, res) => {
    const { phone, msgId } = req.params;
    const chatId = phone.includes('@') ? phone : `${phone.replace(/[^0-9]/g, '')}@c.us`;
    try {
        const chat = await client.getChatById(chatId);
        const msgs = await chat.fetchMessages({ limit: 100 });
        const m = msgs.find(x => x.id.id === msgId);
        if (m && m.hasMedia) {
            const media = await m.downloadMedia();
            res.setHeader('Content-Type', media.mimetype);
            res.send(Buffer.from(media.data, 'base64'));
        } else res.status(404).send('Not found');
    } catch (e) { res.status(500).send(e.message); }
});

app.post('/api/chats/:chatId/read', async (req, res) => {
    try { const chat = await client.getChatById(req.params.chatId); await chat.sendSeen(); res.json({ success: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/profile-pic/:chatId', async (req, res) => {
    try {
        const url = await client.getProfilePicUrl(req.params.chatId);
        res.json({ success: !!url, url });
    } catch (e) { res.json({ success: false }); }
});

// --- Activities ---
app.get('/api/activities/:teacherId', async (req, res) => {
    try { const [rows] = await pool.query('SELECT * FROM activities WHERE teacher_id = ? ORDER BY created_at DESC', [req.params.teacherId]); res.json({ success: true, activities: rows }); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/activities', async (req, res) => {
    const { id, teacherId, type, title, description, timestamp, user } = req.body;
    try { await pool.query('INSERT INTO activities (id, teacher_id, type, title, description, timestamp, user) VALUES (?, ?, ?, ?, ?, ?, ?)', [id || Date.now().toString(), teacherId, type, title, description, timestamp, user]); res.json({ success: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Logout ---
app.post('/api/logout', async (req, res) => {
    try {
        if (client) await client.destroy();
        isClientReady = false; isAuthenticated = false; clientInfo = null; qrCodeData = null;
        const fs = await import('fs');
        ['.wwebjs_auth', '.wwebjs_cache'].forEach(p => { if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }); });
        await pool.query('DELETE FROM messages'); await pool.query('DELETE FROM chats');
        client.initialize(); res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Webhooks ---
app.get('/api/webhook', async (req, res) => {
    const settings = await getAppSettings();
    if (req.query['hub.verify_token'] === settings['WA_VERIFY_TOKEN']) res.send(req.query['hub.challenge']);
    else res.sendStatus(403);
});

app.post('/api/webhook', async (req, res) => {
    const body = req.body;
    if (body.object === 'whatsapp_business_account') {
        res.sendStatus(200); // 1. Always acknowledge receipt to Meta immediately!

        try {
            if (body.entry && body.entry[0] && body.entry[0].changes && body.entry[0].changes[0]) {
                const value = body.entry[0].changes[0].value;

                // --- 2. Handle Status Updates (Delivery & Read Receipts) ---
                if (value.statuses && value.statuses.length > 0) {
                    for (const statusObj of value.statuses) {
                        const msgId = statusObj.id;
                        const status = statusObj.status; // sent, delivered, read, failed
                        let ack = 0;
                        if (status === 'sent') ack = 1;
                        if (status === 'delivered') ack = 2;
                        if (status === 'read') ack = 3;

                        await pool.query('UPDATE messages SET ack = ?, status = ? WHERE id = ?', [ack, status, msgId]);
                        io.emit('message_update', { id: msgId, status, ack });
                    }
                }

                // --- 3. Handle Incoming Messages ---
                if (value.messages && value.messages.length > 0) {
                    for (const msg of value.messages) {
                        const phone = msg.from;
                        const chatId = `${phone}@c.us`;
                        const id = msg.id;
                        const timestamp = parseInt(msg.timestamp);
                        const type = msg.type;
                        let bodyText = '';
                        let hasMedia = false;

                        if (type === 'text') {
                            bodyText = msg.text?.body || '';
                        } else if (['image', 'video', 'document', 'audio'].includes(type)) {
                            hasMedia = true;
                            bodyText = msg[type]?.caption || `[${type} received]`;
                        } else {
                            bodyText = `[${type} received]`;
                        }

                        let chatName = phone;
                        if (value.contacts && value.contacts.length > 0) {
                            const contactName = value.contacts.find(c => c.wa_id === phone)?.profile?.name;
                            if (contactName) chatName = contactName;
                        }

                        // Save the message locally
                        await pool.query(
                            `INSERT INTO messages (id, chat_id, sender_id, from_me, body, timestamp, status, type, has_media, ack) 
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                             ON DUPLICATE KEY UPDATE body = VALUES(body), status = VALUES(status), type = VALUES(type), has_media = VALUES(has_media)`,
                            [id, chatId, phone, 0, bodyText, timestamp, 'received', type, hasMedia ? 1 : 0, 0]
                        );

                        // Update or Create Chat entry for the inbox
                        await pool.query(
                            `INSERT INTO chats (id, name, unread_count, timestamp, last_message, last_message_type, last_message_status, last_message_from_me)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                             ON DUPLICATE KEY UPDATE name = IF(name=id, VALUES(name), name), timestamp = VALUES(timestamp), last_message = VALUES(last_message), last_message_type = VALUES(last_message_type), last_message_status = VALUES(last_message_status), last_message_from_me = VALUES(last_message_from_me), unread_count = unread_count + 1`,
                            [chatId, chatName, 1, timestamp, bodyText || (hasMedia ? '📷 Media' : ''), type, 0, 0]
                        );

                        // Signal frontend to update Inbox real-time!
                        io.emit('message_new', {
                            id, chatId, senderId: 'teacher', text: bodyText,
                            timestamp: new Date(timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                            isIncoming: true, status: 'received',
                            type, hasMedia, mediaType: type
                        });
                    }
                }
            }
        } catch (e) {
            console.error("Webhook processing error:", e);
        }
    } else {
        res.sendStatus(404);
    }
});

// --- Sync & Init ---
const syncChats = async () => {
    if (!isClientReady) return;
    try {
        const chats = await client.getChats();
        for (const c of chats) {
            const last = c.lastMessage;
            await pool.query(`INSERT INTO chats (id, name, unread_count, timestamp, last_message, last_message_type, last_message_status, last_message_from_me) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), unread_count = VALUES(unread_count), timestamp = VALUES(timestamp), last_message = VALUES(last_message), last_message_type = VALUES(last_message_type), last_message_status = VALUES(last_message_status), last_message_from_me = VALUES(last_message_from_me)`,
                [c.id._serialized, c.name || '', c.unreadCount, c.timestamp, last?.body || '', last?.type || 'chat', last?.ack || 0, !!last?.fromMe]);
        }
    } catch (e) { console.error("Sync error", e); }
};

const initTables = async () => {
    try {
        await pool.query('CREATE TABLE IF NOT EXISTS chats (id VARCHAR(255) PRIMARY KEY, name VARCHAR(255), unread_count INT DEFAULT 0, timestamp INT, last_message TEXT, last_message_type VARCHAR(50), last_message_status INT, last_message_from_me BOOLEAN, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)');
        await pool.query('CREATE TABLE IF NOT EXISTS teacher_metadata (id VARCHAR(255) PRIMARY KEY, name VARCHAR(255), source VARCHAR(50), status VARCHAR(50), sub_status VARCHAR(50), tags JSON, notes TEXT, location VARCHAR(255), email VARCHAR(255), updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)');
        await pool.query('CREATE TABLE IF NOT EXISTS activities (id VARCHAR(255) PRIMARY KEY, teacher_id VARCHAR(255) NOT NULL, type VARCHAR(50) NOT NULL, title VARCHAR(255) NOT NULL, description TEXT, timestamp VARCHAR(255), user VARCHAR(255) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
    } catch (e) { console.error("Init error", e); }
};

initTables();
client.initialize();
httpServer.listen(port, () => console.log(`Server running on port ${port}`));

io.on('connection', socket => {
    socket.emit('status', { connected: isClientReady, authenticated: isAuthenticated, info: clientInfo });
    if (qrCodeData) socket.emit('qr', { qr: qrCodeData });
});

app.get(/^(?!\/api).*$/, (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));
