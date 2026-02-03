require('dotenv').config();

module.exports = {
  development: {
    username: process.env.PRIMARY_DB_USER || 'postgres',
    password: process.env.PRIMARY_DB_PASSWORD || 'postgres',
    database: process.env.PRIMARY_DB_NAME || 'postgres',
    host: process.env.PRIMARY_DB_HOST || 'localhost',
    port: process.env.PRIMARY_DB_PORT || 5432,
    dialect: 'postgres',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    }
  },
  test: {
    username: process.env.PRIMARY_DB_USER || 'postgres',
    password: process.env.PRIMARY_DB_PASSWORD || 'postgres',
    database: process.env.PRIMARY_DB_NAME || 'postgres',
    host: process.env.PRIMARY_DB_HOST || 'localhost',
    port: process.env.PRIMARY_DB_PORT || 5432,
    dialect: 'postgres',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    }
  },
  production: {
    username: process.env.PRIMARY_DB_USER,
    password: process.env.PRIMARY_DB_PASSWORD,
    database: process.env.PRIMARY_DB_NAME,
    host: process.env.PRIMARY_DB_HOST,
    port: process.env.PRIMARY_DB_PORT,
    dialect: 'postgres',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    }
  }
};
