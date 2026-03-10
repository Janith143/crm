import express from 'express';
import whatsappWeb from 'whatsapp-web.js';
import qrcode from 'qrcode';
import cors from 'cors';
import pool from './db.js';
import { MOCK_AUTOMATION_RULES, MOCK_TEACHER_METADATA, MOCK_PIPELINE_STAGES } from './mockData.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Handle CommonJS export from whatsapp-web.js
const { Client, LocalAuth } = whatsappWeb;

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*", // Allow all origins for now (dev)
        methods: ["GET", "POST"]
    }
});

const port = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

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
        // Check if it's the initial admin setup
        if (username === 'admin' && password === 'admin123') {
            // Check if admin exists in DB, if not create it
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
// LocalAuth stores the session on disk so you don't have to scan QR every time you restart
const client = new Client({
    restartOnAuthFail: true,
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true, // Change to false to debug visually
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
            '--disable-features=IsolateOrigins,site-per-process',
            '--disable-sync',
            '--hide-scrollbars',
            '--disable-default-apps',
            '--disable-ipc-flooding-protection',
            '--disable-background-networking',
            '--disable-domain-reliability',
            '--disable-translate'
            // Removed --single-process to avoid deadlocks
        ]
    }
});

let qrCodeData = null;
let isClientReady = false;
let clientInfo = null;
let isAuthenticated = false;

// Events
client.on('qr', (qr) => {
    console.log('QR RECEIVED', qr);
    qrCodeData = qr; // Store raw content for potential debug, but we usually store dataURL
    qrcode.toDataURL(qr, (err, url) => {
        qrCodeData = url;
        io.emit('qr', { qr: url });
    });
});

let readyTimeout = null;

