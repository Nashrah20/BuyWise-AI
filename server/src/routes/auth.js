import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { COLLECTIONS, getCollection } from '../db/index.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { asyncRoute } from '../middleware/errors.js';
import { ROLES, createUser } from '../models/schemas.js';

const router = Router();

const publicUser = (user) => {
  const { passwordHash, ...rest } = user;
  return rest;
};

router.post(
  '/signup',
  asyncRoute(async (req, res) => {
    const { name, email, password, role, storeName } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are all required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Please use a password of at least 6 characters.' });
    }

    const users = getCollection(COLLECTIONS.USERS);
    if (await users.findOne({ email: email.toLowerCase() })) {
      return res.status(409).json({ error: 'An account already exists with that email.' });
    }

    const user = createUser({
      name,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      role: role === ROLES.MERCHANT ? ROLES.MERCHANT : ROLES.CUSTOMER,
      storeName,
    });
    await users.insertOne(user);

    return res.status(201).json({ token: signToken(user), user: publicUser(user) });
  })
);

router.post(
  '/login',
  asyncRoute(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

    const user = await getCollection(COLLECTIONS.USERS).findOne({ email: String(email).toLowerCase() });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'That email and password do not match.' });
    }
    return res.json({ token: signToken(user), user: publicUser(user) });
  })
);

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

/** Preferences double as the agent's long-term memory of this shopper. */
router.put(
  '/preferences',
  requireAuth,
  asyncRoute(async (req, res) => {
    const { budgetRange, favouriteCategories, priorities, notes } = req.body;
    const preferences = {
      budgetRange: budgetRange ?? req.user.preferences?.budgetRange ?? null,
      favouriteCategories: favouriteCategories ?? req.user.preferences?.favouriteCategories ?? [],
      priorities: priorities ?? req.user.preferences?.priorities ?? {},
      notes: notes ?? req.user.preferences?.notes ?? [],
    };
    await getCollection(COLLECTIONS.USERS).updateOne({ _id: req.user._id }, { $set: { preferences } });
    res.json({ preferences });
  })
);

export default router;
