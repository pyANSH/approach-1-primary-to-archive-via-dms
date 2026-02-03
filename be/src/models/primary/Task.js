const { DataTypes } = require('sequelize');
const { primaryDB } = require('../../config/database');

const Task = primaryDB.define('Task', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  is_archived: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false,
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
  tableName: 'p1_task',
  timestamps: false // Manual timestamps as per request
});

module.exports = Task;
