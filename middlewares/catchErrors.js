module.exports = function catchErrors(fn) {
    return function (req, res, next) {
        return fn(req, res, next).catch((err) => {
            console.error(err);
            next(err);
        });
    }
}