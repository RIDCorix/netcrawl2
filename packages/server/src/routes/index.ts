/**
 * Router assembly — mounts all sub-routers with auth middleware.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { setCurrentUser } from '../store.js';
import { authMiddleware, runtimeAuthMiddleware, AuthenticatedRequest } from '../auth.js';
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
import { runtimeRoutes } from './runtimeRoutes.js';
import { getUserId } from './helpers.js';

export const router: Router = Router();

// Auth routes (always public)
router.use('/auth', authRouter);

// Multi-user auth middleware
if (process.env.NETCRAWL_MULTI_USER === 'true') {
  router.use((req: Request, res: Response, next: NextFunction) => {
    const runtimeCredentialPaths = [
      '/runtime/',
      '/worker/action',
      '/worker/reset',
      '/worker-classes/register',
      '/deploy-queue',
      '/deploy-ack',
      '/code-server/disconnect',
    ];
    const acceptsRuntimeCredential = runtimeCredentialPaths.some(path =>
      path.endsWith('/') ? req.path.startsWith(path) : req.path === path,
    );
    const middleware = acceptsRuntimeCredential ? runtimeAuthMiddleware : authMiddleware;
    middleware(req as AuthenticatedRequest, res, () => {
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
router.use('/', runtimeRoutes);

// Worker action dispatcher (POST /api/worker/action)
router.post('/worker/action', async (req: Request, res: Response) => {
  const uid = getUserId(req);
  const { workerId, action, payload, generation, executionToken, actionId } = req.body;
  if (!workerId || !action) {
    return res.status(400).json({ error: 'workerId and action required' });
  }
  const requiresExecutionFence = (req as AuthenticatedRequest).user?.purpose === 'code-server';
  if (requiresExecutionFence && (generation === undefined || generation === null || !executionToken)) {
    return res.json({ ok: false, reason: 'stale_execution', error: 'Worker execution is no longer current' });
  }
  const result = await handleWorkerAction(workerId, action, payload || {}, uid, {
    generation,
    executionToken,
    actionId,
  });
  res.json(result);
});
