const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const missing = ['cmr2jhhn0000ff9fod6yg5izy'];
  for (const uid of missing) {
    const u = await p.user.findUnique({ where: { id: uid }, select: { name: true } });
    const w = await p.wallet.findUnique({ where: { userId: uid } });
    if (!w) {
      await p.wallet.create({ data: { userId: uid, palPoints: 5000, lifetimeEarned: 10000, lifetimeSpent: 5000 } });
      console.log(`Created wallet for ${u?.name}: 5000 pts`);
    } else {
      console.log(`${u?.name} already has ${w.palPoints} pts`);
    }
  }
  // Also check admin wallet
  const adminWallet = await p.wallet.findUnique({ where: { userId: 'cmr2fzi9b0007f98wsfnc32dt' } });
  if (!adminWallet) {
    await p.wallet.create({ data: { userId: 'cmr2fzi9b0007f98wsfnc32dt', palPoints: 999999, lifetimeEarned: 999999 } });
    console.log('Created admin wallet with 999999 pts');
  } else {
    console.log(`Admin already has ${adminWallet.palPoints} pts`);
  }
  await p.$disconnect();
})();
