import mongoose from 'mongoose';

const activityLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    action: {
      type: String,
      required: true,
      enum: [
        'login',
        'logout',
        'failed_login',
        'credential_created',
        'credential_updated',
        'credential_deleted',
        'credential_restored',
        'credential_permanently_deleted',
        'export',
        'backup',
        'restore',
        'password_changed',
        'master_password_changed',
        'session_revoked',
        'note_created',
        'note_updated',
        'note_deleted',
        'folder_created',
        'folder_updated',
        'folder_deleted',
        'trash_emptied',
        'settings_updated',
        'email_changed',
      ],
    },
    description: { type: String, default: '' },
    ipAddress: { type: String, default: 'Unknown' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

activityLogSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('ActivityLog', activityLogSchema);
