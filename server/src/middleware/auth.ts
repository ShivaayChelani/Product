import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { env } from '../config/env';
import { ApiError, ErrorCodes } from '../shared/utils/ApiError';
import { revalidateRequestUser, revalidateVendorCapability } from '../shared/services/authRevalidation';

interface JwtPayload {
  userId: string;
  email: string;
  permission?: string;
  activeMode?: string;
  role?: string;
  roles?: string[];
  activeRole?: string;
  name: string;
}

export const ADMIN_ROLES = [
  Role.ADMIN,
  Role.SUPER_ADMIN,
  Role.OPS_ADMIN,
  Role.VENDOR_MANAGER,
  Role.CONTENT_MODERATOR,
  Role.FINANCE_MANAGER,
  Role.SUPPORT_AGENT,
  Role.MARKETING_ADMIN,
  Role.ANALYTICS_VIEWER,
];

function toRequestUser(decoded: JwtPayload) {
  const legacyRoles = (decoded.roles ?? (decoded.role ? [decoded.role] : []))
    .map((r) => String(r).toUpperCase()) as Role[];

  const roles: Role[] = legacyRoles.length > 0
    ? Array.from(new Set(legacyRoles))
    : (() => {
        const permission = (decoded.permission as Role) || Role.USER;
        if (ADMIN_ROLES.some((r) => r === permission)) return [permission];
        if (permission === Role.USER) return [Role.USER];
        return [Role.USER, permission];
      })();

  // Ensure USER is always present for non-admin (admins may be admin-only)
  const isAdminCapability = ADMIN_ROLES.some((r) => roles.includes(r));
  if (!isAdminCapability && !roles.includes(Role.USER)) {
    roles.unshift(Role.USER);
  }

  const permission = (decoded.permission as Role)
    ?? (ADMIN_ROLES.find((r) => roles.includes(r))
      ?? (roles.includes(Role.VENDOR) && roles.includes(Role.CONTENT_CREATOR)
        ? Role.VENDOR
        : roles.includes(Role.VENDOR)
          ? Role.VENDOR
          : roles.includes(Role.CONTENT_CREATOR)
            ? Role.CONTENT_CREATOR
            : Role.USER));

  const requestedMode = (decoded.activeMode ?? decoded.activeRole ?? decoded.role ?? Role.USER) as Role;
  const activeMode = roles.includes(requestedMode) ? requestedMode : Role.USER;

  return {
    id: decoded.userId,
    email: decoded.email,
    name: decoded.name,
    permission: permission as Role,
    activeMode: activeMode as Role,
    roles,
  };
}

/** True if JWT/user carries an approved capability (not merely activeMode). */
export function hasRole(user: Express.Request['user'] | undefined, role: Role): boolean {
  if (!user) return false;
  if (Array.isArray(user.roles) && user.roles.includes(role)) return true;
  // Legacy fallback during dual-write
  return user.permission === role;
}

/** @deprecated Prefer hasRole — kept for gradual migration */
export function hasPermission(user: Express.Request['user'] | undefined, role: Role): boolean {
  return hasRole(user, role);
}

export const authenticate = (req: any, _res: Response, next: NextFunction) => {
  let token: string | undefined;

  if (req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies?.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return next(new ApiError(401, 'Authentication required. Please provide a valid token.'));
  }

  try {
    const decoded = jwt.verify(token, env.jwt.secret, { algorithms: ['HS256'] }) as JwtPayload & { purpose?: string };
    if (decoded.purpose === 'admob_ssv') {
      return next(new ApiError(401, 'Invalid or expired token.'));
    }
    req.user = toRequestUser(decoded);
    next();
  } catch {
    return next(new ApiError(401, 'Invalid or expired token.'));
  }
};

export const optionalAuth = (req: any, _res: Response, next: NextFunction) => {
  let token: string | undefined;

  if (req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies?.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, env.jwt.secret, { algorithms: ['HS256'] }) as JwtPayload & { purpose?: string };
    if (decoded.purpose !== 'admob_ssv') {
      req.user = toRequestUser(decoded);
    }
  } catch {
    // Silently continue without user
  }
  next();
};

export const requireAdmin = (req: any, _res: Response, next: NextFunction) => {
  if (!req.user?.id) {
    return next(new ApiError(403, 'Admin access required.', true, ErrorCodes.ROLE_REQUIRED, { requiredRole: Role.ADMIN }));
  }
  revalidateRequestUser(req)
    .then(() => {
      const isAnyAdmin = ADMIN_ROLES.some((role) => hasRole(req.user, role));
      if (!isAnyAdmin) {
        return next(new ApiError(403, 'Admin access required.', true, ErrorCodes.ROLE_REQUIRED, { requiredRole: Role.ADMIN }));
      }
      next();
    })
    .catch(next);
};

export const requireRoles = (allowedRoles: Role[]) => {
  return (req: any, _res: Response, next: NextFunction) => {
    if (!req.user?.id) {
      return next(new ApiError(403, 'Specific admin role required.', true, ErrorCodes.ROLE_REQUIRED, { requiredRoles: allowedRoles }));
    }
    revalidateRequestUser(req)
      .then(() => {
        if (hasRole(req.user, Role.SUPER_ADMIN)) {
          return next();
        }
        const hasAllowed = allowedRoles.some((role) => hasRole(req.user, role));
        if (!hasAllowed) {
          return next(new ApiError(403, 'Specific admin role required.', true, ErrorCodes.ROLE_REQUIRED, { requiredRoles: allowedRoles }));
        }
        next();
      })
      .catch(next);
  };
};

export const requireVendorRole = (req: any, _res: Response, next: NextFunction) => {
  if (!req.user?.id) {
    return next(new ApiError(403, 'Vendor access required.', true, ErrorCodes.ROLE_REQUIRED, { requiredRole: Role.VENDOR }));
  }
  revalidateVendorCapability(req)
    .then(() => {
      if (!hasRole(req.user, Role.VENDOR) && !hasRole(req.user, Role.ADMIN)) {
        return next(new ApiError(403, 'Vendor access required.', true, ErrorCodes.ROLE_REQUIRED, { requiredRole: Role.VENDOR }));
      }
      next();
    })
    .catch(next);
};

export const requireCreatorRole = (req: any, _res: Response, next: NextFunction) => {
  if (!req.user?.id) {
    return next(new ApiError(403, 'Content creator access required.', true, ErrorCodes.ROLE_REQUIRED, { requiredRole: Role.CONTENT_CREATOR }));
  }
  revalidateRequestUser(req)
    .then(() => {
      if (!hasRole(req.user, Role.CONTENT_CREATOR) && !hasRole(req.user, Role.ADMIN)) {
        return next(new ApiError(403, 'Content creator access required.', true, ErrorCodes.ROLE_REQUIRED, { requiredRole: Role.CONTENT_CREATOR }));
      }
      next();
    })
    .catch(next);
};
