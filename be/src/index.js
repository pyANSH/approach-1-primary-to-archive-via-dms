const express = require('express');
const { Op } = require('sequelize');
const { primaryDB, archiveDB } = require('./config/database');
const Task = require('./models/primary/Task');
const TaskCandidate = require('./models/primary/TaskCandidate');
const ArchivedTask = require('./models/archive/Task');
const ArchivedTaskCandidate = require('./models/archive/TaskCandidate');

const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();
const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const {
  archiveMigrationJob,
  createArchiveBatch,
  getArchiveCounts,
  getDefaultCutoffDate
} = require('./jobs/archive-migration');
const ArchiveBatch = require('./models/primary/ArchiveBatch');

// ============ ARCHIVE BATCH MANAGEMENT ============
app.post('/test-webhook', async (req, res) => {
  try {
    console.log('Webhook triggered, running migration with cleanup...');

    // Pass isWebhook = true to enable cleanup
    const result = await archiveMigrationJob(null, true);

    res.json({
      message: 'Webhook received, migration executed successfully',
      result
    });
  } catch (err) {
    console.error('Webhook failed:', err);
    res.status(500).json({ error: err.message });
  }
});
// Create new archive batch
app.post('/archive-batch', async (req, res) => {
  try {
    const { cutoff_date } = req.body;
    const cutoffDate = cutoff_date || getDefaultCutoffDate();

    const batch = await createArchiveBatch(cutoffDate);
    const counts = await getArchiveCounts(cutoffDate);

    res.json({
      message: 'Archive batch created successfully',
      batch,
      preview: counts
    });
  } catch (err) {
    console.error('Create batch failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// List all archive batches
app.get('/archive-batch', async (req, res) => {
  try {
    const batches = await ArchiveBatch.findAll({
      order: [['created_at', 'DESC']],
      limit: 50
    });
    res.json(batches);
  } catch (err) {
    console.error('List batches failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get preview of what will be archived for a given cutoff date
app.get('/archive-batch/preview', async (req, res) => {
  try {
    const cutoffDate = req.query.cutoff_date || getDefaultCutoffDate();
    const counts = await getArchiveCounts(cutoffDate);
    res.json({
      cutoff_date: cutoffDate,
      ...counts
    });
  } catch (err) {
    console.error('Preview failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Run migration for a pending batch
app.post('/archive-batch/:id/run', async (req, res) => {
  try {
    const batchId = parseInt(req.params.id);
    const result = await archiveMigrationJob(batchId);
    res.json({ message: 'Archive migration completed successfully', result });
  } catch (err) {
    console.error('Migration failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Run migration for the latest pending batch
app.get('/run-archive-migration', async (req, res) => {
  try {
    const result = await archiveMigrationJob();
    res.json({ message: 'Archive migration completed successfully', result });
  } catch (err) {
    console.error('Migration failed:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/add-sample-data', async (req, res) => {
  try {
    console.log('Starting massive data generation...');
    const now = new Date();

    // Create 500 Tasks
    // 250 recent (this month), 250 old (> 2 months ago)
    const tasksData = [];

    // Recent tasks
    for (let i = 1; i <= 2; i++) {
      const date = new Date(now.getFullYear(), now.getMonth(), Math.max(1, Math.floor(Math.random() * now.getDate())));
      tasksData.push({
        name: `Recent Task ${i}`,
        is_archived: false,
        created_at: date
      });
    }

    // Old tasks
    for (let i = 1; i <= 2; i++) {
      const date = new Date();
      date.setMonth(now.getMonth() - 3); // 3 months ago safely
      date.setDate(Math.floor(Math.random() * 28) + 1);
      tasksData.push({
        name: `Old Task ${i}`,
        is_archived: false,
        created_at: date
      });
    }

    const createdTasks = await Task.bulkCreate(tasksData, { returning: true });
    console.log(`Created ${createdTasks.length} tasks.`);

    // Generate 1M Candidates
    // Distributed across 500 tasks -> 2000 candidates per task
    // We will insert in batches of 5000 to avoid memory issues
    const totalCandidates = 1000000;
    const candidatesPerTask = 2;
    const batchSize = 10000;
    let candidateBuffer = [];
    let insertedCount = 0;

    for (const task of createdTasks) {
      for (let j = 0; j < candidatesPerTask; j++) {
        candidateBuffer.push({
          task_id: task.id,
          name: `Candidate ${j + 1} for Task ${task.id}`,
          created_at: task.created_at
        });

        if (candidateBuffer.length >= batchSize) {
          await TaskCandidate.bulkCreate(candidateBuffer);
          insertedCount += candidateBuffer.length;
          console.log(`Inserted ${insertedCount} candidates...`);
          candidateBuffer = [];
        }
      }
    }

    if (candidateBuffer.length > 0) {
      await TaskCandidate.bulkCreate(candidateBuffer);
      insertedCount += candidateBuffer.length;
      console.log(`Inserted ${insertedCount} candidates. Done.`);
    }

    res.json({
      message: 'Massive sample data created successfully',
      tasksCount: createdTasks.length,
      candidatesCount: insertedCount
    });
  } catch (err) {
    console.error('Data generation failed:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/remove-primary-data', async (req, res) => {
  try {
    await TaskCandidate.destroy({ where: {}, truncate: { cascade: true } });
    await Task.destroy({ where: {}, truncate: { cascade: true } });
    res.json({ message: 'All data removed from primary database' });
  } catch (err) {
    console.error('Failed to remove primary data:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/remove-archive-data', async (req, res) => {
  try {
    await ArchivedTaskCandidate.destroy({ where: {}, truncate: { cascade: true } });
    await ArchivedTask.destroy({ where: {}, truncate: { cascade: true } });
    res.json({ message: 'All data removed from archive database' });
  } catch (err) {
    console.error('Failed to remove archive data:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/stream-archive-data', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  const cursor = parseInt(req.query.cursor) || 0;
  const limit = parseInt(req.query.limit) || 50;

  try {
    const candidates = await ArchivedTaskCandidate.findAll({
      where: {
        id: { [Op.gt]: cursor }
      },
      include: [{
        model: ArchivedTask,
        attributes: ['name', 'created_at'],
        required: true
      }],
      order: [['id', 'ASC']],
      limit: limit,
      raw: true,
      nest: true
    });

    const flatCandidates = candidates.map(candidate => ({
      id: candidate.id,
      name: candidate.name,
      task_id: candidate.task_id,
      created_at: candidate.created_at,
      task_name: candidate['ArchivedTask.name'], // Accessing raw joined column
      task_created_at: candidate['ArchivedTask.created_at']
    }));

    res.json(flatCandidates);

  } catch (err) {
    console.error('Fetching archive page failed:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/stream-primary-data', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  const cursor = parseInt(req.query.cursor) || 0;
  const limit = parseInt(req.query.limit) || 50;

  try {
    const candidates = await TaskCandidate.findAll({
      where: {
        id: { [Op.gt]: cursor }
      },
      include: [{
        model: Task,
        attributes: ['name', 'created_at'],
        required: true
      }],
      order: [['id', 'ASC']],
      limit: limit,
      raw: true,
      nest: true
    });

    const flatCandidates = candidates.map(candidate => ({
      id: candidate.id,
      name: candidate.name,
      task_id: candidate.task_id,
      created_at: candidate.created_at,
      task_name: candidate['Task.name'], // Accessing raw joined column
      task_created_at: candidate['Task.created_at']
    }));

    res.json(flatCandidates);

  } catch (err) {
    console.error('Fetching primary page failed:', err);
    res.status(500).json({ error: err.message });
  }
});

async function start() {
  try {
    await primaryDB.authenticate();
    await archiveDB.authenticate();
    console.log('Databases connected.');

    // Removed sync() calls as migrations are now used
    app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));
  } catch (err) {
    console.error('Startup failed:', err);
  }
}

start();
