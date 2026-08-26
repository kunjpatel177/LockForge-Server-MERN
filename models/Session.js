import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    refreshToken: { type: String, required: true },
    deviceInfo: { type: String, default: 'Unknown Device' },
    browser: { type: String, default: 'Unknown Browser' },
    ipAddress: { type: String, default: 'Unknown' },
    isActive: { type: Boolean, default: true },
    lastActive: { type: Date, default: Date.now },
    vaultKeyEncrypted: {
      ciphertext: String,
      iv: String,
      authTag: String,
    },
    vaultUnlockedUntil: Date,
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

sessionSchema.index({ userId: 1, isActive: 1 });
sessionSchema.index({ refreshToken: 1 });

export default mongoose.model('Session', sessionSchema);
