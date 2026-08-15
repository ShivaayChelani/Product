const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  console.log('Places:', await p.place.count());
  console.log('Stats:', await p.placeStat.count());
  console.log('Audits:', await p.auditLog.count());
  console.log('Users:', await p.user.count());
  await p.$disconnect();
})();
