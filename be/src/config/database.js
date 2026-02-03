const { Sequelize } = require('sequelize');
const primaryConfigRef = require('./sequelize-primary');
const archiveConfigRef = require('./sequelize-archive');

const env = process.env.NODE_ENV || 'development';
const primaryConfig = primaryConfigRef[env];
const archiveConfig = archiveConfigRef[env];

// Configuration for Primary Database
const primaryDB = new Sequelize(
  primaryConfig.database,
  primaryConfig.username,
  primaryConfig.password,
  {
    ...primaryConfig,
    logging: false,
  }
);

// Configuration for Archive Database
const archiveDB = new Sequelize(
  archiveConfig.database,
  archiveConfig.username,
  archiveConfig.password,
  {
    ...archiveConfig,
    logging: false,
  }
);

module.exports = {
  primaryDB,
  archiveDB,
};
