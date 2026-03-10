import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'clazz_crm',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

async function migrate() {
    console.log('Running migration...');
    const pool = mysql.createPool(dbConfig);

    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id VARCHAR(255) PRIMARY KEY,
                chat_id VARCHAR(255) NOT NULL,
                sender_id VARCHAR(255),
                from_me BOOLEAN,
                body TEXT,
                timestamp BIGINT,
                status VARCHAR(50),
                type VARCHAR(50),
                has_media BOOLEAN DEFAULT FALSE,
                ack INT DEFAULT 0,
                INDEX idx_chat_id (chat_id),
                INDEX idx_timestamp (timestamp)
            )
        `);
        console.log('✅ Created messages table');
    } catch (error) {
        console.error('❌ Migration failed:', error);
    } finally {
        await pool.end();
    }
}

migrate();
