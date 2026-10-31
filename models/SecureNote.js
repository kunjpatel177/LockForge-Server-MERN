import mongoose from 'mongoose';

const encryptedFieldSchema = new mongoose.Schema(
  {
    ciphertext: { type: String, required: true },
    iv: { type: String, required: true },
    authTag: { type: String, required: true },
  },
  { _id: false }
);

const secureNoteSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    encryptedData: { type: encryptedFieldSchema, required: true },
    folderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', default: null },
    isFavorite: { type: Boolean, default: false },
    isHidden: { type: Boolean, default: false },
    hiddenAt: Date,
    isDeleted: { type: Boolean, default: false },
    deletedAt: Date,
  },
  { timestamps: true }
);

secureNoteSchema.index({ userId: 1, isDeleted: 1, isHidden: 1 });
secureNoteSchema.index({ userId: 1, isFavorite: 1, isDeleted: 1, isHidden: 1 });
secureNoteSchema.index({ userId: 1, folderId: 1, isDeleted: 1, isHidden: 1 });
secureNoteSchema.index({ userId: 1, isHidden: 1 });
secureNoteSchema.index({ userId: 1, isDeleted: 1 });

export default mongoose.model('SecureNote', secureNoteSchema);
