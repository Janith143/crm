
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'clazz_crm',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function debugDB() {
    try {
        console.log("--- Debugging DB Content ---");

        // Check for ANY notes
        const [notes] = await pool.query('SELECT id, name, notes, updated_at FROM teacher_metadata WHERE notes IS NOT NULL AND notes != "" ORDER BY updated_at DESC LIMIT 5');
        console.log("\nRecent Notes:");
        if (notes.length === 0) console.log("No notes found in DB.");
        notes.forEach(n => console.log(`[${n.updated_at}] ${n.name} (${n.id}): ${n.notes}`));

        // Check most recent metadata updates
        const [recent] = await pool.query('SELECT id, name, notes, updated_at FROM teacher_metadata ORDER BY updated_at DESC LIMIT 5');
        console.log("\nMost Recent Metadata Updates:");
        recent.forEach(r => console.log(`[${r.updated_at}] ${r.name} (${r.id}): Notes='${r.notes}'`));

    } catch (error) {
        console.error("Debug Error:", error);
    } finally {
        await pool.end();
    }
}

debugDB();
