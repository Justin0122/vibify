import redis from '../redisClient.js';

const cache = async (req, res, next) => {
    const cachedData = await redis.get(req.originalUrl);
    if (cachedData) {
        console.log('Cache hit!');
        return res.status(200).json(JSON.parse(cachedData));
    } else console.log('Cache miss!');
    const originalJson = res.json.bind(res);
    res.json = async (body) => {
        await redis.setex(req.originalUrl, 3600, JSON.stringify(body));
        originalJson(body);
    };

    next();
};

export default cache;