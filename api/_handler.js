import serverless from 'serverless-http';
import app from '../app.js';
import { connectDB } from '../config/db.js';
import { applyCorsHeaders, fixVercelRequestPath } from '../utils/cors.js';

const handler = serverless(app);

export default async function vercelHandler(req, res) {
  applyCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  fixVercelRequestPath(req);

  try {
    await connectDB();
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    return res.status(503).json({
      success: false,
      message: 'Database connection failed. Verify MONGO_URI on Vercel and MongoDB Atlas network access (allow 0.0.0.0/0).',
    });
  }

  return handler(req, res);
}
