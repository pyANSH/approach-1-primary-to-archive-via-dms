const {
    DatabaseMigrationServiceClient,
    StartReplicationTaskCommand,
    DescribeReplicationTasksCommand,
    StartReplicationCommand,
    DescribeReplicationsCommand
} = require('@aws-sdk/client-database-migration-service');
const { primaryDB, archiveDB } = require('../config/database');
const ArchiveBatch = require('../models/primary/ArchiveBatch');

const dms = new DatabaseMigrationServiceClient({ region: process.env.AWS_REGION || 'ap-south-1' });

const DMS_TASK_ARN = process.env.DMS_TASK_ARN;

// Helper: Check if using Serverless DMS (Replication Config)
function isServerless(arn) {
    return arn.includes(':replication-config:');
}

// Helper: Wait for DMS to complete
async function waitForDmsCompletion(arn) {
    console.log('Waiting for DMS to complete...');

    const serverless = isServerless(arn);

    while (true) {
        let status;
        let response;

        if (serverless) {
            const command = new DescribeReplicationsCommand({
                Filters: [{ Name: 'replication-config-arn', Values: [arn] }]
            });
            response = await dms.send(command);
            status = response.Replications?.[0]?.Status;
        } else {
            const command = new DescribeReplicationTasksCommand({
                Filters: [{ Name: 'replication-task-arn', Values: [arn] }]
            });
            response = await dms.send(command);
            status = response.ReplicationTasks?.[0]?.Status;
        }

        console.log(`DMS status: ${status}`);

        if (status === 'stopped') {
            console.log('DMS completed');
            return;
        }

        if (status === 'failed') {
            const failureInfo = serverless
                ? response.Replications?.[0]?.FailureDescription
                : response.ReplicationTasks?.[0]?.ReplicationTaskStats;

            console.error('DMS failed. Details:', JSON.stringify(serverless ? response.Replications?.[0] : response.ReplicationTasks?.[0], null, 2));
            throw new Error(`DMS failed: ${failureInfo || status}`);
        }

        // Wait 10 seconds before checking again
        await new Promise(resolve => setTimeout(resolve, 10000));
    }
}

// Helper: Wait for DMS to be in a stable state
async function waitForStableState(arn) {
    console.log('Checking DMS state...');
    const serverless = isServerless(arn);

    while (true) {
        let status;
        let response;

        if (serverless) {
            const command = new DescribeReplicationsCommand({
                Filters: [{ Name: 'replication-config-arn', Values: [arn] }]
            });
            response = await dms.send(command);
            status = response.Replications?.[0]?.Status;
        } else {
            const command = new DescribeReplicationTasksCommand({
                Filters: [{ Name: 'replication-task-arn', Values: [arn] }]
            });
            response = await dms.send(command);
            status = response.ReplicationTasks?.[0]?.Status;
        }

        console.log(`Current DMS status: ${status}`);

        if (['stopped', 'created', 'failed', 'ready'].includes(status)) {
            console.log('DMS is in a stable state.');
            return;
        }

        console.log('Waiting for stable state...');
        await new Promise(resolve => setTimeout(resolve, 10000));
    }
}

