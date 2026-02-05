const { primaryDB } = require('./be/src/config/database');

async function checkViews() {
    try {
        await primaryDB.authenticate();
        console.log('Connected to DB.');
        const [results] = await primaryDB.query(
            "SELECT table_name FROM information_schema.views WHERE table_schema = 'public' AND table_name IN ('v_archive_tasks', 'v_archive_candidates');"
        );
        console.log('Existing Views:', results);
    } catch (err) {
        console.error('Error checking views:', err);
    } finally {
        await primaryDB.close();
    }
}

checkViews();
