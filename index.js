import 'dotenv/config';
import app from './app.js';
import { connectDB } from './config/db.js';
import { startSecurityAlertScheduler } from './services/securityAlertScheduler.js';

const PORT = process.env.PORT || 5000;

const start = async () => {
  await connectDB();
  startSecurityAlertScheduler();
  app.listen(PORT, () => {
    console.log(`LockForge server running on port ${PORT}`);
  });
};

start().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
