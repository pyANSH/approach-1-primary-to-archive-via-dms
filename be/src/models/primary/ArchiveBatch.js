const { DataTypes } = require('sequelize');
const { primaryDB } = require('../../config/database');

const ArchiveBatch = primaryDB.define('ArchiveBatch', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    cutoff_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        comment: 'Archive candidates created on or before this date'
    },
    status: {
        type: DataTypes.ENUM('pending', 'running', 'completed', 'failed'),
        defaultValue: 'pending',
        allowNull: false,
    },
    error_message: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    archived_tasks_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
    archived_candidates_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
    created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        allowNull: false,
    },
    started_at: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    completed_at: {
        type: DataTypes.DATE,
        allowNull: true,
    }
}, {
    tableName: 'archive_batch',
    timestamps: false
});

module.exports = ArchiveBatch;
