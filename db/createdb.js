import dotenv from 'dotenv';
import knex from 'knex';

dotenv.config();

const db = knex({
    client: 'mysql',
    connection: {
        host: process.env.DB_HOST || '127.0.0.1',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASS || '',
    },
});

(async () => {
    try {
        await db.raw('CREATE DATABASE IF NOT EXISTS ??', [process.env.DB_NAME]);
        console.log('Database created');
    } catch (err) {
        console.log('Error creating database: ', err);
    } finally {
        db.destroy();
    }
})();
