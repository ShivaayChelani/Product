const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  // Check existing users to not duplicate
  const existingUsers = await p.user.findMany({ select: { email: true } });
  const existingEmails = new Set(existingUsers.map(u => u.email.toLowerCase()));

  // Check existing vendors
  const existingVendors = await p.vendor.findMany({ select: { businessName: true } });
  const existingNames = new Set(existingVendors.map(v => v.businessName.toLowerCase()));

  const newVendors = [
    {
      name: 'Mumbai Harbour Gifts',
      email: 'mumbaiharbour@vendor.com',
      password: 'Vendor@123',
      businessType: 'local_shop',
      city: 'Mumbai',
      state: 'Maharashtra',
      lat: 18.9219,
      lng: 72.8346,
      desc: 'Authentic Maharashtrian handicrafts, Kolhapuri chappals, and Warli art souvenirs.',
    },
    {
      name: 'Banaras Silk Emporium',
      email: 'banarassilk@vendor.com',
      password: 'Vendor@123',
      businessType: 'local_shop',
      city: 'Varanasi',
      state: 'Uttar Pradesh',
      lat: 25.3176,
      lng: 82.9739,
      desc: 'Handwoven Banarasi silk sarees, brocade fabrics, and traditional textiles.',
    },
    {
      name: 'Chennai Auto Rentals',
      email: 'chennairentals@vendor.com',
      password: 'Vendor@123',
      businessType: 'vehicle_rental',
      city: 'Chennai',
      state: 'Tamil Nadu',
      lat: 13.0827,
      lng: 80.2707,
      desc: 'Reliable car and bike rentals for exploring Chennai and Mahabalipuram.',
    },
    {
      name: 'Goa Beachside Cafe',
      email: 'goabeachcafe@vendor.com',
      password: 'Vendor@123',
      businessType: 'restaurant',
      city: 'Anjuna, Goa',
      state: 'Goa',
      lat: 15.5756,
      lng: 73.7416,
      desc: 'Fresh seafood, Goan vindaloo, and beachside dining at Anjuna.',
    },
    {
      name: 'Jaipur Blue Pottery Studio',
      email: 'jaipurpottery@vendor.com',
      password: 'Vendor@123',
      businessType: 'local_shop',
      city: 'Jaipur',
      state: 'Rajasthan',
      lat: 26.9124,
      lng: 75.7873,
      desc: 'Authentic blue pottery, handcrafted souvenirs, and traditional Rajasthani art.',
    },
    {
      name: 'Kerala Backwater Homestay',
      email: 'keralahomestay@vendor.com',
      password: 'Vendor@123',
      businessType: 'hotel',
      city: 'Alleppey',
      state: 'Kerala',
      lat: 9.4981,
      lng: 76.3388,
      desc: 'Traditional Kerala houseboat stays and backwater homestay experience.',
    },
  ];

  let created = 0;
  for (const v of newVendors) {
    if (existingEmails.has(v.email.toLowerCase())) {
      console.log(`Skipping existing email: ${v.email}`);
      continue;
    }
    if (existingNames.has(v.name.toLowerCase())) {
      console.log(`Skipping existing vendor: ${v.name}`);
      continue;
    }

    // Create user
    const bcrypt = require('bcryptjs');
    const rawPw = process.env.SEED_VENDOR_PASSWORD;
    if (!rawPw) {
      console.error('FATAL: Missing SEED_VENDOR_PASSWORD environment variable. Aborting.');
      process.exit(1);
    }
    const hashed = await bcrypt.hash(rawPw, 10);
    const user = await p.user.create({
      data: {
        email: v.email.toLowerCase(),
        password: hashed,
        name: v.name,
        roles: ['USER', 'VENDOR'],
        activeRole: 'VENDOR',
      },
    });

    // Create vendor
    await p.vendor.create({
      data: {
        userId: user.id,
        businessName: v.name,
        businessType: v.businessType,
        phone: '9999999999',
        address: v.city + ', ' + v.state,
        city: v.city,
        state: v.state,
        latitude: v.lat,
        longitude: v.lng,
        description: v.desc,
        status: 'APPROVED',
        showOnMap: true,
        showContact: true,
        showWebsite: true,
        showImages: true,
        showOffers: true,
        showReels: true,
        showNavigation: true,
        vendorCode: 'VEN_' + v.name.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase(),
      },
    });

    console.log(`✓ Created vendor: ${v.name} (${v.email}) in ${v.city}, ${v.state}`);
    existingEmails.add(v.email.toLowerCase());
    existingNames.add(v.name.toLowerCase());
    created++;
  }

  const total = await p.vendor.count();
  console.log(`\nDone! Created ${created} new vendors. Total vendors: ${total}`);

  const allVendors = await p.vendor.findMany({
    select: { businessName: true, businessType: true, city: true, state: true },
  });
  for (const v of allVendors) {
    console.log(`  ${v.businessName} | ${v.businessType} | ${v.city}, ${v.state}`);
  }

  await p.$disconnect();
})();
