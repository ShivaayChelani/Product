import { prisma } from '../src/config/database';
(async () => {
  const names = ['Nauka Vihar', 'Gwarighat Narmada', 'Tilwara Ghat'];
  for (const n of names) {
    const p = await prisma.place.findFirst({ where: { name: { contains: n } }, select: { name: true, openingHours: true } });
    console.log('---', p?.name);
    console.log(JSON.stringify(p?.openingHours));
  }
  await prisma.$disconnect();
})();
