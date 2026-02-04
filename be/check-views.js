const { primaryDB } = require('./src/config/database');

async function checkViews() {
    try {
        await primaryDB.authenticate();
        console.log('Connected to DB.');

        const [results] = await primaryDB.query(`
      SELECT table_name, table_type 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('v_archive_tasks', 'v_archive_candidates', 'archive_batch');
    `);

        console.log('Found objects:', results);

        // Also check if they are readable
        if (results.length > 0) {
            try {
                await primaryDB.query('SELECT count(*) FROM v_archive_tasks');
                console.log('v_archive_tasks is readable');
            } catch (e) { console.error('Error reading v_archive_tasks:', e.message); }
        }

    } catch (error) {
        console.error('Check failed:', error);
    } finally {
        await primaryDB.close();
    }
}

checkViews();
