import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../.env') });

const clean = (value) => (value && value.trim() ? value.trim() : '');

export const config = {
  port: Number(process.env.PORT || 5050),
  clientUrl: clean(process.env.CLIENT_URL) || 'http://localhost:5173',
  nodeEnv: process.env.NODE_ENV || 'development',

  jwtSecret: clean(process.env.JWT_SECRET) || 'buywise-dev-secret-change-me',
  jwtExpiresIn: clean(process.env.JWT_EXPIRES_IN) || '7d',

  mongoUri: clean(process.env.MONGO_URI),
  mongoDbName: clean(process.env.MONGO_DB_NAME) || 'buywise',

  ai: {
    provider: clean(process.env.AI_PROVIDER) || 'auto',
    anthropicKey: clean(process.env.ANTHROPIC_API_KEY),
    anthropicModel: clean(process.env.ANTHROPIC_MODEL) || 'claude-sonnet-5',
    geminiKey: clean(process.env.GEMINI_API_KEY),
    geminiModel: clean(process.env.GEMINI_MODEL) || 'gemini-2.0-flash',
    openaiKey: clean(process.env.OPENAI_API_KEY),
    openaiModel: clean(process.env.OPENAI_MODEL) || 'gpt-4o-mini',
  },

  razorpay: {
    keyId: clean(process.env.RAZORPAY_KEY_ID),
    keySecret: clean(process.env.RAZORPAY_KEY_SECRET),
  },
};

export const isRazorpayLive = Boolean(config.razorpay.keyId && config.razorpay.keySecret);
