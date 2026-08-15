import { PrismaClient, Place } from '@prisma/client';

export async function seedVendors(prisma: PrismaClient, adminId: string, vendorsUsers: any[], places: Place[]) {
  console.log('--- Seeding 04_vendors.ts ---');

  if (vendorsUsers.length === 0) return;

  // We have 3 vendors in 02_users.ts: Taj Hospitality, Raj Travels, Cafe Delight Owner
  // Let's create Vendor profiles for them and VendorOffers.

  const tajVendor = vendorsUsers[0];
  const rajVendor = vendorsUsers[1];
  const cafeVendor = vendorsUsers[2];



  const vendorData = [
    {
      userId: tajVendor.id,
      businessName: 'Taj Palace Hotel',
      businessType: 'hotel',
      phone: '+91-11-26110202',
      address: 'Sardar Patel Marg, Diplomatic Enclave',
      city: 'Delhi',
      state: 'Delhi',
      latitude: 28.5961,
      longitude: 77.1738,
      description: 'Luxury 5-star hotel offering world-class amenities and heritage experiences.',
      status: 'APPROVED',
      services: {
        starRating: 5, totalRooms: 403, amenities: ['pool', 'spa', 'gym', 'restaurant', 'bar'],
        checkIn: '14:00', checkOut: '12:00', hasParking: true, hasRestaurant: true, hasPool: true, hasWifi: true,
        priceRange: { min: 15000, max: 75000 },
      },
    },
    {
      userId: rajVendor.id,
      businessName: 'Raj Rajputana Tours',
      businessType: 'travel_agent',
      phone: '+91-141-2365942',
      address: 'MI Road, Near Ajmeri Gate',
      city: 'Jaipur',
      state: 'Rajasthan',
      latitude: 26.9188,
      longitude: 75.8174,
      description: 'Premium cultural and historical tours across Rajasthan.',
      status: 'APPROVED',
      services: {
        languages: ['english', 'hindi', 'french'],
        destinations: ['Jaipur', 'Udaipur', 'Jodhpur'],
        hasTransport: true,
      },
    },
    {
      userId: cafeVendor.id,
      businessName: 'Delhi Spice Cafe',
      businessType: 'restaurant',
      phone: '+91-11-45678901',
      address: 'Connaught Place',
      city: 'Delhi',
      state: 'Delhi',
      latitude: 28.6328,
      longitude: 77.2197,
      description: 'Authentic street food in a hygienic and modern cafe setting.',
      status: 'APPROVED',
      services: {
        cuisineTypes: ['indian', 'street-food'], mealOptions: ['lunch', 'dinner', 'snacks'],
        seatingCapacity: 50, hasVegan: true, hasDelivery: true, hasOutdoor: false,
        priceRange: { min: 500, max: 1500 }, timings: '11:00 AM - 11:00 PM',
      },
    },
  ];

  const createdVendorRecords = [];
  for (const v of vendorData) {
    const vendor = await prisma.vendor.upsert({
      where: { userId: v.userId },
      update: {},
      create: {
        ...v,
        status: v.status as any,
        reviewedById: adminId,
        reviewedAt: new Date(),
      }
    });
    createdVendorRecords.push(vendor);
  }
  console.log(`Seeded ${createdVendorRecords.length} Vendors`);

  // Vendor Offers
  const offersData = [
    {
      vendorId: createdVendorRecords[0].id, // Taj
      title: '20% off on Spa Services',
      description: 'Relax and rejuvenate with 20% off on all Jiva Spa services.',
      discountType: 'PERCENTAGE',
      discountValue: 20,
      pointsRequired: 500,
      isActive: true,
      validUntil: new Date(Date.now() + 90 * 86400000),
      category: 'wellness',
      terms: ['Subject to availability', 'Advance booking required'],
      totalCodes: 100,
      availableCodes: 100,
    },
    {
      vendorId: createdVendorRecords[0].id, // Taj
      title: 'Complimentary Room Upgrade',
      description: 'Upgrade to the next room category for free.',
      discountType: 'OTHER',
      discountValue: 0,
      pointsRequired: 1500,
      isActive: true,
      validUntil: new Date(Date.now() + 60 * 86400000),
      category: 'stay',
      terms: ['Subject to availability at check-in'],
      totalCodes: 50,
      availableCodes: 50,
    },
    {
      vendorId: createdVendorRecords[1].id, // Raj Tours
      title: 'Γé╣1000 off Jaipur City Tour',
      description: 'Get a flat Γé╣1000 discount on our signature full-day Jaipur city tour.',
      discountType: 'FLAT',
      discountValue: 1000,
      pointsRequired: 300,
      isActive: true,
      validUntil: new Date(Date.now() + 120 * 86400000),
      category: 'experience',
      terms: ['Valid for min 2 persons'],
      totalCodes: 200,
      availableCodes: 50,
    },
    {
      vendorId: createdVendorRecords[2].id, // Cafe
      title: 'Free Dessert with Main Course',
      description: 'Enjoy a free Gulab Jamun or Brownie with any main course order.',
      discountType: 'OTHER',
      discountValue: 0,
      pointsRequired: 100,
      isActive: true,
      validUntil: new Date(Date.now() + 30 * 86400000),
      category: 'food',
      terms: ['Dine-in only'],
      totalCodes: 500,
      availableCodes: 500,
    },
  ];

  const createdOffers = [];
  for (const o of offersData) {
    const offer = await prisma.vendorOffer.create({
      data: {
        vendorId: o.vendorId,
        title: o.title,
        description: o.description,
        discountType: o.discountType,
        discountValue: o.discountValue,
        pointsRequired: o.pointsRequired,
        isActive: o.isActive,
        validTill: o.validUntil ? o.validUntil.toISOString() : undefined,
        category: o.category,
      }
    });
    createdOffers.push(offer);
  };
  console.log(`Seeded ${createdOffers.length} Vendor Offers`);

  return {
    vendorRecords: createdVendorRecords,
    vendorOffers: createdOffers,
  };
}
