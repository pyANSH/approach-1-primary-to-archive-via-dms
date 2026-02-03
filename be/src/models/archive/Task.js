const { DataTypes } = require('sequelize');
const { archiveDB } = require('../../config/database');

const Task = archiveDB.define('Task', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  is_archived: {
    type: DataTypes.BOOLEAN,
    defaultValue: true, // It's in the archive, so usually true
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
  timestamps: false
});

module.exports = Task;
