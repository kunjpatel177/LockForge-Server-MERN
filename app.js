import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import vaultRoutes from './routes/vaultRoutes.js';
import folderRoutes from './routes/folderRoutes.js';
import noteRoutes from './routes/noteRoutes.js';
import sessionRoutes from './routes/sessionRoutes.js';
import activityRoutes from './routes/activityRoutes.js';
import securityRoutes from './routes/securityRoutes.js';
import backupRoutes from './routes/backupRoutes.js';
import hiddenRoutes from './routes/hiddenRoutes.js';
import publicRoutes from './routes/publicRoutes.js';
import { ensureDb } from './middleware/ensureDb.js';
import { connectDB } from './config/db.js';
import { isAllowedOrigin } from './utils/cors.js';

const app = express();

app.set('trust proxy', 1);

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Cache-Control',
  ],
  credentials: true,
  maxAge: 86400,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  message: { success: false, message: 'Too many requests' },
  skip: (req) => req.method === 'OPTIONS',
  validate: { xForwardedForHeader: false },
});
app.use(globalLimiter);

app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'LockForge API is running',
  });
});

app.get('/api/health', async (req, res) => {
  try {
    await connectDB();
    res.json({
      success: true,
      message: 'LockForge API is running',
      database: 'connected',
    });
  } catch (err) {
    res.status(503).json({
      success: false,
      message: 'Database connection failed',
      error: err.message,
    });
  }
});

app.get('/api', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'LockForge API is running. Use /api/v1 routes.',
  });
});

// Ensure MongoDB is connected before any API route runs
app.use('/api/v1', ensureDb);

app.use('/api/v1/public', publicRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/vault', vaultRoutes);
app.use('/api/v1/folders', folderRoutes);
app.use('/api/v1/notes', noteRoutes);
app.use('/api/v1/sessions', sessionRoutes);
app.use('/api/v1/activity', activityRoutes);
app.use('/api/v1/security', securityRoutes);
app.use('/api/v1/backup', backupRoutes);
app.use('/api/v1/hidden', hiddenRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
