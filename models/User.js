import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    masterSalt: { type: String, required: true },
    masterVerifier: { type: String, required: true },
    emailVerified: { type: Boolean, default: false },
    verificationToken: String,
    verificationTokenExpiry: Date,
    resetPasswordToken: String,
    resetPasswordExpiry: Date,
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: String,
    settings: {
      theme: { type: String, enum: ['light', 'dark'], default: 'light' },
      autoLockMinutes: { type: Number, default: 15 },
      defaultPasswordLength: { type: Number, default: 16 },
    },
    vaultUnlockedUntil: Date,
  },
  { timestamps: true }
);

export default mongoose.model('User', userSchema);
