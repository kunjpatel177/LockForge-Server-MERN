import mongoose from 'mongoose';

const folderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

folderSchema.index({ userId: 1, name: 1 }, { unique: true });

export default mongoose.model('Folder', folderSchema);
