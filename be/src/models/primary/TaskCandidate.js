const { DataTypes } = require('sequelize');
const { primaryDB } = require('../../config/database');
const Task = require('./Task');

const TaskCandidate = primaryDB.define('TaskCandidate', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  task_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'p1_task',
      key: 'id',
    },
  },
  name: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false,
  }
}, {
  tableName: 'p1_task_candidate',
  timestamps: false // Manual timestamps as per request
});

// Associations
Task.hasMany(TaskCandidate, { foreignKey: 'task_id' });
TaskCandidate.belongsTo(Task, { foreignKey: 'task_id' });

module.exports = TaskCandidate;
