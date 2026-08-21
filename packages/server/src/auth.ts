/**
 * JWT-based authentication module for NetCrawl2 cloud mode.
 * Uses crypto.scryptSync for password hashing (no native deps).
 * Users stored in data/users.json.
 */

import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

const JWT_SECRET = process.env.JWT_SECRET || 'netcrawl-dev-secret-do-not-use-in-production';
const TOKEN_EXPIRY = '7d';
const CODE_SERVER_TOKEN_EXPIRY = '90d';
const EDITOR_TOKEN_EXPIRY = '90d';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  createdAt: string;
}

interface UserStore {
  users: User[];
}

let _dataDir = process.env.NETCRAWL_DATA_DIR || process.cwd();
let USERS_PATH = path.join(_dataDir, 'data', 'users.json');

let userStore: UserStore = { users: [] };

export function setAuthDataDir(dir: string) {
  _dataDir = dir;
  USERS_PATH = path.join(_dataDir, 'data', 'users.json');
}

// ── Password hashing with scrypt ────────────────────────────────────────────

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return hash === derived;
}

// ── User store persistence ──────────────────────────────────────────────────

function persistUsers() {
  try {
    fs.writeFileSync(USERS_PATH, JSON.stringify(userStore, null, 2));
  } catch (err) {
    console.error('[Auth] Failed to persist users:', err);
  }
}

export function initUserStore(): void {
  const dataDir = path.dirname(USERS_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (fs.existsSync(USERS_PATH)) {
    try {
      userStore = JSON.parse(fs.readFileSync(USERS_PATH, 'utf-8'));
      if (!userStore.users) userStore.users = [];
    } catch {
      userStore = { users: [] };
    }
  } else {
    userStore = { users: [] };
    persistUsers();
  }
  console.log(`[Auth] User store initialized (${userStore.users.length} users)`);
}

// ── User CRUD ───────────────────────────────────────────────────────────────

export function createUser(email: string, password: string, displayName: string): User {
  // Check for duplicate email
  const existing = userStore.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    throw new Error('Email already registered');
  }

  const user: User = {
    id: crypto.randomUUID(),
    email: email.toLowerCase(),
    passwordHash: hashPassword(password),
    displayName,
    createdAt: new Date().toISOString(),
  };

  userStore.users.push(user);
  persistUsers();
  return user;
}

export function authenticateUser(email: string, password: string): User | null {
  const user = userStore.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;
  return user;
}

export function getUserById(id: string): User | null {
  return userStore.users.find(u => u.id === id) || null;
}

// ── JWT ─────────────────────────────────────────────────────────────────────

export function generateToken(user: User): string {
  return jwt.sign({ userId: user.id, email: user.email, purpose: 'browser' }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

/** Issue a credential for the external Code Server, separate from browser login. */
export function generateCodeServerToken(user: User): { token: string; expiresAt: string } {
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  const token = jwt.sign({ userId: user.id, email: user.email, purpose: 'code-server' }, JWT_SECRET, {
    expiresIn: CODE_SERVER_TOKEN_EXPIRY,
  });
  return { token, expiresAt: expiresAt.toISOString() };
}

/** Issue a credential that can only access the editor bridge. */
export function generateEditorToken(identity: { id: string; email: string }): { token: string; expiresAt: string } {
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  const token = jwt.sign({ userId: identity.id, email: identity.email, purpose: 'editor' }, JWT_SECRET, {
    expiresIn: EDITOR_TOKEN_EXPIRY,
  });
  return { token, expiresAt: expiresAt.toISOString() };
}

export type TokenPurpose = 'browser' | 'code-server' | 'editor';

export function verifyToken(
  token: string,
  allowedPurposes: readonly TokenPurpose[] = ['browser'],
): { userId: string; email: string; purpose: TokenPurpose } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; email: string; purpose?: string };
    // Tokens issued before purpose was introduced are browser sessions. This
    // keeps existing sessions valid while preventing code-server credentials
    // from crossing into browser-only routes.
    const purpose: TokenPurpose = decoded.purpose === undefined ? 'browser' : (decoded.purpose as TokenPurpose);
    if (!allowedPurposes.includes(purpose)) return null;
    return { userId: decoded.userId, email: decoded.email, purpose };
  } catch {
    return null;
  }
}

// ── Express middleware ───────────────────────────────────────────────────────

export interface AuthenticatedRequest extends Request {
  user?: { userId: string; email: string; purpose: TokenPurpose };
}

export function authMiddlewareForPurposes(allowedPurposes: readonly TokenPurpose[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }

    const token = authHeader.slice(7);
    const payload = verifyToken(token, allowedPurposes);
    if (!payload) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    req.user = payload;
    next();
  };
}

/** Browser sessions are the default authorization boundary. */
export const authMiddleware = authMiddlewareForPurposes(['browser']);

/** Runtime endpoints accept both dedicated credentials and legacy browser sessions. */
export const runtimeAuthMiddleware = authMiddlewareForPurposes(['browser', 'code-server']);

/** Editor bridge endpoints accept only the credential stored in VS Code SecretStorage. */
export const editorAuthMiddleware = authMiddlewareForPurposes(['editor']);

/** Strip sensitive fields before sending user to client */
export function sanitizeUser(user: User): Omit<User, 'passwordHash'> {
  const { passwordHash, ...safe } = user;
  return safe;
}
