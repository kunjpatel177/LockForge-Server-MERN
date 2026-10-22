import app from '../app.js';
import { connectDB } from '../config/db.js';
import { applyCorsHeaders, fixVercelRequestPath } from '../utils/cors.js';

export default async function vercelHandler(req, res) {
  // Always apply CORS headers immediately
  applyCorsHeaders(req, res);

  // Return fast 204 for preflight OPTIONS requests
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  // Restore the original request URL if rewritten by Vercel
  fixVercelRequestPath(req);

  // Ensure database is connected
  try {
    await connectDB();
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 503;
    return res.end(
      JSON.stringify({
        success: false,
        message: 'Database connection failed. Verify MONGO_URI on Vercel and MongoDB Atlas network access (allow 0.0.0.0/0).',
      })
    );
  }

  // Forward to Express and await completion
  return new Promise((resolve, reject) => {
    res.on('finish', resolve);
    res.on('close', resolve);
    res.on('error', reject);
    app(req, res);
  });
}
