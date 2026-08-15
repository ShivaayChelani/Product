import { prisma } from '../src/config/database';

async function auditCreatorUsernames() {
  try {
    console.log('--- AUDITING CREATOR USERNAME CASE-INSENSITIVE DUPLICATES ---');
    const profiles = await prisma.creatorProfile.findMany({
      select: { id: true, userId: true, username: true, status: true },
    });

    console.log(`Audited ${profiles.length} CreatorProfile records in database.`);

    const usernameMap = new Map<string, typeof profiles>();
    let duplicatesCount = 0;

    for (const p of profiles) {
      const lower = p.username.trim().toLowerCase();
      if (!usernameMap.has(lower)) {
        usernameMap.set(lower, []);
      }
      usernameMap.get(lower)!.push(p);
    }

    for (const [lower, list] of usernameMap.entries()) {
      if (list.length > 1) {
        duplicatesCount++;
        console.error(`\n[CONFLICT DISCOVERED] Username "${lower}" has ${list.length} case variants:`);
        for (const item of list) {
          console.error(`  - Profile ID: ${item.id} | User ID: ${item.userId} | Username: "${item.username}" | Status: ${item.status}`);
        }
      }
    }

    if (duplicatesCount === 0) {
      console.log('\n✅ RESULT: ZERO case-insensitive duplicate usernames found across all CreatorProfiles!');
    } else {
      console.error(`\n⚠️ RESULT: Found ${duplicatesCount} conflicting username groups.`);
    }
  } catch (err) {
    console.error('Audit script failed:', err);
  } finally {
    await prisma.$disconnect();
  }
}

auditCreatorUsernames();
