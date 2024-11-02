import Redis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: 6379,
});

export default redis;
