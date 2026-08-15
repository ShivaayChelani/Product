import { Role } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        permission: Role;
        activeMode: Role;
        roles: Role[];
        name: string;
      };
    }
  }
}

export {};
