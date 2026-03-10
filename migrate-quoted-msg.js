import pool from './db.js';

const migrate = async () => {
    try {
        console.log("Running migration to add quoted message columns...");

        // Check if columns exist
        const [columns] = await pool.query(`SHOW COLUMNS FROM messages LIKE 'quoted_msg_id'`);

        if (columns.length === 0) {
            await pool.query(`ALTER TABLE messages ADD COLUMN quoted_msg_id VARCHAR(255)`);
            await pool.query(`ALTER TABLE messages ADD COLUMN quoted_msg_body TEXT`);
            await pool.query(`ALTER TABLE messages ADD COLUMN quoted_msg_sender VARCHAR(255)`);
            console.log("✅ Added quoted_msg_id, quoted_msg_body, and quoted_msg_sender columns");
        } else {
            console.log("ℹ️ Columns already exist");
        }

        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
};

migrate();
