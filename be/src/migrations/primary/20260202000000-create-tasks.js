'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create p1_task
    await queryInterface.createTable('p1_task', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      is_archived: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false
      },
      name: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Create p1_task_candidate
    await queryInterface.createTable('p1_task_candidate', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      task_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'p1_task',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      name: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('p1_task_candidate');
    await queryInterface.dropTable('p1_task');
  }
};
