import { boundaryValidationService } from '../../src/modules/canonical/services/boundary-validation.service';
import { prisma } from '../../src/config/database';

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1] || '500', 10) : 500;
  const result = await boundaryValidationService.validateBatch(limit);
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
