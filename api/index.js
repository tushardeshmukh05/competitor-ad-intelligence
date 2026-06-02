// Vercel serverless entrypoint.
// Vercel routes every request (see vercel.json) to this function, which simply
// hands off to the existing Express app. The app serves both the JSON API and
// the static frontend (frontend/index.html).
module.exports = require('../backend/server.js');
