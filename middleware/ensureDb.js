import { connectDB } from '../config/db.js';

export const ensureDb = async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('Database unavailable:', err.message);
    res.status(503).json({
      success: false,
      message: 'Database connection failed. Check MONGO_URI and MongoDB network access.',
    });
  }
};
