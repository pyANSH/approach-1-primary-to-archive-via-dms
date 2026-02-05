'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        // 1. Create archive_batch table
        // We use a try-catch block or check existence to be safe, but typically createTable throws if exists.
        // Since we know it's missing, we'll proceed. However, to make this "repair" migration robust:

        const tableExists = await queryInterface.tableExists('archive_batch');
        if (!tableExists) {
            await queryInterface.createTable('archive_batch', {
                id: {
                    type: Sequelize.INTEGER,
                    autoIncrement: true,
                    primaryKey: true,
                },
                cutoff_date: {
                    type: Sequelize.DATEONLY,
                    allowNull: false,
                    comment: 'Archive candidates created on or before this date'
                },
                status: {
                    type: Sequelize.ENUM('pending', 'running', 'completed', 'failed'),
                    defaultValue: 'pending',
                    allowNull: false,
                },
                error_message: {
                    type: Sequelize.TEXT,
                    allowNull: true,
                },
                archived_tasks_count: {
                    type: Sequelize.INTEGER,
                    defaultValue: 0,
                },
                archived_candidates_count: {
                    type: Sequelize.INTEGER,
                    defaultValue: 0,
                },
                created_at: {
                    type: Sequelize.DATE,
                    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
                    allowNull: false,
                },
                started_at: {
                    type: Sequelize.DATE,
                    allowNull: true,
                },
                completed_at: {
                    type: Sequelize.DATE,
                    allowNull: true,
                }
            });
        }

        // 2. Create view for tasks to archive
        // This view dynamically filters tasks based on the pending batch's cutoff_date
        await queryInterface.sequelize.query(`
      CREATE OR REPLACE VIEW v_archive_tasks AS
      SELECT t.* 
      FROM p1_task t
      WHERE t.created_at <= (
        SELECT cutoff_date 
        FROM archive_batch 
        WHERE status IN ('pending', 'running') 
        ORDER BY created_at DESC 
        LIMIT 1
      );
    `);

        // 3. Create view for candidates to archive
        await queryInterface.sequelize.query(`
      CREATE OR REPLACE VIEW v_archive_candidates AS
      SELECT tc.* 
      FROM p1_task_candidate tc
      WHERE tc.created_at <= (
        SELECT cutoff_date 
        FROM archive_batch 
        WHERE status IN ('pending', 'running') 
        ORDER BY created_at DESC 
        LIMIT 1
      );
    `);
    },

    async down(queryInterface, Sequelize) {
        // Drop views first
        await queryInterface.sequelize.query('DROP VIEW IF EXISTS v_archive_candidates;');
        await queryInterface.sequelize.query('DROP VIEW IF EXISTS v_archive_tasks;');

        // Drop table
        await queryInterface.dropTable('archive_batch');

        // Drop ENUM type (PostgreSQL specific)
        await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_archive_batch_status";');
    }
};
