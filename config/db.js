import mongoose from 'mongoose';

mongoose.set('bufferCommands', false);
mongoose.set('strictQuery', true);

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

const isConnected = () => mongoose.connection.readyState === 1;

export const connectDB = async () => {
  if (isConnected()) {
    return mongoose.connection;
  }

  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI is not defined in environment variables');
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(uri, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      minPoolSize: 1,
    }).then(() => {
      console.log('MongoDB connected');
      return mongoose.connection;
    }).catch((err) => {
      cached.promise = null;
      cached.conn = null;
      console.error('MongoDB connection error:', err.message);
      throw err;
    });
  }

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (err) {
    cached.promise = null;
    cached.conn = null;
    throw err;
  }
};

export const disconnectDB = async () => {
  if (!isConnected()) return;
  await mongoose.disconnect();
  cached.conn = null;
  cached.promise = null;
};
