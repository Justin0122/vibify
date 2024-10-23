import redis from '../redisClient.js';

const cache = async (req, res, next) => {
    const cachedData = await redis.get(req.originalUrl);
    if (cachedData) {
        console.log('Cache hit!');
        return res.status(200).json(JSON.parse(cachedData));
    }
    next();
};

export default cache;