import { prisma } from '../src/config/database';
(async () => {
  const u = await prisma.user.findUnique({ where: { email: 'itinerary-audit@palsafar.test' } });
  console.log('audit user remains:', !!u);
  const t = await prisma.tripPlan.count({ where: { user: { email: { contains: 'palsafar.test' } } } });
  console.log('audit trips remain:', t);
  const logs = await prisma.aiGenerationLog.count({ where: { userId: 'cmt3634f50000f9n01ropewt5' } });
  console.log('orphan generation logs for audit user id:', logs);
  await prisma.$disconnect();
})();
