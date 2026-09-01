import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { COLLECTIONS, getCollection } from '../db/index.js';
import { ROLES } from '../models/schemas.js';

export const signToken = (user) =>
  jwt.sign({ id: user._id, role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

/** Attaches req.user when a valid token is present. Never rejects. */
export async function attachUser(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next();
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await getCollection(COLLECTIONS.USERS).findOne(
      { _id: payload.id },
      { projection: { passwordHash: 0 } }
    );
    if (user) req.user = user;
  } catch {
    // An expired or malformed token simply means "not signed in".
  }
  return next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please sign in to continue.' });
  return next();
}

export function requireMerchant(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please sign in to continue.' });
  if (req.user.role !== ROLES.MERCHANT) {
    return res.status(403).json({ error: 'This area is for merchant accounts.' });
  }
  return next();
}
