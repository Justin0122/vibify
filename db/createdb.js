require('dotenv').config();
const db = require('./database.js');

db.raw('CREATE DATABASE IF NOT EXISTS vibify')
    .then(() => console.log('Database created'))
    .catch((err) => console.log('Error creating database: ', err))
    .finally(() => db.destroy());