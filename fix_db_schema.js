
import pool from './db.js';

async function fixSchema() {
    try {
        console.log("Dropping activities table...");
        await pool.query("DROP TABLE IF EXISTS activities");
        console.log("Activities table dropped.");

        console.log("Dropping teacher_metadata table...");
        await pool.query("DROP TABLE IF EXISTS teacher_metadata");
        console.log("Teacher metadata table dropped.");

        console.log("Tables dropped. Restarting the server will recreate them with the correct schema.");
        process.exit(0);
    } catch (e) {
        console.error("Schema Fix Error:", e);
        process.exit(1);
    }
}
fixSchema();
