import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../config/database';
import { customersService } from '../modules/monetization/customers.service';
import { testRunId } from './helpers/testRunId';

describe('Vendor this-month customer metric', () => {
  const stamp = `vcust-${testRunId}`;
  let vendorUserId: string;
  let vendorId: string;
  let offerId: string;
  const customerIds: string[] = [];
  const redemptionIds: string[] = [];

  beforeAll(async () => {
    const vendorUser = await prisma.user.create({
      data: {
        email: `${stamp}-vendor@example.test`,
        password: 'hash',
        name: 'Vendor Metric Owner',
      },
    });
    vendorUserId = vendorUser.id;

    const vendor = await prisma.vendor.create({
      data: {
        userId: vendorUser.id,
        businessName: 'Metric Cafe',
        businessType: 'cafe',
        phone: '+910000000001',
        address: '1 Test Street',
        city: 'TestCity',
        state: 'TestState',
        status: 'APPROVED',
      },
    });
    vendorId = vendor.id;

    const offer = await prisma.vendorOffer.create({
      data: {
        vendorId: vendor.id,
        title: 'Test Offer',
        discountType: 'PERCENT',
        discountValue: 10,
        pointsRequired: 50,
        isApproved: true,
        isActive: true,
      },
    });
    offerId = offer.id;

    const names = ['Alice', 'Bob', 'Carol', 'Dave'];
    for (const name of names) {
      const user = await prisma.user.create({
        data: {
          email: `${stamp}-${name.toLowerCase()}@example.test`,
          password: 'hash',
          name,
        },
      });
      customerIds.push(user.id);
    }

    const now = new Date();
    const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15));

    async function redeem(opts: {
      userId: string;
      status: 'VERIFIED' | 'PENDING';
      createdAt: Date;
      qr: string;
    }) {
      const row = await prisma.redemption.create({
        data: {
          userId: opts.userId,
          vendorId,
          offerId,
          pointsSpent: 50,
          discountValue: 10,
          discountType: 'PERCENT',
          qrCode: `${stamp}-${opts.qr}`,
          status: opts.status,
          verifiedAt: opts.status === 'VERIFIED' ? opts.createdAt : null,
          createdAt: opts.createdAt,
        },
      });
      redemptionIds.push(row.id);
    }

    await redeem({ userId: customerIds[0], status: 'VERIFIED', createdAt: now, qr: 'a1' });
    await redeem({ userId: customerIds[0], status: 'VERIFIED', createdAt: now, qr: 'a2' });
    await redeem({ userId: customerIds[1], status: 'VERIFIED', createdAt: now, qr: 'b1' });
    await redeem({ userId: customerIds[2], status: 'VERIFIED', createdAt: lastMonth, qr: 'c1' });
    await redeem({ userId: customerIds[3], status: 'PENDING', createdAt: now, qr: 'd1' });
  });

  afterAll(async () => {
    if (redemptionIds.length) {
      await prisma.redemption.deleteMany({ where: { id: { in: redemptionIds } } });
    }
    if (offerId) await prisma.vendorOffer.deleteMany({ where: { id: offerId } });
    if (vendorId) await prisma.vendor.deleteMany({ where: { id: vendorId } });
    const userIds = [vendorUserId, ...customerIds].filter(Boolean);
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it('counts distinct verified customers in the current month only', async () => {
    const result = await customersService.forVendor(vendorUserId);
    expect(result.summary.thisMonthCustomers).toBe(2);
    expect(result.summary.totalCustomers).toBe(4);
  });
});
