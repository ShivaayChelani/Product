/**
 * Opt-in Super Admin assignment for the existing founder account.
 *
 * Does NOT run on API boot. Does not create a new user.
 * Requires CONFIRM_FOUNDER_SUPER_ADMIN=1 so it cannot fire accidentally.
 *
 * Usage (test / authorized env only):
 *   CONFIRM_FOUNDER_SUPER_ADMIN=1 npx tsx scripts/ensure-founder-super-admin.ts
 */
import dotenv from 'dotenv';
import path from 'path';
import { Role } from '@prisma/client';
import { prisma } from '../src/config/database';
import { findUserByEmail } from '../src/shared/utils/userEmailLookup';
import { listApprovedRoles } from '../src/shared/utils/specialtyRoles';
import { usersService } from '../src/modules/users/users.service';
import { FOUNDER_ADMIN_EMAIL } from '../src/modules/users/roleChangeGuards';
import { eventBus, AppEvents } from '../src/config/events';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function main() {
  if (process.env.CONFIRM_FOUNDER_SUPER_ADMIN !== '1') {
    console.error('Refusing to run. Set CONFIRM_FOUNDER_SUPER_ADMIN=1 to assign SUPER_ADMIN.');
    process.exit(1);
  }

  const email = FOUNDER_ADMIN_EMAIL;
  const user = await findUserByEmail(email);
  if (!user) {
    console.error(`Account not found: ${email}. No user was created.`);
    process.exit(1);
  }

  const previousRoles = await listApprovedRoles(user.id);
  const previousPermission = user.permission;
  if (previousRoles.includes(Role.SUPER_ADMIN) && previousPermission === Role.SUPER_ADMIN) {
    console.log(JSON.stringify({
      outcome: 'already_super_admin',
      userId: user.id,
      email,
      permission: previousPermission,
    }));
    return;
  }

  await usersService.persistSuperAdminRole(user.id, user.id);
  const nextRoles = await listApprovedRoles(user.id);
  const updated = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { id: true, email: true, permission: true, activeMode: true },
  });

  eventBus.emit(AppEvents.USER_ROLE_CHANGED, {
    userId: user.id,
    actorId: user.id,
    previous: { permission: previousPermission, roles: previousRoles },
    newValues: { permission: updated.permission, roles: nextRoles, outcome: 'assigned_super_admin' },
  });

  console.log(JSON.stringify({
    outcome: 'assigned_super_admin',
    userId: updated.id,
    email: updated.email,
    previousPermission,
    permission: updated.permission,
    hasSuperAdminRole: nextRoles.includes(Role.SUPER_ADMIN),
  }));
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : 'Assignment failed');
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
