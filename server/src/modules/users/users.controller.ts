import { Request, Response } from 'express';
import { usersService } from './users.service';
import { catchAsync } from '../../shared/utils/catchAsync';
import { sendSuccess } from '../../shared/utils/response';
import type { ListUsersInput, UpdateRoleInput } from './users.validation';

export const usersController = {
  list: catchAsync(async (req: Request, res: Response) => {
    const result = await usersService.list(req.query as unknown as ListUsersInput);
    sendSuccess(res, result.data, { pagination: result.pagination });
  }),

  getById: catchAsync(async (req: Request, res: Response) => {
    const user = await usersService.getById(req.params.id as string);
    sendSuccess(res, user);
  }),

  updateRole: catchAsync(async (req: any, res: Response) => {
    const user = await usersService.updateRole(
      req.params.id as string,
      req.body as UpdateRoleInput,
      req.user.id,
    );
    sendSuccess(res, user, { message: 'User permission updated' });
  }),

  deleteUser: catchAsync(async (req: any, res: Response) => {
    const result = await usersService.delete(req.params.id as string, req.user.id);
    sendSuccess(res, result);
  }),
};
