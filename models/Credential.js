import mongoose from 'mongoose';

const encryptedFieldSchema = new mongoose.Schema(
  {
    ciphertext: { type: String, required: true },
    iv: { type: String, required: true },
    authTag: { type: String, required: true },
  },
  { _id: false }
);

const credentialSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    serviceName: { type: String, required: true, trim: true },
    encryptedData: { type: encryptedFieldSchema, required: true },
    folderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', default: null },
    isFavorite: { type: Boolean, default: false },
    tags: [{ type: String, trim: true }],
    isDeleted: { type: Boolean, default: false },
    deletedAt: Date,
  },
  { timestamps: true }
);

credentialSchema.index({ userId: 1, isDeleted: 1 });
credentialSchema.index({ userId: 1, folderId: 1 });
credentialSchema.index({ userId: 1, isFavorite: 1 });
credentialSchema.index({ serviceName: 'text' });

export default mongoose.model('Credential', credentialSchema);
