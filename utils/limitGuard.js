import { AppError } from '../middleware/errorHandler.js';

export const assertUnderLimit = (currentCount, max, resourceLabel) => {
  if (currentCount >= max) {
    throw new AppError(`Maximum ${max} ${resourceLabel} allowed per account`, 400);
  }
};

export const assertBatchSize = (size, max, resourceLabel) => {
  if (size > max) {
    throw new AppError(`Cannot process more than ${max} ${resourceLabel} at once`, 400);
  }
};
