const dotenv = require('dotenv');
dotenv.config();

const knex = require('knex')({
    client: 'mysql',
    connection: {
        host : '127.0.0.1',
        user : process.env.DB_USER,
        password : process.env.DB_PASS,
    }
});

knex.raw('CREATE DATABASE IF NOT EXISTS vibify')
    .then(() => console.log('Database created'))
    .catch((err) => console.log('Error creating database: ', err))
    .finally(() => knex.destroy());