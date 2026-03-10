
import pool from './db.js';

async function checkSchema() {
    try {
        console.log("Checking activities table...");
        try {
            const [actCols] = await pool.query("DESCRIBE activities");
            console.log("Activities Columns:", actCols.map(c => c.Field));
        } catch (e) {
            console.log("Activities Table Error:", e.message);
        }

        console.log("Checking teacher_metadata table...");
        try {
            const [metaCols] = await pool.query("DESCRIBE teacher_metadata");
            console.log("Metadata Columns:", metaCols.map(c => c.Field));
        } catch (e) {
            console.log("Metadata Table Error:", e.message);
        }

        process.exit(0);
    } catch (e) {
        console.error("Global Error:", e);
        process.exit(1);
    }
}
checkSchema();
