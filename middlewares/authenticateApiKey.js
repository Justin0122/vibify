const db = require('../db/database')

module.exports = async function authenticateApiKey(req, res, next) {
    if (process.env.DEV_MODE === 'true') {
        console.log(req.originalUrl);
        next();
        return;
    }
    const apiKey = req.headers['x-api-key'];
    const application_id = req.headers['x-application-id'];
    if (application_id) {
        if (application_id === process.env.APPLICATION_ID) {
            next();
        } else {
            res.status(403).json({error: 'Unauthorized'});
        }
        return;
    }

    const userId = req.params.id || req.body.id;
    const user = await db('users').where('user_id', userId).first();
    if (user.api_token === apiKey) {
        next();
    } else {
        res.status(403).json({error: 'Unauthorized'});
    }
}