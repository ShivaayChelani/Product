import { PrismaClient } from '@prisma/client';
import {
  DEFAULT_POINT_RULES,
  DEPRECATED_POINT_RULE_KEYS,
} from '../../src/modules/point-rules/pointRules.validation';

export async function seedSystem(prisma: PrismaClient) {
  console.log('--- Seeding 01_system.ts ---');

  // 1. Active point rules (only features that actually award PalPoints)
  for (const rule of DEFAULT_POINT_RULES) {
    await prisma.pointRule.upsert({
      where: { key: rule.key },
      update: {
        label: rule.label,
        description: rule.description,
        points: rule.points,
        category: rule.category,
        cooldownSec: rule.cooldownSec,
        maxDaily: rule.maxDaily ?? null,
        isActive: true,
      },
      create: { ...rule, isActive: true },
    });
  }

  // Remove unimplemented / wishlist rules left over from older seeds
  const removed = await prisma.pointRule.deleteMany({
    where: { key: { in: [...DEPRECATED_POINT_RULE_KEYS] } },
  });
  console.log(
    `Seeded ${DEFAULT_POINT_RULES.length} active PointRules; removed ${removed.count} unimplemented rules`,
  );

  // 2. System Settings
  const settings = [
    { key: 'maintenance_mode', label: 'Maintenance Mode', value: 'false', description: 'Enable/disable maintenance mode', type: 'boolean' },
    { key: 'signup_bonus_points', label: 'Signup Bonus Points', value: '100', description: 'Points awarded on signup', type: 'number' },
  ];
  for (const s of settings) {
    await prisma.systemSetting.upsert({
      where: { key: s.key },
      update: s,
      create: s,
    });
  }
  console.log(`Seeded ${settings.length} SystemSettings`);
}
