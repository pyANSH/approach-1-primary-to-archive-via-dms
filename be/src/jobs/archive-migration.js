const {
    DatabaseMigrationServiceClient,
    ModifyReplicationTaskCommand,
    StartReplicationTaskCommand,
    DescribeReplicationTasksCommand,
    ModifyReplicationConfigCommand,
    StartReplicationCommand,
    DescribeReplicationsCommand
} = require('@aws-sdk/client-database-migration-service');
const { primaryDB } = require('../config/database');

const dms = new DatabaseMigrationServiceClient({ region: process.env.AWS_REGION || 'ap-south-1' });

const DMS_TASK_ARN = process.env.DMS_TASK_ARN;

// Helper: Calculate cutoff date (3 months ago)
function getCutoffDate() {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    return date.toISOString().split('T')[0]; // YYYY-MM-DD
}

// Helper: Build table mappings with dynamic date
function buildTableMappings(cutoffDate) {
    return JSON.stringify({
        rules: [
            {
                'rule-type': 'selection',
                'rule-id': '1',
                'rule-name': 'select-old-tasks',
                'object-locator': {
                    'schema-name': 'public',
                    'table-name': 'p1_task'
                },
                'rule-action': 'include',
                filters: [{
                    'filter-type': 'source',
                    'column-name': 'created_at',
                    'filter-conditions': [{
                        'filter-operator': 'ste',
                        value: cutoffDate
                    }]
                }]
            },
            {
                'rule-type': 'selection',
                'rule-id': '2',
                'rule-name': 'select-old-candidates',
                'object-locator': {
                    'schema-name': 'public',
                    'table-name': 'p1_task_candidate'
                },
                'rule-action': 'include',
                filters: [{
                    'filter-type': 'source',
                    'column-name': 'created_at',
                    'filter-conditions': [{
                        'filter-operator': 'ste',
                        value: cutoffDate
                    }]
                }]
            }
        ]
    });
}

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
                : response.ReplicationTasks?.[0]?.ReplicationTaskStats; // or StatusMessage if available

            console.error('DMS failed. Details:', JSON.stringify(serverless ? response.Replications?.[0] : response.ReplicationTasks?.[0], null, 2));
            throw new Error(`DMS failed: ${failureInfo || status}`);
        }

        // Wait 10 seconds before checking again
        await new Promise(resolve => setTimeout(resolve, 10000));
    }
}

// Helper: Cleanup primary DB
async function cleanupPrimaryDB(cutoffDate) {
    const transaction = await primaryDB.transaction();

    try {
        const [candidatesResult] = await primaryDB.query(
            `DELETE FROM "p1_task_candidate" WHERE "task_id" IN (SELECT "id" FROM "p1_task" WHERE "created_at" < :cutoffDate)`,
            {
                replacements: { cutoffDate },
                transaction
            }
        );

        const [tasksResult] = await primaryDB.query(
            `DELETE FROM "p1_task" WHERE "created_at" < :cutoffDate`,
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

        // Stable states where we can proceed with modification or starting
        // 'stopped', 'created', 'failed' (might need reset but we can try), 'ready'
        // 'running' is stable but we might not want to modify active one without care, but for now we assume we can or we wait.
        // Actually, for Serverless, you can't modify if it's deprovisioning.
        if (['stopped', 'created', 'failed', 'ready'].includes(status)) {
            console.log('DMS is in a stable state.');
            return;
        }

        console.log('Waiting for stable state...');
        await new Promise(resolve => setTimeout(resolve, 10000));
    }
}

// Main job processor
async function archiveMigrationJob() {
    const cutoffDate = getCutoffDate();
    console.log(`Starting archive migration for records before ${cutoffDate}`);

    if (!DMS_TASK_ARN) {
        throw new Error('DMS_TASK_ARN environment variable is not set');
    }

    const serverless = isServerless(DMS_TASK_ARN);
    console.log(`Detected DMS mode: ${serverless ? 'Serverless' : 'Standard'}`);

    try {
        // Ensure stable before modifying
        await waitForStableState(DMS_TASK_ARN);

        // Step 1: Update DMS task with dynamic date
        console.log('Updating DMS table mappings...');

        if (serverless) {
            try {
                const modifyCommand = new ModifyReplicationConfigCommand({
                    ReplicationConfigArn: DMS_TASK_ARN,
                    TableMappings: buildTableMappings(cutoffDate)
                });
                await dms.send(modifyCommand);
            } catch (err) {
                if (err.name === 'InvalidParameterCombinationException' && err.message.includes('No modifications requested')) {
                    console.log('Table mappings are already up to date.');
                } else {
                    throw err;
                }
            }
        } else {
            const modifyCommand = new ModifyReplicationTaskCommand({
                ReplicationTaskArn: DMS_TASK_ARN,
                TableMappings: buildTableMappings(cutoffDate)
            });
            await dms.send(modifyCommand);
        }

        // Wait for task to be ready
        // await new Promise(resolve => setTimeout(resolve, 5000)); // Replaced by robust wait

        // Ensure stable before starting (modification might have triggered a state change)
        await waitForStableState(DMS_TASK_ARN);

        // Step 2: Start DMS task
        console.log('Starting DMS task...');

        if (serverless) {
            const startCommand = new StartReplicationCommand({
                ReplicationConfigArn: DMS_TASK_ARN,
                StartReplicationType: 'start-replication'
            });
            await dms.send(startCommand);
        } else {
            const startCommand = new StartReplicationTaskCommand({
                ReplicationTaskArn: DMS_TASK_ARN,
                StartReplicationTaskType: 'reload-target'
            });
            await dms.send(startCommand);
        }

        // Step 3: Wait for DMS to complete
        await waitForDmsCompletion(DMS_TASK_ARN);

        // Step 4: Cleanup primary DB
        console.log('Cleaning up primary DB...');
        const result = await cleanupPrimaryDB(cutoffDate);

        console.log(`Migration complete.`);

        return result;

    } catch (error) {
        console.error('Archive migration failed:', error);
        throw error;
    }
}

module.exports = { archiveMigrationJob };
