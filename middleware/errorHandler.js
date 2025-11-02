// /middleware/errorHandler.js (CommonJS)
function errorHandler(err, req, res, next) {
  console.error(err && err.stack ? err.stack : err);
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
}

module.exports = errorHandler;
