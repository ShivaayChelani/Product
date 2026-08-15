const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const links = {
  'Handwoven Banaras Silk Scarf': { vendorId: 'cmr2jhegf0005f9fojbmdfpg0' },
  'Blue Pottery Coffee Mug Set': { vendorId: 'cmr2jhh4g000ef9fo17aw34om' },
  'Goa Beachside Stay Voucher': { vendorId: 'cmr2jhg9e000bf9fo9xpfxj0y' },
  'Kerala Backwater Homestay - 2 Nights': { vendorId: 'cmr2jhhzn000hf9fol3jjqp80' },
  'Chennai Auto Day Rental': { vendorId: 'cmr2jhfce0008f9fom1g8yeqn' },
  'Mumbai Harbour Gift Hamper': { vendorId: 'cmr2jhdko0002f9foivfwes8c' },
  'Street Story Cafe - Free Thali': { vendorId: 'cmr2g5drn000sgh21ukxciamn', vendorOfferId: 'cmr2g5efc000wgh21o1wxubqi' },
  'Delhi Spice Cafe - Dinner for Two': { vendorId: 'cmr2g15hn00avf98wjfgbmgln', vendorOfferId: 'cmr2g15s800axf98w2z3bjjv3' },
  'Jaipur Blue Pottery Workshop': { vendorId: 'cmr2jhh4g000ef9fo17aw34om' },
  'Taj Palace - High Tea Voucher': { vendorId: 'cmr2g13ow00alf98wazq5kx9a', vendorOfferId: 'cmr2g13zz00anf98wtskxx7ok' },
  'Narmada Adventure - River Rafting': { vendorId: 'cmr2g16da00b0f98woym02ygn', vendorOfferId: 'cmr2g16nr00b2f98wacn04c71' },
  'Raj Rajputana - 3-Day Rajasthan Tour': { vendorId: 'cmr2g14l400aqf98wuzjknazc', vendorOfferId: 'cmr2g14wm00asf98w4j6gee1s' },
};

(async () => {
  console.log('--- Linking catalog entries to vendors ---');
  for (const [title, data] of Object.entries(links)) {
    const found = await p.rewardCatalog.findFirst({ where: { title } });
    if (found) {
      await p.rewardCatalog.update({ where: { id: found.id }, data });
      console.log(`  Linked "${title}" -> vendor ${data.vendorId}${data.vendorOfferId ? ' + offer' : ''}`);
    } else {
      console.log(`  NOT FOUND: "${title}"`);
    }
  }
  console.log('--- Done ---');
  await p.$disconnect();
})();
