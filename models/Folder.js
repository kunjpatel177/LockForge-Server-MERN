import mongoose from 'mongoose';

const folderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    isDefault: { type: Boolean, default: false },
    isHidden: { type: Boolean, default: false },
    hiddenAt: Date,
    isDeleted: { type: Boolean, default: false },
    deletedAt: Date,
  },
  { timestamps: true }
);

folderSchema.index({ userId: 1, name: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });
folderSchema.index({ userId: 1, isDeleted: 1, isHidden: 1 });
folderSchema.index({ userId: 1, isHidden: 1 });
folderSchema.index({ userId: 1, isDeleted: 1 });

export default mongoose.model('Folder', folderSchema);
