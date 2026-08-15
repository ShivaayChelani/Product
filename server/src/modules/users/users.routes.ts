import { Router } from 'express';
import { usersController } from './users.controller';
import { authenticate, requireAdmin } from '../../middleware/auth';
import { requirePlatformOps } from '../../middleware/adminCapabilities';
import { validate } from '../../middleware/validate';
import { listUsersSchema, updateRoleSchema } from './users.validation';

const router = Router();

/** Users list/detail: any admin dashboard role (incl. SUPPORT_AGENT). */
router.use(authenticate, requireAdmin);

/** Mutating user accounts / roles: elevated ops only — not support/analytics. */
const requireUserMutator = requirePlatformOps;

router.get('/', validate(listUsersSchema, 'query'), usersController.list);
router.get('/:id', usersController.getById);
router.patch('/:id/role', requireUserMutator, validate(updateRoleSchema), usersController.updateRole);
router.delete('/:id', requireUserMutator, usersController.deleteUser);

export default router;
