import Redis from 'ioredis';

const redis = new Redis({
    host: '172.17.0.3',
    port: 6379,
});

export default redis;
