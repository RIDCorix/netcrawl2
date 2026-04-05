/**
 * Authentication routes for NetCrawl2 cloud mode.
 * POST /api/auth/register
 * POST /api/auth/login
 * GET  /api/auth/me
 */

import { Router, Request, Response } from 'express';
import {
  createUser,
  authenticateUser,
  getUserById,
  generateToken,
  sanitizeUser,
  authMiddleware,
  AuthenticatedRequest,
} from './auth.js';

export const authRouter: Router = Router();

// POST /api/auth/register
authRouter.post('/register', (req: Request, res: Response) => {
  const { email, password, displayName } = req.body;

  if (!email || !password || !displayName) {
    res.status(400).json({ error: 'email, password, and displayName are required' });
    return;
  }

  if (typeof email !== 'string' || typeof password !== 'string' || typeof displayName !== 'string') {
    res.status(400).json({ error: 'Invalid field types' });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters' });
    return;
  }

  try {
    const user = createUser(email, password, displayName);
    const token = generateToken(user);
    res.status(201).json({ token, user: sanitizeUser(user) });
  } catch (err: any) {
    if (err.message === 'Email already registered') {
      res.status(409).json({ error: err.message });
    } else {
      console.error('[Auth] Register error:', err);
      res.status(500).json({ error: 'Registration failed' });
    }
  }
});

// POST /api/auth/login
authRouter.post('/login', (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }

  const user = authenticateUser(email, password);
  if (!user) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const token = generateToken(user);
  res.json({ token, user: sanitizeUser(user) });
});

// GET /api/auth/me (requires auth)
authRouter.get('/me', authMiddleware, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const user = getUserById(authReq.user.userId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json({ user: sanitizeUser(user) });
});