// Helper: Cleanup primary DB using batch's cutoff date
async function cleanupPrimaryDB(cutoffDate) {
    const transaction = await primaryDB.transaction();

    try {
        // Delete candidates first (foreign key dependency)
        const [candidatesResult] = await primaryDB.query(
            `DELETE FROM "p1_task_candidate" WHERE "created_at" <= :cutoffDate`,
            {
                replacements: { cutoffDate },
                transaction
            }
        );

        // Then delete tasks
        const [tasksResult] = await primaryDB.query(
            `DELETE FROM "p1_task" WHERE "created_at" <= :cutoffDate`,
            {
                replacements: { cutoffDate },
                transaction
            }
        );

        await transaction.commit();

        return {
            deletedTasks: tasksResult?.rowCount || 0,
            deletedCandidates: candidatesResult?.rowCount || 0
        };
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
}

// Create a new archive batch
async function createArchiveBatch(cutoffDate) {
    // Check if there's already a pending batch
    const existingBatch = await ArchiveBatch.findOne({
        where: { status: 'pending' }
    });

    if (existingBatch) {
        throw new Error(`There's already a pending batch (ID: ${existingBatch.id}). Complete or cancel it first.`);
    }

    const batch = await ArchiveBatch.create({
        cutoff_date: cutoffDate,
        status: 'pending'
    });

    console.log(`Created archive batch ${batch.id} with cutoff date ${cutoffDate}`);
    return batch;
}

// Get counts of records that will be archived
async function getArchiveCounts(cutoffDate) {
    const [[{ count: tasksCount }]] = await primaryDB.query(
        `SELECT COUNT(*) as count FROM "p1_task" WHERE "created_at" <= :cutoffDate`,
        { replacements: { cutoffDate } }
    );

    const [[{ count: candidatesCount }]] = await primaryDB.query(
        `SELECT COUNT(*) as count FROM "p1_task_candidate" WHERE "created_at" <= :cutoffDate`,
        { replacements: { cutoffDate } }
    );

    return {
        tasksCount: parseInt(tasksCount),
        candidatesCount: parseInt(candidatesCount)
    };
}

// Verify that data has been moved to archive DB
async function verifyArchivedData(cutoffDate, expectedCounts) {
    console.log('Verifying data in archive database...');

    const [[{ count: tasksCount }]] = await archiveDB.query(
        `SELECT COUNT(*) as count FROM "p1_task" WHERE "created_at" <= :cutoffDate`,
        { replacements: { cutoffDate } }
    );

    const [[{ count: candidatesCount }]] = await archiveDB.query(
        `SELECT COUNT(*) as count FROM "p1_task_candidate" WHERE "created_at" <= :cutoffDate`,
        { replacements: { cutoffDate } }
    );

    const archivedTasks = parseInt(tasksCount);
    const archivedCandidates = parseInt(candidatesCount);

    console.log(`Verification: Archive DB has ${archivedTasks} tasks and ${archivedCandidates} candidates (cutoff: ${cutoffDate})`);
    console.log(`Expected (from Primary): ${expectedCounts.tasksCount} tasks and ${expectedCounts.candidatesCount} candidates`);

    // We expect at least the counts we found in primary
    if (archivedTasks < expectedCounts.tasksCount) {
        throw new Error(`Data verification failed: Expected at least ${expectedCounts.tasksCount} tasks in archive, found ${archivedTasks}`);
    }

    if (archivedCandidates < expectedCounts.candidatesCount) {
        throw new Error(`Data verification failed: Expected at least ${expectedCounts.candidatesCount} candidates in archive, found ${archivedCandidates}`);
    }

    console.log('Data verification successful: Archive DB contains all required data.');
    return true;
}

// Main job processor - now uses batch from database
async function archiveMigrationJob(batchId = null, isWebhook = false) {
    // Get the batch to process
    let batch;

    if (batchId) {
        batch = await ArchiveBatch.findByPk(batchId);
        if (!batch) {
            throw new Error(`Batch ${batchId} not found`);
        }
    } else {
        // Get the latest pending batch
        batch = await ArchiveBatch.findOne({
            where: { status: 'pending' },
            order: [['created_at', 'DESC']]
        });
    }

    if (!batch) {
        throw new Error('No pending archive batch found. Create one first using createArchiveBatch()');
    }

    if (batch.status !== 'pending') {
        throw new Error(`Batch ${batch.id} is not in pending status (current: ${batch.status})`);
    }

    const cutoffDate = batch.cutoff_date;
    console.log(`Starting archive migration for batch ${batch.id} (cutoff: ${cutoffDate})`);

    if (!DMS_TASK_ARN) {
        throw new Error('DMS_TASK_ARN environment variable is not set');
    }

    const serverless = isServerless(DMS_TASK_ARN);
    console.log(`Detected DMS mode: ${serverless ? 'Serverless' : 'Standard'}`);

    try {
        // // Update batch status to running
        // await batch.update({
        //     status: 'running',
        //     started_at: new Date()
        // });

        // Get initial counts
        const counts = await getArchiveCounts(cutoffDate);
        console.log(`Records to archive: ${counts.tasksCount} tasks, ${counts.candidatesCount} candidates`);

        // Ensure stable before starting
        await waitForStableState(DMS_TASK_ARN);

        // Start DMS task - NO MODIFICATIONS NEEDED!
        // DMS is pre-configured to read from v_archive_tasks and v_archive_candidates views
        // The views dynamically filter based on the pending batch's cutoff_date
        console.log('Starting DMS task...');

        if (serverless) {
            try {
                // Try reload-target first (standard for re-running full load tasks)
                const startCommand = new StartReplicationCommand({
                    ReplicationConfigArn: DMS_TASK_ARN,
                    StartReplicationType: 'reload-target'
                });
                await dms.send(startCommand);
            } catch (err) {
                // If reload-target fails (e.g., task never ran), try start-replication
                if (err.name === 'InvalidParameterCombinationException' || err.message.includes('start-replication')) {
                    console.log('reload-target failed, trying start-replication...');
                    const startCommand = new StartReplicationCommand({
                        ReplicationConfigArn: DMS_TASK_ARN,
                        StartReplicationType: 'start-replication'
                    });
                    await dms.send(startCommand);
                } else {
                    throw err;
                }
            }
        } else {
            const startCommand = new StartReplicationTaskCommand({
                ReplicationTaskArn: DMS_TASK_ARN,
                StartReplicationTaskType: 'reload-target'
            });
            await dms.send(startCommand);
        }

        // Wait for DMS to complete
        await waitForDmsCompletion(DMS_TASK_ARN);

        // Cleanup primary DB
        let result = { deletedTasks: 0, deletedCandidates: 0 };
        if (isWebhook) {
            // Verify data before cleanup
            await verifyArchivedData(cutoffDate, counts);

            console.log('Cleaning up primary DB...');
            result = await cleanupPrimaryDB(cutoffDate);
        } else {
            console.log('Skipping cleanup primary DB as it is not triggered by webhook...');
        }

        // Update batch as completed
        await batch.update({
            status: 'completed',
            completed_at: new Date(),
            archived_tasks_count: result.deletedTasks,
            archived_candidates_count: result.deletedCandidates
        });

        console.log(`Migration complete. Archived ${result.deletedTasks} tasks and ${result.deletedCandidates} candidates.`);

        return {
            batchId: batch.id,
            ...result
        };

    } catch (error) {
        console.error('Archive migration failed:', error);

        // Update batch as failed
        await batch.update({
            status: 'failed',
            error_message: error.message
        });

        throw error;
    }
}

// Get default cutoff date (1 month ago)
function getDefaultCutoffDate() {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    return date.toISOString().split('T')[0]; // YYYY-MM-DD
}

module.exports = {
    archiveMigrationJob,
    createArchiveBatch,
    getArchiveCounts,
    getDefaultCutoffDate
};

/**
 * USAGE:
 * 
 * 1. Create a batch (can be done via API or manually):
 *    const batch = await createArchiveBatch('2026-01-01');
 * 
 * 2. Run the migration:
 *    await archiveMigrationJob(); // Uses the pending batch
 *    // OR
 *    await archiveMigrationJob(batchId); // Uses specific batch
 *    // OR
 *    await archiveMigrationJob(null, true); // Triggered by webhook (performs cleanup)
 * 
 * DMS CONFIGURATION (ONE TIME):
 * - Configure DMS to read from v_archive_tasks and v_archive_candidates views
 * - No filters needed in DMS table mappings - views handle the filtering!
 * 
 * FLOW:
 * 1. Create batch → cutoff_date stored in archive_batch table
 * 2. Start DMS → reads from views which auto-filter by cutoff_date
 * 3. Wait for completion
 * 4. Cleanup primary DB
 * 5. Mark batch as completed
 */