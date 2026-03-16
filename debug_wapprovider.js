import pool from './db.js';

async function checkConfig() {
    try {
        const [rows] = await pool.query("SELECT * FROM app_settings WHERE setting_key = 'WA_PROVIDER'");
        console.log(rows);
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

checkConfig();
