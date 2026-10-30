import * as path from 'path';

const trimSlash = (s: string) => s.replace(/\/+$/, '');

export const config = {
  port: Number(process.env.PORT) || 4100,
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/flipper',
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  publicUrl: trimSlash(process.env.PUBLIC_URL || 'http://localhost:4100'),
  // backend/uploads regardless of whether we run from src (ts-node) or dist
  uploadsDir: path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads')),
  maxScreenshotBytes: 5 * 1024 * 1024,
  jsonLimit: '2mb',
};
