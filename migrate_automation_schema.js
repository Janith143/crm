import pool from './db.js';

async function migrate() {
    try {
        console.log("Altering automation_sessions table...");
        await pool.query("ALTER TABLE automation_sessions MODIFY COLUMN current_step_index VARCHAR(255) DEFAULT '0'");
        console.log("Migration successful.");
    } catch (e) {
        console.error("Migration failed:", e);
    } finally {
        process.exit(0);
    }
}

migrate();
