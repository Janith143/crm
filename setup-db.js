import pool from './db.js';
import fs from 'fs';

async function setupDatabase() {
    try {
        console.log('Testing database connection...');

        // Test connection
        const connection = await pool.getConnection();
        console.log('✅ Successfully connected to database!');
        connection.release();

        // Read and execute schema.sql
        console.log('\nReading schema.sql...');
        const schema = fs.readFileSync('./schema.sql', 'utf8');

        // Split by semicolons and execute each statement
        const statements = schema
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0);

        console.log(`\nExecuting ${statements.length} SQL statements...\n`);

        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i];
            try {
                await pool.query(statement);
                // Extract table name for better logging
                const tableMatch = statement.match(/CREATE TABLE IF NOT EXISTS (\w+)|INSERT IGNORE INTO (\w+)/);
                const tableName = tableMatch ? (tableMatch[1] || tableMatch[2]) : 'unknown';
                console.log(`✅ Statement ${i + 1}/${statements.length}: ${tableName}`);
            } catch (err) {
                console.error(`❌ Error executing statement ${i + 1}:`, err.message);
                console.error('Statement:', statement.substring(0, 100) + '...');
            }
        }

        console.log('\n✅ Database setup completed successfully!');

        // Verify tables were created
        const [tables] = await pool.query('SHOW TABLES');
        console.log('\nExisting tables:');
        tables.forEach(row => {
            console.log('  -', Object.values(row)[0]);
        });

        process.exit(0);
    } catch (error) {
        console.error('❌ Database setup failed:', error.message);
        console.error('Full error:', error);
        process.exit(1);
    }
}

setupDatabase();
