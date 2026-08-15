import { prisma } from '../src/config/database';

/** Remove ratings that have no backing reviews (legacy synthetic backfill). */
async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const count = await prisma.place.count({
    where: {
      reviewCount: 0,
      OR: [{ rating: { not: null } }, { bayesianRating: { not: null } }],
    },
  });

  if (dryRun) {
    console.log(`Would clear synthetic ratings on ${count} places`);
    return;
  }

  const result = await prisma.place.updateMany({
    where: {
      reviewCount: 0,
      OR: [{ rating: { not: null } }, { bayesianRating: { not: null } }],
    },
    data: { rating: null, bayesianRating: null, popularityScore: null },
  });

  console.log(`Cleared synthetic ratings on ${result.count} places (matched ${count})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
