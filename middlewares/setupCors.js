export default function setupCors(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-KEY, X-APPLICATION-ID');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    next();
}
