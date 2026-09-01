import crypto from 'crypto';

/**
 * BuyWise stores _id as a plain 24-character hex string in both engines.
 * Keeping ids as strings means the same document round-trips identically
 * whether it came from MongoDB or from the built-in store, and the frontend
 * never has to think about ObjectId serialisation.
 */
export const newId = () => crypto.randomBytes(12).toString('hex');

export const slugify = (text) =>
  String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
