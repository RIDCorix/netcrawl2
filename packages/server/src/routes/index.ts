/**
 * Router assembly — mounts all sub-routers with auth middleware.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { setCurrentUser } from '../store.js';
import { authMiddleware, AuthenticatedRequest } from '../auth.js';
import { authRouter } from '../authRoutes.js';
import { handleWorkerAction } from '../actions/index.js';

import { stateRoutes } from './stateRoutes.js';
import { inventoryRoutes } from './inventoryRoutes.js';
import { deployRoutes } from './deployRoutes.js';
import { workerRoutes } from './workerRoutes.js';
import { nodeRoutes } from './nodeRoutes.js';
import { chipPackRoutes } from './chipPackRoutes.js';
import { questRoutes } from './questRoutes.js';
import { layerRoutes } from './layerRoutes.js';
import { devRoutes } from './devRoutes.js';
import { getUserId } from './helpers.js';

export const router: Router = Router();

// Auth routes (always public)
router.use('/auth', authRouter);

// Multi-user auth middleware
if (process.env.NETCRAWL_MULTI_USER === 'true') {
  router.use((req: Request, res: Response, next: NextFunction) => {
    authMiddleware(req as AuthenticatedRequest, res, () => {
      const authReq = req as AuthenticatedRequest;
      if (authReq.user) {
        setCurrentUser(authReq.user.userId);
        (req as any)._userId = authReq.user.userId;
      }
      next();
    });
  });
}

// Mount sub-routers
router.use('/', stateRoutes);
router.use('/', inventoryRoutes);
router.use('/', deployRoutes);
router.use('/', workerRoutes);
router.use('/', nodeRoutes);
router.use('/', chipPackRoutes);
router.use('/', questRoutes);
router.use('/', layerRoutes);
router.use('/', devRoutes);

// Worker action dispatcher (POST /api/worker/action)
router.post('/worker/action', async (req: Request, res: Response) => {
  const uid = getUserId(req);
  const { workerId, action, payload } = req.body;
  if (!workerId || !action) {
    return res.status(400).json({ error: 'workerId and action required' });
  }
  const result = await handleWorkerAction(workerId, action, payload || {}, uid);
  res.json(result);
});