client.on('ready', () => {
    if (readyTimeout) clearTimeout(readyTimeout);
    console.log('Client is ready! (Native Event)');
    isClientReady = true;
    isAuthenticated = true; // Ensure this is true
    io.emit('status', { connected: true, authenticated: true });
    // Initial sync
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
    qrCodeData = null; // Clear QR
    io.emit('authenticated', { authenticated: true });

    // Force ready after 30s if it gets stuck (increased from 15s)
    if (readyTimeout) clearTimeout(readyTimeout);
    readyTimeout = setTimeout(() => {
        if (!isClientReady) {
            console.warn('⚠️ Force-triggering READY state due to timeout.');
            isClientReady = true;
            io.emit('status', { connected: true, authenticated: true });

            // Trigger Syncs even on forced ready
            console.log('🔄 Triggering forced sync...');
            syncChats();
            processPendingMessages();

            // Retry sync after 10 more seconds (allow Store to fully populate)
            setTimeout(() => {
                console.log('🔄 Retry sync after delay...');
                syncChats();
            }, 10000);

            // Try to set client info if available
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

client.on('loading_screen', (percent, message) => {
    console.log('LOADING SCREEN', percent, message);
    io.emit('loading_screen', { percent, message });
});

client.on('disconnected', (reason) => {
    console.log('Client was logged out', reason);
    isClientReady = false;
    clientInfo = null;
    // Re-initialize to allow new login
    client.initialize();
});

// Queue Processor
const processPendingMessages = async () => {
    if (!isClientReady) return;
    console.log("🔄 Processing pending messages queue...");

    try {
        const [rows] = await pool.query("SELECT * FROM messages WHERE status = 'pending' ORDER BY timestamp ASC");
        if (rows.length === 0) {
            console.log("✅ No pending messages to send");
            return;
        }

        console.log(`found ${rows.length} pending messages`);

        for (const msg of rows) {
            console.log(`Processing pending msg ${msg.id} to ${msg.chat_id}`);
            try {
                const chatId = msg.chat_id;
                const message = msg.body;

                // Construct options (quoted msg, etc) - simplified for restoration
                // In a full implementation we'd store these options in a separate column or JSON
                const options = {};

                const response = await client.sendMessage(chatId, message, options);

                // Update status to sent
                await pool.query("UPDATE messages SET status = 'sent', ack = 1 WHERE id = ?", [msg.id]);

                // Emit update
                io.emit('message_update', {
                    id: msg.id,
                    status: 'sent',
                    ack: 1
                });

                // Small delay to ensure sequence and respect rate limits
                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (err) {
                console.error(`Failed to send pending msg ${msg.id}`, err);
                // Optionally mark as failed or leave pending for next retry?
                // For now, let's leave it pending but maybe add a retry count later
            }
        }
    } catch (error) {
        console.error("Queue processing error:", error);
    }
};

// Events
client.on('message_ack', async (msg, ack) => {
    /*
        ack values:
        1: sent
        2: received
        3: read
    */
    const status = ack === 3 ? 'read' : ack === 2 ? 'received' : 'sent';
    try {
        await pool.query('UPDATE messages SET ack = ?, status = ? WHERE id = ?', [ack, status, msg.id.id]);
        // console.log(`Updated ack for ${msg.id.id} to ${status}`);

        // --- Emit Real-time Event ---
        io.emit('message_update', {
            id: msg.id.id,
            status: status,
            ack: ack
        });
    } catch (e) {
        console.error("Failed to update ack", e);
    }
});


// --- Automation Logic ---
// --- Automation Logic ---
// Rules will be fetched from DB


client.on('message_create', async (msg) => {
    // Ignore messages from self (handled separately or if we want to store them too)
    // Actually message_create fires for own messages too.

    const body = msg.body.toLowerCase();
    const userId = msg.from; // Phone number (e.g. 9477...@c.us)
    const chatId = msg.id.remote;

    try {
        await pool.query(
            'INSERT IGNORE INTO messages (id, chat_id, sender_id, from_me, body, timestamp, status, type, has_media, ack) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                msg.id.id,
                chatId,
                msg.author || msg.from,
                msg.fromMe,
                msg.body,
                msg.timestamp,
                msg.ack === 3 ? 'read' : msg.ack === 2 ? 'received' : 'sent',
                msg.type,
                msg.hasMedia,
                msg.ack
            ]
        );
        // console.log(`💾 Saved message ${msg.id.id} to DB`);

        // --- Upsert Chat Entry (populate chats dynamically) ---
        try {
            // Get chat info if possible, otherwise use basic info
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
                 ON DUPLICATE KEY UPDATE
                 timestamp = VALUES(timestamp),
                 last_message = VALUES(last_message),
                 last_message_type = VALUES(last_message_type),
                 last_message_status = VALUES(last_message_status),
                 last_message_from_me = VALUES(last_message_from_me),
                 unread_count = IF(VALUES(last_message_from_me) = 0, unread_count + 1, 0)`,
                [
                    chatId,
                    chatName,
                    msg.fromMe ? 0 : 1, // Unread if incoming
                    msg.timestamp,
                    msg.body || (msg.hasMedia ? '📷 Media' : ''),
                    msg.type,
                    msg.ack || 0,
                    msg.fromMe
                ]
            );
            // console.log(`💬 Upserted chat ${chatId}`);
        } catch (chatErr) {
            console.warn(`Failed to upsert chat: ${chatErr.message}`);
        }

        // --- Emit Real-time Event ---
        io.emit('message_new', {
            id: msg.id.id,
            chatId: chatId,
            senderId: msg.fromMe ? 'agent' : 'teacher', // simplified
            text: msg.body,
            timestamp: new Date(msg.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isIncoming: !msg.fromMe,
            status: msg.ack === 3 ? 'read' : msg.ack === 2 ? 'received' : 'sent',
            type: msg.type,
            hasMedia: msg.hasMedia,
            mediaType: msg.type
        });

    } catch (dbErr) {
        console.error("Failed to save message to DB", dbErr);
    }

    if (msg.fromMe) return; // Stop automation for own messages

    // 1. Check for "Live Chat" stop condition
    if (body.includes('live chat') || body.includes('livechat')) {
        console.log(`🛑 User ${userId} requested Live Chat. Stopping automation.`);
        try {
            await pool.query('DELETE FROM automation_sessions WHERE user_id = ?', [userId]);
            await msg.reply("Connecting you to a human agent. Automation stopped.");
        } catch (e) {
            console.error("Failed to clear session", e);
        }
        return;
    }

    try {
        // 2. Check if user is in an active session
        let session = null;
        try {
            const [rows] = await pool.query('SELECT * FROM automation_sessions WHERE user_id = ?', [userId]);
            if (rows.length > 0) {
                session = rows[0];
            }
        } catch (e) { /* Ignore DB error */ }

        if (session) {
            console.log(`🔄 Found active session for ${userId}: Workflow ${session.workflow_id}, Step ${session.current_step_index}`);
            // User is in a flow. Fetch the workflow.
            const [rules] = await pool.query('SELECT * FROM automation_rules WHERE id = ?', [session.workflow_id]);
            if (rules.length > 0) {
                const rule = rules[0];
                const steps = typeof rule.steps === 'string' ? JSON.parse(rule.steps) : rule.steps;

                console.log(`📜 Loaded workflow steps: ${steps.length}`);

                // Find current step
                // If current_step_index is stored, use it. But we moved to IDs.
                // Let's assume current_step_index stores the ID now if it's a string, or we need to map it.
                // For simplicity, let's look for the step with ID = current_step_index (casted to string)

                const currentStepId = session.current_step_index.toString();
                const currentStep = steps.find(s => s.id === currentStepId);

                if (!currentStep) {
                    console.warn(`⚠️ Current step ${currentStepId} not found in workflow. Ending session.`);
                    await pool.query('DELETE FROM automation_sessions WHERE user_id = ?', [userId]);
                    return;
                }

                console.log(`📍 Current Step: ${currentStep.id} - ${currentStep.content}`);

                if (currentStep && currentStep.options && currentStep.options.length > 0) {
                    console.log(`🔀 Checking options: ${JSON.stringify(currentStep.options)}`);
                    // Check if user reply matches any option
                    const matchedOption = currentStep.options.find(opt => body.includes(opt.keyword.toLowerCase()));

                    if (matchedOption) {
                        console.log(`✅ Matched option: ${matchedOption.keyword} -> Go to ${matchedOption.nextStepId}`);
                        const nextStep = steps.find(s => s.id === matchedOption.nextStepId);
                        if (nextStep) {
                            console.log(`➡️ Branching flow for ${userId}: Step ${nextStep.id}`);
                            await msg.reply(nextStep.content);

                            // Update session
                            await pool.query('UPDATE automation_sessions SET current_step_index = ?, last_interaction = NOW() WHERE user_id = ?', [nextStep.id, userId]);
                            return;
                        } else {
                            console.warn(`⚠️ Next step ${matchedOption.nextStepId} not found.`);
                        }
                    } else {
                        console.log(`❌ No option matched for "${body}"`);
                    }
                }

                // Fallback: Linear progression if no options or no match (and we want to support linear mixed with branching)
                // OR if it was a linear step, just go to next index?
                // For now, let's assume if it has options, it MUST match an option.
                // If it doesn't have options, maybe it just waits for ANY reply to go to next?

                if (!currentStep.options || currentStep.options.length === 0) {
                    // Linear fallback: Find step with ID = current + 1? 
                    // Or find index of current step and go to index + 1
                    const currentIndex = steps.findIndex(s => s.id === currentStepId);
                    console.log(`➡️ Linear check. Current Index: ${currentIndex}, Total: ${steps.length}`);
                    if (currentIndex !== -1 && currentIndex < steps.length - 1) {
                        const nextStep = steps[currentIndex + 1];
                        console.log(`➡️ Linear flow for ${userId}: Step ${nextStep.id}`);
                        await msg.reply(nextStep.content);
                        await pool.query('UPDATE automation_sessions SET current_step_index = ?, last_interaction = NOW() WHERE user_id = ?', [nextStep.id, userId]);
                        return;
                    }
                }

                // If we are here, either flow ended or invalid option
                if (currentStep.options && currentStep.options.length > 0) {
                    console.log(`ℹ️ User reply did not match any option. Ignoring or sending fallback.`);
                    // await msg.reply("Please select a valid option.");
                    return;
                }

                // End of flow
                console.log(`✅ Flow completed for ${userId}`);
                await pool.query('DELETE FROM automation_sessions WHERE user_id = ?', [userId]);
                return;
            } else {
                console.warn(`⚠️ Workflow ${session.workflow_id} not found. Deleting session.`);
                // Rule deleted? Clear session.
                await pool.query('DELETE FROM automation_sessions WHERE user_id = ?', [userId]);
            }
        } else {
            console.log(`ℹ️ No active session for ${userId}`);
        }

        // 3. Check for new triggers (Start new flow)
        let rules;
        try {
            const [rows] = await pool.query('SELECT * FROM automation_rules WHERE active = 1');
            rules = rows;
        } catch (dbError) {
            console.warn("⚠️ DB Connection Failed (Automation Logic). Using Mock Data.");
            rules = MOCK_AUTOMATION_RULES;
        }

        for (const rule of rules) {
            let match = false;
            if (rule.match_type === 'exact') {
                match = body === rule.trigger_text.toLowerCase();
            } else {
                match = body.includes(rule.trigger_text.toLowerCase());
            }

            if (match) {
                console.log(`Triggering rule: ${rule.name}`);
                try {
                    // Parse steps
                    const steps = typeof rule.steps === 'string' ? JSON.parse(rule.steps) : rule.steps;

                    // If new format (WorkflowStep[]), use content. If old (string[]), use string.
                    // We normalized frontend to send WorkflowStep[].
                    // But DB might have old data.

                    let firstStepContent = rule.response_text;
                    let firstStepId = '0';

                    if (steps && steps.length > 0) {
                        if (typeof steps[0] === 'object') {
                            firstStepContent = steps[0].content;
                            firstStepId = steps[0].id;
                        } else {
                            firstStepContent = steps[0];
                        }
                    }

                    await msg.reply(firstStepContent);

                    // Update hit count
                    pool.query('UPDATE automation_rules SET hit_count = hit_count + 1 WHERE id = ?', [rule.id]).catch(() => { });

                    // Start Session if there are more steps or options
                    if (steps && steps.length > 0) {
                        // Check if single step has options OR if there are multiple steps
                        const hasOptions = typeof steps[0] === 'object' && steps[0].options && steps[0].options.length > 0;
                        if (steps.length > 1 || hasOptions) {
                            console.log(`🆕 Starting new session for ${userId} on Workflow ${rule.id}`);
                            await pool.query(
                                'INSERT INTO automation_sessions (user_id, workflow_id, current_step_index) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE workflow_id = ?, current_step_index = ?',
                                [userId, rule.id, firstStepId, rule.id, firstStepId]
                            );
                        }
                    }

                } catch (e) {
                    console.error('Failed to send auto-reply', e);
                }
                break; // Stop after first match
            }
        }
    } catch (error) {
        console.error('Error in automation logic:', error);
    }
});

// --- API Endpoints for Frontend ---

// 0. Automation Endpoints
// 0.4 Automation Endpoints
app.get('/api/automations', async (req, res) => {
    try {
        let rules;
        try {
            const [rows] = await pool.query('SELECT * FROM automation_rules');
            rules = rows;
        } catch (dbError) {
            console.warn("⚠️ DB Connection Failed (Get Automations). Using Mock Data.");
            rules = MOCK_AUTOMATION_RULES;
        }

        const formattedRules = rules.map(r => ({
            id: r.id,
            name: r.name,
            trigger: r.trigger_text,
            response: r.response_text,
            active: !!r.active,
            matchType: r.match_type,
            hitCount: r.hit_count,
            steps: typeof r.steps === 'string' ? JSON.parse(r.steps) : r.steps
        }));
        res.json({ success: true, rules: formattedRules });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/automations', async (req, res) => {
    const { name, trigger, response, matchType, steps } = req.body;
    const id = Date.now().toString();
    try {
        const stepsToSave = steps || [response];
        await pool.query(
            'INSERT INTO automation_rules (id, name, trigger_text, response_text, match_type, steps) VALUES (?, ?, ?, ?, ?, ?)',
            [id, name, trigger, response, matchType || 'contains', JSON.stringify(stepsToSave)]
        );
        res.json({ success: true, rule: { id, name, trigger, response, active: true, matchType, hitCount: 0, steps: stepsToSave } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/automations/:id', async (req, res) => {
    const { id } = req.params;
    const { name, trigger, response, active, matchType } = req.body;

    try {
        // Build query dynamically based on what's provided
        const updates = [];
        const values = [];
        if (name !== undefined) { updates.push('name = ?'); values.push(name); }
        if (trigger !== undefined) { updates.push('trigger_text = ?'); values.push(trigger); }
        if (response !== undefined) { updates.push('response_text = ?'); values.push(response); }
        if (active !== undefined) { updates.push('active = ?'); values.push(active ? 1 : 0); }
        if (matchType !== undefined) { updates.push('match_type = ?'); values.push(matchType); }
        if (req.body.steps !== undefined) { updates.push('steps = ?'); values.push(JSON.stringify(req.body.steps)); }

        if (updates.length > 0) {
            values.push(id);
            await pool.query(`UPDATE automation_rules SET ${updates.join(', ')} WHERE id = ?`, values);
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/automations/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM automation_rules WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 0.4.5 Message Templates Endpoints
app.get('/api/templates', async (req, res) => {
    try {
        // Create table if not exists (Lazy init)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS message_templates (
                id VARCHAR(255) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        const [rows] = await pool.query('SELECT * FROM message_templates ORDER BY created_at DESC');
        res.json({ success: true, templates: rows });
    } catch (error) {
        console.error("Failed to fetch templates", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/templates', async (req, res) => {
    const { name, content } = req.body;
    const id = Date.now().toString();
    try {
        await pool.query(
            'INSERT INTO message_templates (id, name, content) VALUES (?, ?, ?)',
            [id, name, content]
        );
        res.json({ success: true, template: { id, name, content } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/templates/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM message_templates WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 0.5 Metadata Endpoints (Teachers)
app.get('/api/metadata', async (req, res) => {
    try {
        let rows;
        try {
            const [dbRows] = await pool.query('SELECT * FROM teacher_metadata');
            rows = dbRows;
        } catch (dbError) {
            console.warn("⚠️ DB Connection Failed (Get Metadata). Using Mock Data.");
            rows = MOCK_TEACHER_METADATA;
        }

        // Convert rows to object map for easy lookup by frontend
        const metadata = {};
        rows.forEach(row => {
            metadata[row.id] = {
                name: row.name,
                source: row.source,
                status: row.status,
                tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags,
                notes: row.notes,
                location: row.location,
                email: row.email
            };
        });
        res.json({ success: true, metadata });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// In-memory fallback for pipeline stages
let localPipelineStages = [...MOCK_PIPELINE_STAGES];

// 0.6 Pipeline Stages Endpoints
app.get('/api/pipeline-stages', async (req, res) => {
    try {
        let stages;
        try {
            const [rows] = await pool.query('SELECT * FROM pipeline_stages ORDER BY position ASC');
            stages = rows;
            // Sync local mock data with DB data if needed, or just prefer DB
        } catch (dbError) {
            console.warn("⚠️ DB Connection Failed (Get Pipeline Stages). Using Mock Data.");
            stages = localPipelineStages;
        }
        res.json({ success: true, stages });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/pipeline-stages', async (req, res) => {
    const { name, color } = req.body;
    const id = name; // Simple ID for now
    try {
        try {
            // Get max position
            const [rows] = await pool.query('SELECT MAX(position) as maxPos FROM pipeline_stages');
            const position = (rows[0].maxPos || 0) + 1;

            await pool.query(
                'INSERT INTO pipeline_stages (id, name, position, color) VALUES (?, ?, ?, ?)',
                [id, name, position, color || 'bg-slate-400']
            );
        } catch (dbError) {
            console.warn("⚠️ DB Connection Failed (Create Pipeline Stage). Updating Mock Data.");
            const position = localPipelineStages.length + 1;
            localPipelineStages.push({ id, name, position, color: color || 'bg-slate-400' });
        }

        // Return success either way
        // We need to calculate position for the response if we used mock
        const position = localPipelineStages.find(s => s.id === id)?.position || 0;
        res.json({ success: true, stage: { id, name, position, color } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/pipeline-stages/:id', async (req, res) => {
    const { id } = req.params;
    try {
        try {
            await pool.query('DELETE FROM pipeline_stages WHERE id = ?', [id]);
        } catch (dbError) {
            console.warn("⚠️ DB Connection Failed (Delete Pipeline Stage). Updating Mock Data.");
            localPipelineStages = localPipelineStages.filter(s => s.id !== id);
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/pipeline-stages/reorder', async (req, res) => {
    const { stageIds } = req.body;
    try {
        // Update DB
        try {
            for (let i = 0; i < stageIds.length; i++) {
                await pool.query('UPDATE pipeline_stages SET position = ? WHERE id = ?', [i + 1, stageIds[i]]);
            }
        } catch (dbError) {
            console.warn("⚠️ DB Connection Failed (Reorder Pipeline Stages). Updating Mock Data.");
        }

        // Update Local Mock Data
        const reorderedStages = [];
        stageIds.forEach((id, index) => {
            const stage = localPipelineStages.find(s => s.id === id);
            if (stage) {
                stage.position = index + 1;
                reorderedStages.push(stage);
            }
        });

        // Add any missing stages to the end (just in case)
        localPipelineStages.forEach(s => {
            if (!stageIds.includes(s.id)) {
                s.position = reorderedStages.length + 1;
                reorderedStages.push(s);
            }
        });

        localPipelineStages = reorderedStages.sort((a, b) => a.position - b.position);

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/metadata/:id', async (req, res) => {
    const { id } = req.params;
    const { name, source, status, tags, notes, location, email } = req.body;
    console.log(`POST /api/metadata/${id}`, { name, status, tags, notes });


    try {
        const [result] = await pool.query(
            `INSERT INTO teacher_metadata (id, name, source, status, tags, notes, location, email) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE 
             name = VALUES(name), source = VALUES(source), status = VALUES(status), 
             tags = VALUES(tags), notes = VALUES(notes), location = VALUES(location), email = VALUES(email)`,
            [id, name, source, status, JSON.stringify(tags || []), notes, location, email]
        );
        console.log(`✅ Metadata updated for ${id}. Rows affected: ${result.affectedRows}`);
        res.json({ success: true, updated: result.affectedRows });
    } catch (error) {
        console.error('Metadata Save Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 1. Get Status
app.get('/api/status', (req, res) => {
    res.json({
        connected: isClientReady,
        qrCode: qrCodeData,
        info: clientInfo,
        authenticated: isAuthenticated
    });
});

// Initialize Chats Table
const initChatsTable = async () => {
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS chats (
            id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255),
            unread_count INT DEFAULT 0,
            timestamp INT,
            last_message TEXT,
            last_message_type VARCHAR(50),
            last_message_status INT,
            last_message_from_me BOOLEAN,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )`);
        console.log("Chats table initialized");
    } catch (err) {
        console.error("Failed to init chats table:", err);
    }
};
initChatsTable();

// Initialize Metadata Table
const initMetadataTable = async () => {
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS teacher_metadata (
            id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255),
            source VARCHAR(50),
            status VARCHAR(50),
            tags JSON,
            notes TEXT,
            location VARCHAR(255),
            email VARCHAR(255),
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )`);
        console.log("Teacher metadata table initialized");
    } catch (err) {
        console.error("Failed to init metadata table:", err);
    }
};
initMetadataTable();

// Sync Chats Function
let isSyncing = false;
const syncChats = async (retries = 3) => {
    if (!isClientReady) return;
    if (isSyncing) {
        console.log('⚠️ Sync already in progress, skipping...');
        return;
    }
    isSyncing = true;
    console.log(`🔄 Syncing chats... (Retries left: ${retries})`);

    let chats = [];

    try {
        chats = await client.getChats();
        console.log(`Fetched ${chats.length} chats from WA via lib`);
    } catch (libError) {
        console.warn(`⚠️ client.getChats() failed: ${libError.message}. Trying internal workaround...`);
        try {
            // Workaround: Access chats via WWebJS internal object
            if (!client.pupPage) {
                throw new Error('Puppeteer page not available');
            }

            // Get raw chat list from WWebJS internal object (injected by whatsapp-web.js)
            const rawChats = await client.pupPage.evaluate(() => {
                try {
                    // WWebJS object is injected by whatsapp-web.js
                    if (window.WWebJS && window.WWebJS.getChats) {
                        return window.WWebJS.getChats();
                    }

                    // Fallback: Try to access Store directly
                    const Store = window.Store;
                    if (!Store) return { error: 'Store not found' };

                    // Try different chat store paths
                    const chatStore = Store.Chat || Store.Chats || Store.ChatCollection;
                    if (!chatStore) return { error: 'Chat store not found' };

                    const models = chatStore.models || chatStore._models ||
                        (chatStore.getModels && chatStore.getModels()) || [];

                    return models.map(c => {
                        try {
                            return {
                                id: c.id ? (c.id._serialized || String(c.id)) : null,
                                name: c.name || c.formattedTitle || c.contact?.pushname || c.contact?.name || '',
                                unreadCount: c.unreadCount || 0,
                                timestamp: c.t || c.timestamp || 0,
                                isGroup: c.isGroup || false,
                                lastMessage: c.lastMsg ? {
                                    body: c.lastMsg.body || '',
                                    type: c.lastMsg.type || 'chat',
                                    ack: c.lastMsg.ack || 0,
                                    fromMe: c.lastMsg.id ? c.lastMsg.id.fromMe : false
                                } : null
                            };
                        } catch (e) {
                            return null; // Skip problematic chats
                        }
                    }).filter(c => c && c.id && !c.id.includes('@lid')); // Skip @lid chats
                } catch (innerErr) {
                    return { error: innerErr.message };
                }
            });

            if (rawChats && rawChats.error) {
                throw new Error(`Browser eval error: ${rawChats.error}`);
            }

            chats = rawChats || [];
            console.log(`✅ Fetched ${chats.length} chats via internal workaround`);
        } catch (pupError) {
            console.error(`❌ Internal workaround also failed: ${pupError.message}`);
            // Retry logic
            if (retries > 0) {
                console.log(`⚠️ Retrying sync in 3 seconds...`);
                await new Promise(resolve => setTimeout(resolve, 3000));
                isSyncing = false; // Reset flag before recursion
                return syncChats(retries - 1);
            }
            return;
        }
    }

    try {
        if (chats.length > 0) {
            const mostRecent = chats.reduce((latest, chat) => Math.max(latest, chat.timestamp || 0), 0);
            console.log(`🕒 LATEST CHAT TIMESTAMP FROM WA: ${new Date(mostRecent * 1000).toLocaleString()}`);
        }

        for (const chat of chats) {
            const lastMsg = chat.lastMessage;
            // Handle different ID structures (lib vs raw)
            const serializedId = chat.id._serialized || chat.id;

            await pool.query(
                `INSERT INTO chats (id, name, unread_count, timestamp, last_message, last_message_type, last_message_status, last_message_from_me)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                 name = VALUES(name), unread_count = VALUES(unread_count), timestamp = VALUES(timestamp),
                 last_message = VALUES(last_message), last_message_type = VALUES(last_message_type),
                 last_message_status = VALUES(last_message_status), last_message_from_me = VALUES(last_message_from_me)`,
                [
                    serializedId,
                    chat.name || '',
                    chat.unreadCount || 0,
                    chat.timestamp || 0,
                    lastMsg ? (lastMsg.body || '') : '',
                    lastMsg ? (lastMsg.type || 'unknown') : 'unknown',
                    lastMsg ? (typeof lastMsg.ack === 'number' ? lastMsg.ack : 0) : 0,
                    lastMsg ? (typeof lastMsg.fromMe === 'boolean' ? lastMsg.fromMe : false) : false
                ]
            );
        }
        console.log("✅ Chats synced to DB");
    } catch (dbError) {
        console.error("Failed to save chats to DB:", dbError);
    } finally {
        isSyncing = false;
    }
};

// Periodic Sync (Every 5 minutes)
setInterval(() => {
    if (isClientReady) {
        console.log('⏰ Triggering periodic background sync...');
        syncChats();
    }
}, 5 * 60 * 1000);

// 1.0 Clear Cache - Delete all cached chats and messages
app.delete('/api/clear-cache', async (req, res) => {
    console.log("🗑️ DELETE /api/clear-cache called");
    try {
        // Clear messages first (foreign key dependency if any)
        await pool.query('DELETE FROM messages');
        console.log("✅ Cleared messages table");

        // Clear chats
        await pool.query('DELETE FROM chats');
        console.log("✅ Cleared chats table");

        // Trigger fresh sync if connected
        if (isClientReady) {
            console.log("🔄 Triggering fresh sync...");
            syncChats();
        }

        res.json({ success: true, message: 'Cache cleared successfully. Fresh sync triggered.' });
    } catch (error) {
        console.error("Clear cache error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 1.0.1 Manual Sync Endpoint
app.post('/api/sync', async (req, res) => {
    if (!isClientReady) {
        return res.status(503).json({ success: false, error: 'WhatsApp is not connected' });
    }
    // Fire and forget
    syncChats();
    res.json({ success: true, message: 'Sync triggered in background' });
});

// 1.1 Get Chats (From DB)
app.get('/api/chats', async (req, res) => {
    // console.log("GET /api/chats called");

    try {
        // Fetch from DB joined with metadata
        const [rows] = await pool.query(`
            SELECT c.*, 
                   tm.source, tm.status, tm.tags, tm.notes, tm.location, tm.email, tm.name as metadata_name
            FROM chats c
            LEFT JOIN teacher_metadata tm ON c.id = tm.id
            ORDER BY c.timestamp DESC
        `);

        if (rows.length === 0 && isClientReady) {
            // Only trigger sync if DB is empty, but don't wait for it
            console.log("DB empty, triggering initial sync...");
            syncChats();
        }

        // console.log(`Returning ${rows.length} chats from DB`);
        res.json({ success: true, chats: mapRowsToChats(rows) });

    } catch (error) {
        console.error("Get Chats Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Helper to map DB rows to Chat objects
const mapRowsToChats = (rows) => {
    return rows.map(row => {
        let tags = [];
        try {
            tags = typeof row.tags === 'string' ? JSON.parse(row.tags) : (row.tags || []);
        } catch (e) {
            tags = [];
        }

        return {
            id: row.id,
            name: row.metadata_name || row.name, // Prefer metadata name if set (e.g. edited by user)
            phone: row.id, // Phone is the ID
            unreadCount: row.unread_count,
            timestamp: row.timestamp,
            lastMessage: {
                body: row.last_message,
                type: row.last_message_type,
                status: row.last_message_status,
                fromMe: Boolean(row.last_message_from_me)
            },
            // Metadata fields
            source: row.source || 'whatsapp',
            status: row.status || 'New Lead',
            tags: tags,
            notes: row.notes || '',
            location: row.location || '',
            email: row.email || ''
        };
    });
};

import multer from 'multer';

// ... (imports)

// Configure Multer for memory storage (we'll process buffer directly)
const upload = multer({ storage: multer.memoryStorage() });

// ... (middleware)

// 2. Send Message (Text or Media)
app.post('/api/send', upload.single('file'), async (req, res) => {
    console.log(`POST /api/send called. isClientReady: ${isClientReady}`);

    // OFFLINE QUEUE LOGIC
    if (!isClientReady) {
        const { phone, message } = req.body;
        console.warn("⚠️ Client not ready. Queuing message...");

        const tempId = Date.now().toString();
        const chatId = phone.includes('@') ? phone : `${phone.replace(/[^0-9]/g, '')}@c.us`;

        try {
            await pool.query(
                `INSERT INTO messages (id, chat_id, sender_id, from_me, body, timestamp, status, type, has_media, ack) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    tempId,
                    chatId,
                    'agent', // Simplified sender
                    1, // fromMe
                    message || '', // Body
                    Math.floor(Date.now() / 1000), // Unix timestamp
                    'pending', // Status
                    req.file ? 'media' : 'text', // Type (simplified)
                    req.file ? 1 : 0, // hasMedia
                    0 // ack
                ]
            );

            return res.json({
                success: true,
                status: 'queued',
                messageId: tempId,
                note: 'Message queued for delivery'
            });

        } catch (dbErr) {
            console.error("Failed to queue message", dbErr);
            return res.status(500).json({ success: false, error: 'Database error while queuing' });
        }
    }

    const { phone, message } = req.body;
    const file = req.file;

    try {
        let chatId;
        if (phone.includes('@')) {
            chatId = phone;
        } else {
            const sanitizedNumber = phone.replace(/[^0-9]/g, '');
            chatId = `${sanitizedNumber}@c.us`;
        }

        console.log('Send Request Body:', req.body); // Debug log
        console.log('Quoted Message ID:', req.body.quotedMessageId); // Debug log

        let response;
        if (file) {
            console.log(`Sending media to ${chatId}:`, {
                mimetype: file.mimetype,
                originalname: file.originalname,
                size: file.size
            });

            // Send Media
            const media = new whatsappWeb.MessageMedia(
                file.mimetype,
                file.buffer.toString('base64'),
                file.originalname
            );

            const options = {};
            if (file.mimetype.startsWith('audio/')) {
                options.sendAudioAsVoice = true; // Send as PTT
                // Force mimetype to ensure WhatsApp accepts it as PTT
                media.mimetype = 'audio/mp3';
            }
            if (message) {
                options.caption = message;
            }
            if (req.body.quotedMessageId) {
                options.quotedMessageId = req.body.quotedMessageId;
            }

            try {
                response = await client.sendMessage(chatId, media, options);
            } catch (sendError) {
                console.warn("Primary send failed. Retrying as document...", sendError);
                if (options.sendAudioAsVoice) {
                    delete options.sendAudioAsVoice;
                    response = await client.sendMessage(chatId, media, options);
                } else {
                    throw sendError;
                }
            }
        } else {
            // Send Text
            const options = {};
            if (req.body.quotedMessageId) {
                options.quotedMessageId = req.body.quotedMessageId;
            }
            response = await client.sendMessage(chatId, message, options);
        }

        res.json({ success: true, response });
    } catch (error) {
        console.error("Send Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});


// 2.1 Delete Message
app.delete('/api/messages/:chatId/:messageId', async (req, res) => {
    const { chatId, messageId } = req.params;
    try {
        console.log(`Attempting to delete msg: ${messageId} in chat: ${chatId}`);
        // We need to find the message object to delete it.
        // Since we don't store messages in DB yet, we fetch recent messages from chat
        const chat = await client.getChatById(chatId);
        const messages = await chat.fetchMessages({ limit: 100 }); // Increased limit

        const msgToDelete = messages.find(m => m.id.id === messageId);

        if (msgToDelete) {
            console.log(`Found message. Deleting...`);
            await msgToDelete.delete(true); // true = delete for everyone
            res.json({ success: true });
        } else {
            console.warn(`Message ${messageId} not found in last 100 messages.`);
            // Debug: Log first few IDs to see format
            if (messages.length > 0) {
                console.log(`Sample available IDs: ${messages.slice(0, 3).map(m => m.id.id).join(', ')}`);
            }
            res.status(404).json({ success: false, error: 'Message not found in recent history' });
        }
    } catch (error) {
        console.error("Delete Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- ACTIVITIES API ---

// Initialize Activities Table
const initActivitiesTable = async () => {
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS activities (
            id VARCHAR(255) PRIMARY KEY,
            teacher_id VARCHAR(255) NOT NULL,
            type VARCHAR(50) NOT NULL,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            timestamp VARCHAR(255),
            user VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);
        console.log("Activities table initialized");
    } catch (err) {
        console.error("Failed to init activities table:", err);
    }
};

// Call init on startup (lazy or immediate)
initActivitiesTable();

// Get Activities
app.get('/api/activities/:teacherId', async (req, res) => {
    const { teacherId } = req.params;
    try {
        const [rows] = await pool.query('SELECT * FROM activities WHERE teacher_id = ? ORDER BY created_at DESC', [teacherId]);
        res.json({ success: true, activities: rows });
    } catch (error) {
        console.error("Get Activities Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create Activity
app.post('/api/activities', async (req, res) => {
    const { id, teacherId, type, title, description, timestamp, user } = req.body;
    try {
        const activityId = id || Date.now().toString();
        await pool.query(
            `INSERT INTO activities (id, teacher_id, type, title, description, timestamp, user) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [activityId, teacherId, type, title, description, timestamp, user]
        );
        res.json({ success: true, id: activityId });
    } catch (error) {
        console.error("Create Activity Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 2.2 Forward Message
app.post('/api/messages/:messageId/forward', async (req, res) => {
    const { messageId } = req.params;
    const { toChatId } = req.body;

    try {
        console.log(`Attempting to forward msg: ${messageId} to: ${toChatId}`);
        const fromChatId = req.body.fromChatId;
        if (!fromChatId) {
            return res.status(400).json({ success: false, error: 'fromChatId is required' });
        }

        const chat = await client.getChatById(fromChatId);
        const messages = await chat.fetchMessages({ limit: 100 }); // Increased limit
        const msgToForward = messages.find(m => m.id.id === messageId);

        if (msgToForward) {
            console.log(`Found message to forward. Forwarding...`);
            await msgToForward.forward(toChatId);
            res.json({ success: true });
        } else {
            console.warn(`Message ${messageId} not found for forwarding.`);
            res.status(404).json({ success: false, error: 'Message not found to forward' });
        }
    } catch (error) {
        console.error("Forward Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 3. Get Messages (From DB with Backfill/Sync)
app.get('/api/messages/:phone', async (req, res) => {
    const { phone } = req.params;
    console.log(`GET /api/messages/${phone} called`);

    // if (!isClientReady) {
    //     console.warn('❌ Client not ready, returning empty messages');
    //     return res.status(400).json({ success: false, error: 'WhatsApp is not connected' });
    // }


    try {
        let chatId;
        if (phone.includes('@')) {
            chatId = phone;
        } else {
            const sanitizedNumber = phone.replace(/[^0-9]/g, '');
            chatId = `${sanitizedNumber}@c.us`;
        }
        console.log(`Fetching messages for chatId: ${chatId}`);

        // 1. Fetch recent messages from WhatsApp Client (Sync)
        if (isClientReady) {
            console.log(`Syncing messages for ${chatId}...`);
            let recentMessages = [];

            try {
                const chat = await client.getChatById(chatId);
                recentMessages = await chat.fetchMessages({ limit: 50 });
                console.log(`Fetched ${recentMessages.length} recent messages from WhatsApp (lib)`);
            } catch (libErr) {
                console.warn(`⚠️ client.getChatById failed: ${libErr.message}. Trying Puppeteer fallback...`);
                try {
                    // Fallback: Fetch via Puppeteer injection
                    recentMessages = await client.pupPage.evaluate((targetChatId) => {
                        const msgs = window.Store.Msg.models
                            .filter(m => m.to && (m.to._serialized === targetChatId || m.from._serialized === targetChatId))
                            .slice(-50); // Get last 50
                        return msgs.map(m => ({
                            id: { id: m.id.id },
                            author: m.author,
                            from: m.from._serialized,
                            fromMe: m.id.fromMe,
                            body: m.body,
                            timestamp: m.t,
                            type: m.type,
                            hasMedia: m.hasMedia,
                            ack: m.ack
                        }));
                    }, chatId);
                    console.log(`✅ Fetched ${recentMessages.length} messages via Puppeteer Fallback`);
                } catch (pupErr) {
                    console.error(`❌ Puppeteer message fetch failed: ${pupErr.message}`);
                }
            }

            // 2. Upsert to DB
            for (const msg of recentMessages) {
                const status = msg.ack === 3 ? 'read' : msg.ack === 2 ? 'received' : 'sent';
                await pool.query(
                    `INSERT INTO messages (id, chat_id, sender_id, from_me, body, timestamp, status, type, has_media, ack) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE status = VALUES(status), ack = VALUES(ack)`,
                    [
                        msg.id.id,
                        chatId,
                        msg.author || msg.from,
                        msg.fromMe,
                        msg.body,
                        msg.timestamp,
                        status,
                        msg.type,
                        msg.hasMedia,
                        msg.ack
                    ]
                );
            }
            console.log(`Synced ${recentMessages.length} messages to DB`);
        }

        // 3. Fetch all from DB (now updated)
        const [dbMessages] = await pool.query('SELECT * FROM messages WHERE chat_id = ? ORDER BY timestamp ASC', [chatId]);
        console.log(`DB returned ${dbMessages.length} messages for ${chatId} after sync`);

        const formattedMessages = dbMessages.map(msg => ({
            id: msg.id,
            senderId: msg.from_me ? 'agent' : 'teacher',
            text: msg.body,
            timestamp: new Date(msg.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isIncoming: !msg.from_me,
            status: msg.status,
            type: msg.type,
            hasMedia: !!msg.has_media,
            mediaType: msg.type,
            quotedMessage: msg.quoted_msg_id ? {
                id: msg.quoted_msg_id,
                body: msg.quoted_msg_body,
                senderId: msg.quoted_msg_sender
            } : undefined
        }));

        res.json({ success: true, messages: formattedMessages });

    } catch (error) {
        console.error('Fetch Messages Error:', error);
        res.json({ success: true, messages: [] });
    }
});

// 3.5 Get Media
app.get('/api/messages/:phone/:msgId/media', async (req, res) => {
    if (!isClientReady) {
        return res.status(400).send('WhatsApp is not connected');
    }

    const { phone, msgId } = req.params;
    try {
        let chatId;
        if (phone.includes('@')) {
            chatId = phone;
        } else {
            const sanitizedNumber = phone.replace(/[^0-9]/g, '');
            chatId = `${sanitizedNumber}@c.us`;
        }

        const chat = await client.getChatById(chatId);

        // Try to get message directly if supported
        let msg = null;
        if (typeof client.getMessageById === 'function') {
            try {
                msg = await client.getMessageById(msgId);
            } catch (e) {
                console.warn(`client.getMessageById failed for ${msgId}`, e);
            }
        }

        // Fallback to fetching recent messages (increased limit)
        if (!msg) {
            console.log(`Fetching recent messages to find ${msgId}...`);
            const messages = await chat.fetchMessages({ limit: 500 });
            msg = messages.find(m => m.id.id === msgId);
        }

        if (!msg) {
            return res.status(404).send('Message not found');
        }

        if (!msg.hasMedia) {
            return res.status(400).send('Message does not have media');
        }

        const media = await msg.downloadMedia();
        if (!media) {
            return res.status(404).send('Media not found');
        }

        res.setHeader('Content-Type', media.mimetype);
        res.send(Buffer.from(media.data, 'base64'));

    } catch (error) {
        console.error('Fetch Media Error:', error);
        res.status(500).send('Error fetching media');
    }
});



// 4.1 Mark Chat as Read
app.post('/api/chats/:chatId/read', async (req, res) => {
    if (!isClientReady) {
        return res.status(503).json({ success: false, error: 'WhatsApp is not connected' });
    }
    const { chatId } = req.params;
    try {
        const chat = await client.getChatById(chatId);
        await chat.sendSeen();
        res.json({ success: true });
    } catch (error) {
        console.error(`Error marking chat ${chatId} as read:`, error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 4.5. Get individual profile picture
app.get('/api/profile-pic/:chatId', async (req, res) => {
    if (!isClientReady) {
        return res.status(503).json({ success: false, error: 'WhatsApp is not connected' });
    }

    const { chatId } = req.params;

    try {
        let profilePicUrl = null;

        // Strategy 1: Chat -> Contact
        try {
            const chat = await client.getChatById(chatId);
            if (chat) {
                profilePicUrl = await Promise.race([
                    chat.getContact().then(c => c.getProfilePicUrl()),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
                ]);
                if (profilePicUrl) console.log(`Strategy 1 success for ${chatId}`);
            }
        } catch (e) {
            // console.warn(`Strategy 1 failed: ${e.message}`);
        }

        // Strategy 2: Client Direct
        if (!profilePicUrl) {
            try {
                profilePicUrl = await Promise.race([
                    client.getProfilePicUrl(chatId),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
                ]);
                if (profilePicUrl) console.log(`Strategy 2 success for ${chatId}`);
            } catch (e) {
                // console.warn(`Strategy 2 failed: ${e.message}`);
            }
        }

        // Strategy 3: Direct Puppeteer Evaluation (Fallback for broken library methods)
        if (!profilePicUrl) {
            try {
                if (!client.pupPage) {
                    console.warn('Strategy 3 failed: client.pupPage is not available');
                } else {
                    const result = await client.pupPage.evaluate(async (chatId) => {
                        const logs = [];

                        try {
                            if (!window.Store) return { url: null, logs: ['window.Store missing'] };

                            const WidFactory = window.Store.WidFactory || window.Store.Wid;
                            if (!WidFactory) return { url: null, logs: ['WidFactory missing'] };

                            const chatWid = WidFactory.createWid(chatId);

                            // Path 1: Store.ProfilePicThumb
                            if (window.Store.ProfilePicThumb) {
                                const PPT = window.Store.ProfilePicThumb;
                                try {
                                    const method = PPT.get || PPT.find;
                                    if (typeof method === 'function') {
                                        const pic = await method.call(PPT, chatWid);
                                        if (pic) {
                                            const url = pic.eurl || pic.img || pic.__x_eurl || pic.__x_previewEurl || pic.__x_img || pic.__x_imgFull;
                                            if (url) {
                                                return { url: url, logs: ['Found via ProfilePicThumb'] };
                                            }
                                        }
                                    }
                                } catch (err) {
                                    // Ignore
                                }
                            }

                            // Path 2: Store.ContactMethods
                            if (window.Store.ContactMethods) {
                                try {
                                    const CM = window.Store.ContactMethods;
                                    if (CM.getProfilePicUrl) {
                                        const url = await CM.getProfilePicUrl(chatWid);
                                        if (url) {
                                            return { url: url, logs: ['Found via ContactMethods.getProfilePicUrl'] };
                                        }
                                    }
                                } catch (err) {
                                    // Ignore
                                }
                            }

                            // Path 3: Store.ProfilePic.profilePicResync
                            if (window.Store.ProfilePic && window.Store.ProfilePic.profilePicResync) {
                                try {
                                    await window.Store.ProfilePic.profilePicResync(chatWid);

                                    // Re-check ProfilePicThumb
                                    if (window.Store.ProfilePicThumb) {
                                        const PPT = window.Store.ProfilePicThumb;
                                        const method = PPT.get || PPT.find;
                                        if (typeof method === 'function') {
                                            const pic = await method.call(PPT, chatWid);
                                            if (pic) {
                                                const url = pic.eurl || pic.__x_eurl || pic.__x_previewEurl;
                                                if (url) {
                                                    return { url: url, logs: ['Found via ProfilePicThumb AFTER resync'] };
                                                }
                                            }
                                        }
                                    }
                                } catch (err) {
                                    // Ignore
                                }
                            }

                            // Path 4: Store.ProfilePic.requestProfilePicFromServer (Fallback with timeout)
                            if (window.Store.ProfilePic && window.Store.ProfilePic.requestProfilePicFromServer) {
                                try {
                                    const requestPromise = window.Store.ProfilePic.requestProfilePicFromServer(chatWid);
                                    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve('TIMEOUT'), 2000));

                                    const result = await Promise.race([requestPromise, timeoutPromise]);

                                    if (result !== 'TIMEOUT' && result && result.eurl) {
                                        return { url: result.eurl, logs: ['Found via requestProfilePicFromServer'] };
                                    }
                                } catch (err) {
                                    // Ignore
                                }
                            }

                            // Path 5: Store.Contact.get (Fallback)
                            if (window.Store.Contact) {
                                const contact = window.Store.Contact.get(chatWid);
                                if (contact) {
                                    if (contact.profilePicThumbObj && contact.profilePicThumbObj.eurl) {
                                        return { url: contact.profilePicThumbObj.eurl, logs: ['Found via Contact.profilePicThumbObj'] };
                                    }
                                    if (contact.eurl) {
                                        return { url: contact.eurl, logs: ['Found via Contact.eurl'] };
                                    }
                                    if (contact.pic && contact.pic.eurl) {
                                        return { url: contact.pic.eurl, logs: ['Found via Contact.pic.eurl'] };
                                    }
                                }
                            }

                            return { url: null, logs: ['No pic found'] };
                        } catch (err) {
                            return { url: null, logs: [err.message] };
                        }
                    }, chatId);

                    if (result) {
                        if (result.logs && result.logs.length > 0 && result.logs[0] !== 'No pic found') {
                            console.log(`Puppeteer Trace for ${chatId}:`, result.logs.join(' -> '));
                        }
                        if (result.url) profilePicUrl = result.url;
                    }
                }
            } catch (e) {
                console.warn(`Strategy 3 (Puppeteer) failed for ${chatId}: ${e.message}`);
            }
        }

        if (profilePicUrl) {
            // console.log(`📸 Served profile pic for ${chatId}`);
            res.json({ success: true, url: profilePicUrl });
        } else {
            // console.log(`⚠️ No profile pic found for ${chatId}`); 
            res.json({ success: false, error: 'No profile picture' });
        }
    } catch (error) {
        console.error(`Error fetching profile pic for ${chatId}:`, error.message);
        res.json({ success: false, error: error.message });
    }
});

// 3. Logout
app.post('/api/logout', async (req, res) => {
    console.log('Logout request received. isClientReady:', isClientReady);
    console.log('Logout request received. Current state - Ready:', isClientReady, 'Auth:', isAuthenticated);

    // Allow logout even if not ready, to fix stuck states
    // if (!isClientReady) { ... } // REMOVED BLOCKING CHECK

    try {
        // Always try to destroy the client to close the browser and release file locks
        if (client) {
            console.log('Destroying client to release resources...');
            try {
                await client.destroy();
            } catch (destroyErr) {
                console.warn("Client destroy warning:", destroyErr.message);
            }
        }

        // Reset local flags and info
        isClientReady = false;
        isAuthenticated = false; // Important: Clear auth flag
        clientInfo = null;
        qrCodeData = null; // Clear old QR

        // Force delete session files to ensure clean slate
        const fs = await import('fs');
        const authPath = path.join(__dirname, '.wwebjs_auth');
        const cachePath = path.join(__dirname, '.wwebjs_cache');

        try {
            if (fs.existsSync(authPath)) fs.rmSync(authPath, { recursive: true, force: true });
            if (fs.existsSync(cachePath)) fs.rmSync(cachePath, { recursive: true, force: true });
            console.log('Deleted session files.');
        } catch (fileErr) {
            console.error('Failed to delete session files:', fileErr);
        }

        // Try to re-initialize the client so the server can accept a new login later
        try {
            if (client && typeof client.initialize === 'function') {
                console.log('Re-initializing WhatsApp client after logout');
                client.initialize();
            }
        } catch (initErr) {
            console.warn('Client re-initialize failed:', initErr && initErr.message);
        }

        console.log('Client logged out successfully');
        res.json({ success: true });
    } catch (error) {
        console.error('Logout error:', error && error.stack ? error.stack : error);
        res.status(500).json({ success: false, error: error && error.message ? error.message : 'Unknown error' });
    }
});

// Handle React Routing (Must be last - only for GET requests that aren't API calls)
app.get(/^(?!\/api).*$/, (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Start Client and Server
client.initialize();

httpServer.listen(port, '0.0.0.0', () => {
    console.log(`WhatsApp Middleware Server running at http://0.0.0.0:${port}`);
});

// Socket.IO Connection Handler
io.on('connection', (socket) => {
    console.log('🔌 New client connected:', socket.id);

    // Immediately send current status
    socket.emit('status', {
        connected: isClientReady,
        authenticated: isAuthenticated,
        info: clientInfo
    });

    // If there's a pending QR code, send it
    if (!isClientReady && !isAuthenticated && qrCodeData) {
        socket.emit('qr', { qr: qrCodeData });
    }

    socket.on('disconnect', () => {
        console.log('❌ Client disconnected:', socket.id);
    });
});