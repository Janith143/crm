import pool from './db.js';

async function migrate() {
    try {
        console.log('Running migration...');

        // Add steps column if not exists
        try {
            await pool.query('ALTER TABLE automation_rules ADD COLUMN steps JSON');
            console.log('✅ Added steps column to automation_rules');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('ℹ️ steps column already exists');
            } else {
                console.error('Error adding column:', e.message);
            }
        }

        // Create automation_sessions table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS automation_sessions (
                user_id VARCHAR(255) PRIMARY KEY,
                workflow_id VARCHAR(255) NOT NULL,
                current_step_index INT DEFAULT 0,
                last_interaction TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Created automation_sessions table');

        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();
