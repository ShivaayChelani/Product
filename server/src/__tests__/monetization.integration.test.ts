import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import crypto from 'crypto';
import request from 'supertest';
import app from '../app';
import { prisma } from '../config/database';
import { getAuthToken } from './helpers/auth';
import { PaymentProvider, PaymentStatus, PlanBillingPeriod, PlanAudience } from '@prisma/client';
import { _setRazorpayMock } from '../modules/monetization/payments.service';

process.env.RAZORPAY_KEY_ID = 'rzp_test_mock';
process.env.RAZORPAY_KEY_SECRET = 'mock_razorpay_secret_for_testing';
process.env.RAZORPAY_WEBHOOK_SECRET = 'mock_webhook_secret_for_testing';

let mockOrdersCreate: ReturnType<typeof vi.fn>;
let mockPaymentsFetch: ReturnType<typeof vi.fn>;

let vendorToken: string;
let creatorToken: string;
let adminToken: string;
let vendorUserId: string;
let creatorUserId: string;

let vendorPlanId: string;
let creatorPlanId: string;

const createdIds: { subscriptions: string[]; transactions: string[]; invoices: string[]; coupons: string[] } = {
  subscriptions: [],
  transactions: [],
  invoices: [],
  coupons: [],
};

async function getUserId(token: string): Promise<string> {
  const res = await request(app)
    .get('/api/v1/auth/me')
    .set('Authorization', `Bearer ${token}`);
  return res.body.data?.id;
}

async function createTestPlan(audience: PlanAudience, prices: Array<{ period: string; amountPaise: number }>): Promise<{ id: string; pricePaise: number; currency: string }> {
  const slug = `test-${audience.toLowerCase()}-${Date.now().toString(36)}`;
  const plan = await prisma.subscriptionPlan.create({
    data: {
      audience,
      name: `Test ${audience} Plan`,
      slug,
      status: 'ACTIVE',
      trialDays: 0,
      gracePeriodDays: 3,
      prices: {
        create: prices.map((p) => ({
          period: p.period as PlanBillingPeriod,
          amountPaise: p.amountPaise,
          currency: 'INR',
          isActive: true,
        })),
      },
    },
    include: { prices: true },
  });
  const price = plan.prices.find((p) => p.isActive)!;
  return { id: plan.id, pricePaise: price.amountPaise, currency: price.currency };
}

async function createCoupon(overrides: Record<string, any> = {}): Promise<string> {
  const payload: Record<string, any> = {
    code: `TEST${Date.now().toString(36).toUpperCase()}`,
    type: 'PERCENTAGE',
    value: 50,
    maxDiscount: 50000,
    ...overrides,
  };
  const res = await request(app)
    .post('/api/v1/monetization/admin/coupons')
    .set('Authorization', `Bearer ${adminToken}`)
    .send(payload);
  if (res.status === 201) {
    createdIds.coupons.push(res.body.data.id);
  }
  return res.body.data?.id;
}

async function signRazorpayWebhook(payload: Record<string, any>): Promise<string> {
  const body = JSON.stringify(payload);
  return crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!).update(body).digest('hex');
}

async function cleanupTestData() {
  await prisma.$transaction(async (tx) => {
    if (createdIds.invoices.length) {
      await tx.invoice.deleteMany({ where: { id: { in: createdIds.invoices } } });
    }
    if (createdIds.transactions.length) {
      await tx.paymentTransaction.deleteMany({ where: { id: { in: createdIds.transactions } } });
    }
    if (createdIds.subscriptions.length) {
      await tx.userSubscription.deleteMany({ where: { id: { in: createdIds.subscriptions } } });
    }
  });

  if (createdIds.coupons.length) {
    for (const id of createdIds.coupons) {
      try { await prisma.coupon.delete({ where: { id } }); } catch { /* already gone */ }
    }
  }

  if (vendorUserId) {
    await prisma.vendor.updateMany({ where: { userId: vendorUserId }, data: { subscriptionStatus: 'NONE' } });
  }
  if (creatorUserId) {
    await prisma.creatorProfile.updateMany({ where: { userId: creatorUserId }, data: { membershipPlanId: null, membershipExpiresAt: null, uploadLimit: null } });
  }

  createdIds.subscriptions = [];
  createdIds.transactions = [];
  createdIds.invoices = [];
  createdIds.coupons = [];
}

function mockRazorpayOrder(orderOverrides: Record<string, any> = {}) {
  mockOrdersCreate.mockResolvedValue({
    id: 'order_mock_' + Date.now().toString(36),
    entity: 'order',
    amount: 0,
    amount_paid: 0,
    amount_due: 0,
    currency: 'INR',
    receipt: `PS-${Date.now().toString(36).toUpperCase()}`,
    status: 'created',
    attempts: 0,
    notes: {},
    created_at: Math.floor(Date.now() / 1000),
    ...orderOverrides,
  });
}

function mockRazorpayPayment(paymentOverrides: Record<string, any> = {}) {
  mockPaymentsFetch.mockResolvedValue({
    id: 'pay_mock_' + Date.now().toString(36),
    entity: 'payment',
    amount: 0,
    currency: 'INR',
    status: 'captured',
    order_id: 'order_mock_test',
    refunded: false,
    captured: true,
    method: 'upi',
    notes: {},
    created_at: Math.floor(Date.now() / 1000),
    ...paymentOverrides,
  });
}

describe('Monetization / Payment Integration', () => {
  beforeAll(async () => {
    [vendorToken, creatorToken, adminToken] = await Promise.all([
      getAuthToken('VENDOR'),
      getAuthToken('CONTENT_CREATOR'),
      getAuthToken('ADMIN'),
    ]);

    [vendorUserId, creatorUserId] = await Promise.all([
      getUserId(vendorToken),
      getUserId(creatorToken),
    ]);

    const [vp, cp] = await Promise.all([
      createTestPlan(PlanAudience.VENDOR, [
        { period: 'MONTHLY', amountPaise: 39900 },
        { period: 'YEARLY', amountPaise: 379900 },
      ]),
      createTestPlan(PlanAudience.CREATOR, [
        { period: 'MONTHLY', amountPaise: 14900 },
        { period: 'YEARLY', amountPaise: 139900 },
      ]),
    ]);
    vendorPlanId = vp.id;
    creatorPlanId = cp.id;
  }, 60000);

  beforeEach(() => {
    mockOrdersCreate = vi.fn();
    mockPaymentsFetch = vi.fn();
    _setRazorpayMock({
      orders: { create: mockOrdersCreate },
      payments: { fetch: mockPaymentsFetch },
    });
  });

  afterEach(async () => {
    await cleanupTestData();
  }, 15000);

  // Prisma disconnect only in global teardown (global-setup.ts) — never mid-suite.

  // ─────────────────────────────────────────────
  // 1. Order Creation
  // ─────────────────────────────────────────────
  describe('1. Order Creation', () => {
    it('creates a Razorpay order successfully', async () => {
      mockRazorpayOrder({ amount: 39900, currency: 'INR' });

      const res = await request(app)
        .post('/api/v1/monetization/razorpay/order')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({ planId: vendorPlanId, period: 'MONTHLY' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.orderId).toMatch(/^order_/);
      expect(res.body.data.amountPaise).toBeGreaterThan(0);
      expect(res.body.data.keyId).toBe('rzp_test_mock');
      expect(res.body.data.transactionId).toBeDefined();

      createdIds.transactions.push(res.body.data.transactionId);
    });

    it('ignores client-supplied amountPaise and uses the database price', async () => {
      mockRazorpayOrder({ amount: 39900, currency: 'INR' });

      const res = await request(app)
        .post('/api/v1/monetization/razorpay/order')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({ planId: vendorPlanId, period: 'MONTHLY', amountPaise: 1 });

      expect(res.status).toBe(201);
      expect(res.body.data.amountPaise).toBe(39900);
      expect(mockOrdersCreate).toHaveBeenCalledWith(expect.objectContaining({ amount: 39900 }));
      createdIds.transactions.push(res.body.data.transactionId);
    });

    it('rejects invalid plan ID', async () => {
      const res = await request(app)
        .post('/api/v1/monetization/razorpay/order')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({ planId: 'nonexistent-id', period: 'MONTHLY' });

      expect(res.status).toBe(404);
    });

    it('rejects unavailable billing period', async () => {
      const res = await request(app)
        .post('/api/v1/monetization/razorpay/order')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({ planId: vendorPlanId, period: 'QUARTERLY' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/billing period/i);
    });

    it('accepts valid coupon code', async () => {
      await createCoupon({ type: 'PERCENTAGE', value: 20, maxDiscount: 10000 });
      const coupon = await prisma.coupon.findFirst({ where: { id: createdIds.coupons[0] } });
      mockRazorpayOrder({ amount: 31920, currency: 'INR' });

      const res = await request(app)
        .post('/api/v1/monetization/razorpay/order')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({ planId: vendorPlanId, period: 'MONTHLY', couponCode: coupon!.code });

      expect(res.status).toBe(201);
      expect(res.body.data.amountPaise).toBeLessThan(39900);
      createdIds.transactions.push(res.body.data.transactionId);
    });

    it('activates subscription immediately for 100% discount coupon', async () => {
      await createCoupon({ type: 'PERCENTAGE', value: 100, maxDiscount: 9999999 });
      const coupon = await prisma.coupon.findFirst({ where: { id: createdIds.coupons[0] } });

      const res = await request(app)
        .post('/api/v1/monetization/razorpay/order')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({ planId: vendorPlanId, period: 'MONTHLY', couponCode: coupon!.code });

      expect(res.status).toBe(201);
      expect(res.body.data.free).toBe(true);
      expect(res.body.data.subscription).toBeDefined();
      expect(res.body.data.transaction).toBeDefined();
      expect(res.body.data.transaction.status).toBe('CAPTURED');
      expect(res.body.data.transaction.amountPaise).toBe(0);

      createdIds.subscriptions.push(res.body.data.subscription.id);
      createdIds.transactions.push(res.body.data.transaction.id);
      createdIds.invoices.push(res.body.data.invoice.id);
    });

    it('rejects vendor-created coupons on subscription checkout', async () => {
      const code = `VSELF${Date.now().toString(36).toUpperCase()}`;
      const created = await request(app)
        .post('/api/v1/monetization/vendor/coupons')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({ code, type: 'PERCENTAGE', value: 100, maxDiscount: 9999999 });
      expect(created.status).toBe(201);
      if (created.body.data?.id) createdIds.coupons.push(created.body.data.id);

      const res = await request(app)
        .post('/api/v1/monetization/razorpay/order')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({ planId: vendorPlanId, period: 'MONTHLY', couponCode: code });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/cannot be applied|coupon/i);
    });

    it('rejects expired coupon', async () => {
      await createCoupon({
        type: 'PERCENTAGE', value: 10,
        expiresAt: new Date('2020-01-01').toISOString(),
      });
      const coupon = await prisma.coupon.findFirst({ where: { id: createdIds.coupons[0] } });

      const res = await request(app)
        .post('/api/v1/monetization/razorpay/order')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({ planId: vendorPlanId, period: 'MONTHLY', couponCode: coupon!.code });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/expired/i);
    });

    it('rejects used-up coupon', async () => {
      await createCoupon({
        type: 'PERCENTAGE', value: 10,
        usageLimit: 0,
      });
      const coupon = await prisma.coupon.findFirst({ where: { id: createdIds.coupons[0] } });

      const res = await request(app)
        .post('/api/v1/monetization/razorpay/order')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({ planId: vendorPlanId, period: 'MONTHLY', couponCode: coupon!.code });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/usage limit/i);
    });

    it('requires authentication', async () => {
      const res = await request(app)
        .post('/api/v1/monetization/razorpay/order')
        .send({ planId: vendorPlanId, period: 'MONTHLY' });

      expect(res.status).toBe(401);
    });
  });

  // ─────────────────────────────────────────────
  // 2. Verify Payment
  // ─────────────────────────────────────────────
  describe('2. Verify Payment', () => {
    async function createOrder(): Promise<{ transactionId: string; orderId: string; amountPaise: number }> {
      const orderAmount = 39900;
      mockRazorpayOrder({ amount: orderAmount });
      const res = await request(app)
        .post('/api/v1/monetization/razorpay/order')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({ planId: vendorPlanId, period: 'MONTHLY' });
      createdIds.transactions.push(res.body.data.transactionId);
      return {
        transactionId: res.body.data.transactionId,
        orderId: res.body.data.orderId,
        amountPaise: res.body.data.amountPaise,
      };
    }

    function validSignature(orderId: string, paymentId: string): string {
      return crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');
    }

    it('verifies payment successfully', async () => {
      const { orderId, amountPaise } = await createOrder();
      const paymentId = 'pay_mock_success_' + Date.now();
      const signature = validSignature(orderId, paymentId);

      mockRazorpayPayment({
        id: paymentId,
        amount: amountPaise,
        currency: 'INR',
        status: 'captured',
        order_id: orderId,
        refunded: false,
      });

      const res = await request(app)
        .post('/api/v1/monetization/razorpay/verify')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: signature,
          planId: vendorPlanId,
          period: 'MONTHLY',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.alreadyProcessed).toBe(false);
      expect(res.body.data.transaction.status).toBe('CAPTURED');
      expect(res.body.data.subscription).toBeDefined();
      expect(res.body.data.subscription.status).toBe('ACTIVE');
      expect(res.body.data.invoice).toBeDefined();

      createdIds.subscriptions.push(res.body.data.subscription.id);
      createdIds.invoices.push(res.body.data.invoice.id);
    });

    it('rejects invalid signature', async () => {
      const { orderId } = await createOrder();
      const paymentId = 'pay_mock_bad_sig';

      const res = await request(app)
        .post('/api/v1/monetization/razorpay/verify')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: 'invalid_signature_here',
          planId: vendorPlanId,
          period: 'MONTHLY',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/signature/i);
    });

    it('rejects wrong amount', async () => {
      const { orderId } = await createOrder();
      const paymentId = 'pay_mock_wrong_amount';
      const signature = validSignature(orderId, paymentId);

      mockRazorpayPayment({
        id: paymentId,
        amount: 100,
        currency: 'INR',
        status: 'captured',
        order_id: orderId,
        refunded: false,
      });

      const res = await request(app)
        .post('/api/v1/monetization/razorpay/verify')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: signature,
          planId: vendorPlanId,
          period: 'MONTHLY',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/amount mismatch/i);
    });

    it('rejects wrong currency', async () => {
      const { orderId, amountPaise } = await createOrder();
      const paymentId = 'pay_mock_wrong_currency';
      const signature = validSignature(orderId, paymentId);

      mockRazorpayPayment({
        id: paymentId,
        amount: amountPaise,
        currency: 'USD',
        status: 'captured',
        order_id: orderId,
        refunded: false,
      });

      const res = await request(app)
        .post('/api/v1/monetization/razorpay/verify')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: signature,
          planId: vendorPlanId,
          period: 'MONTHLY',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/currency mismatch/i);
    });

    it('rejects wrong order ID', async () => {
      const { amountPaise } = await createOrder();
      const paymentId = 'pay_mock_wrong_order';
      const wrongOrderId = 'order_wrong_' + Date.now();
      const signature = validSignature(wrongOrderId, paymentId);

      mockRazorpayPayment({
        id: paymentId,
        amount: amountPaise,
        currency: 'INR',
        status: 'captured',
        order_id: wrongOrderId,
        refunded: false,
      });

      const res = await request(app)
        .post('/api/v1/monetization/razorpay/verify')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({
          razorpayOrderId: wrongOrderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: signature,
          planId: vendorPlanId,
          period: 'MONTHLY',
        });

      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/order not found/i);
    });

    it('rejects refunded payment', async () => {
      const { orderId, amountPaise } = await createOrder();
      const paymentId = 'pay_mock_refunded';
      const signature = validSignature(orderId, paymentId);

      mockRazorpayPayment({
        id: paymentId,
        amount: amountPaise,
        currency: 'INR',
        status: 'captured',
        order_id: orderId,
        refunded: true,
      });

      const res = await request(app)
        .post('/api/v1/monetization/razorpay/verify')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: signature,
          planId: vendorPlanId,
          period: 'MONTHLY',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/refunded/i);
    });

    it('handles duplicate verify request (idempotent)', async () => {
      const { orderId, amountPaise } = await createOrder();
      const paymentId = 'pay_mock_dup_' + Date.now();
      const signature = validSignature(orderId, paymentId);

      mockRazorpayPayment({
        id: paymentId,
        amount: amountPaise,
        currency: 'INR',
        status: 'captured',
        order_id: orderId,
        refunded: false,
      });

      const res1 = await request(app)
        .post('/api/v1/monetization/razorpay/verify')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: signature,
          planId: vendorPlanId,
          period: 'MONTHLY',
        });

      expect(res1.status).toBe(200);
      expect(res1.body.data.alreadyProcessed).toBe(false);
      createdIds.subscriptions.push(res1.body.data.subscription.id);
      createdIds.invoices.push(res1.body.data.invoice.id);

      const res2 = await request(app)
        .post('/api/v1/monetization/razorpay/verify')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: signature,
          planId: vendorPlanId,
          period: 'MONTHLY',
        });

      expect(res2.status).toBe(200);
      expect(res2.body.data.alreadyProcessed).toBe(true);
    });

    it('recovers from P2002 unique constraint violation', async () => {
      const order1Amount = 39900;
      const mockOrder1Id = 'order_mock_p2002_1_' + Date.now();
      mockOrdersCreate.mockResolvedValueOnce({
        id: mockOrder1Id,
        amount: order1Amount,
        currency: 'INR',
        receipt: `PS-${Date.now().toString(36).toUpperCase()}`,
        status: 'created',
      });

      const res1 = await request(app)
        .post('/api/v1/monetization/razorpay/order')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({ planId: vendorPlanId, period: 'MONTHLY' });
      expect(res1.status).toBe(201);
      createdIds.transactions.push(res1.body.data.transactionId);

      const tx2 = await prisma.paymentTransaction.create({
        data: {
          user: { connect: { id: vendorUserId } },
          provider: PaymentProvider.RAZORPAY,
          status: PaymentStatus.PENDING,
          amountPaise: order1Amount,
          currency: 'INR',
          providerOrderId: 'order_mock_p2002_2_' + Date.now(),
          receiptNumber: `PS-TEST-${Date.now().toString(36).toUpperCase()}`,
        },
      });
      createdIds.transactions.push(tx2.id);

      const sharedPaymentId = 'pay_mock_p2002_' + Date.now();
      const signature = validSignature(tx2.providerOrderId!, sharedPaymentId);

      await prisma.paymentTransaction.update({
        where: { id: res1.body.data.transactionId },
        data: {
          providerPaymentId: sharedPaymentId,
          status: PaymentStatus.CAPTURED,
        },
      });

      mockRazorpayPayment({
        id: sharedPaymentId,
        amount: order1Amount,
        currency: 'INR',
        status: 'captured',
        order_id: tx2.providerOrderId,
        refunded: false,
      });

      const res2 = await request(app)
        .post('/api/v1/monetization/razorpay/verify')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({
          razorpayOrderId: tx2.providerOrderId!,
          razorpayPaymentId: sharedPaymentId,
          razorpaySignature: signature,
          planId: vendorPlanId,
          period: 'MONTHLY',
        });

      expect(res2.status).toBe(200);
      expect(res2.body.data.alreadyProcessed).toBe(true);
    });

    it('rejects payment with non-captured status', async () => {
      const { orderId, amountPaise } = await createOrder();
      const paymentId = 'pay_mock_failed';
      const signature = validSignature(orderId, paymentId);

      mockRazorpayPayment({
        id: paymentId,
        amount: amountPaise,
        currency: 'INR',
        status: 'failed',
        order_id: orderId,
        refunded: false,
      });

      const res = await request(app)
        .post('/api/v1/monetization/razorpay/verify')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: signature,
          planId: vendorPlanId,
          period: 'MONTHLY',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/not captured/i);
    });
  });

  // ─────────────────────────────────────────────
  // 3. Webhook Processing
  // ─────────────────────────────────────────────
  describe('3. Webhook', () => {
    async function createPendingOrder(orderOverrides: Record<string, any> = {}): Promise<{
      transactionId: string;
      orderId: string;
      amountPaise: number;
    }> {
      const orderAmount = 39900;
      const orderId = 'order_wh_' + Date.now().toString(36);
      mockOrdersCreate.mockResolvedValueOnce({
        id: orderId,
        amount: orderAmount,
        currency: 'INR',
        receipt: `PS-${Date.now().toString(36).toUpperCase()}`,
        status: 'created',
        notes: { userId: vendorUserId, planId: vendorPlanId, period: 'MONTHLY', audience: 'VENDOR' },
        ...orderOverrides,
      });

      const res = await request(app)
        .post('/api/v1/monetization/razorpay/order')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({ planId: vendorPlanId, period: 'MONTHLY' });

      createdIds.transactions.push(res.body.data.transactionId);
      return {
        transactionId: res.body.data.transactionId,
        orderId: res.body.data.orderId,
        amountPaise: res.body.data.amountPaise,
      };
    }

    function buildWebhookPayload(event: string, paymentOverrides: Record<string, any> = {}, orderOverrides: Record<string, any> = {}) {
      return {
        event,
        payload: {
          payment: {
            entity: {
              id: 'pay_wh_' + Date.now().toString(36),
              entity: 'payment',
              amount: 39900,
              currency: 'INR',
              status: 'captured',
              order_id: 'order_wh_test',
              refunded: false,
              captured: true,
              notes: {
                userId: vendorUserId,
                planId: vendorPlanId,
                period: 'MONTHLY',
                audience: 'VENDOR',
              },
              created_at: Math.floor(Date.now() / 1000),
              ...paymentOverrides,
            },
          },
          order: { entity: { id: 'order_wh_test', ...orderOverrides } },
        },
        created_at: Math.floor(Date.now() / 1000),
      };
    }

    it('processes payment.captured webhook', async () => {
      const { orderId, amountPaise } = await createPendingOrder();
      const paymentId = 'pay_wh_captured_' + Date.now().toString(36);

      const webhookPayload = buildWebhookPayload('payment.captured', {
        id: paymentId,
        amount: amountPaise,
        order_id: orderId,
      });

      const signature = await signRazorpayWebhook(webhookPayload);

      const res = await request(app)
        .post('/api/v1/monetization/razorpay/webhook')
        .set('x-razorpay-signature', signature)
        .send(webhookPayload);

      expect(res.status).toBe(200);
      expect(res.body.data.processed).toBe(true);
      expect(res.body.data.transaction.status).toBe('CAPTURED');
      expect(res.body.data.subscription.status).toBe('ACTIVE');

      createdIds.subscriptions.push(res.body.data.subscription.id);
      createdIds.invoices.push(res.body.data.transaction.id);
    });

    it('ignores payment.failed event', async () => {
      const webhookPayload = buildWebhookPayload('payment.failed', { status: 'failed' });
      const signature = await signRazorpayWebhook(webhookPayload);

      const res = await request(app)
        .post('/api/v1/monetization/razorpay/webhook')
        .set('x-razorpay-signature', signature)
        .send(webhookPayload);

      expect(res.status).toBe(200);
      expect(res.body.data.ignored).toBe(true);
    });

    it('ignores refund.processed event', async () => {
      const webhookPayload = buildWebhookPayload('refund.processed');
      const signature = await signRazorpayWebhook(webhookPayload);

      const res = await request(app)
        .post('/api/v1/monetization/razorpay/webhook')
        .set('x-razorpay-signature', signature)
        .send(webhookPayload);

      expect(res.status).toBe(200);
      expect(res.body.data.ignored).toBe(true);
    });

    it('ignores duplicate webhook (idempotent)', async () => {
      const { orderId, amountPaise } = await createPendingOrder();
      const paymentId = 'pay_wh_dup_' + Date.now().toString(36);

      const webhookPayload = buildWebhookPayload('payment.captured', {
        id: paymentId,
        amount: amountPaise,
        order_id: orderId,
      });

      const signature = await signRazorpayWebhook(webhookPayload);

      const res1 = await request(app)
        .post('/api/v1/monetization/razorpay/webhook')
        .set('x-razorpay-signature', signature)
        .send(webhookPayload);

      expect(res1.body.data.processed).toBe(true);
      createdIds.subscriptions.push(res1.body.data.subscription.id);
      createdIds.invoices.push(res1.body.data.transaction.id);

      const res2 = await request(app)
        .post('/api/v1/monetization/razorpay/webhook')
        .set('x-razorpay-signature', signature)
        .send(webhookPayload);

      expect(res2.body.data.ignored).toBe(true);
    });

    it('ignores webhook when verify already processed the payment', async () => {
      const { orderId, amountPaise } = await createPendingOrder();
      const paymentId = 'pay_wh_after_verify_' + Date.now().toString(36);
      const signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      mockRazorpayPayment({
        id: paymentId,
        amount: amountPaise,
        currency: 'INR',
        status: 'captured',
        order_id: orderId,
        refunded: false,
      });

      const verifyRes = await request(app)
        .post('/api/v1/monetization/razorpay/verify')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: signature,
          planId: vendorPlanId,
          period: 'MONTHLY',
        });

      expect(verifyRes.body.data.alreadyProcessed).toBe(false);
      createdIds.subscriptions.push(verifyRes.body.data.subscription.id);
      createdIds.invoices.push(verifyRes.body.data.invoice.id);

      const webhookPayload = buildWebhookPayload('payment.captured', {
        id: paymentId,
        amount: amountPaise,
        order_id: orderId,
      });
      const webhookSignature = await signRazorpayWebhook(webhookPayload);

      const whRes = await request(app)
        .post('/api/v1/monetization/razorpay/webhook')
        .set('x-razorpay-signature', webhookSignature)
        .send(webhookPayload);

      expect(whRes.body.data.ignored).toBe(true);
    });

    it('processes webhook when it arrives before verify', async () => {
      const { orderId, amountPaise } = await createPendingOrder();
      const paymentId = 'pay_wh_before_verify_' + Date.now().toString(36);

      const webhookPayload = buildWebhookPayload('payment.captured', {
        id: paymentId,
        amount: amountPaise,
        order_id: orderId,
      });
      const webhookSignature = await signRazorpayWebhook(webhookPayload);

      const whRes = await request(app)
        .post('/api/v1/monetization/razorpay/webhook')
        .set('x-razorpay-signature', webhookSignature)
        .send(webhookPayload);

      expect(whRes.body.data.processed).toBe(true);
      createdIds.subscriptions.push(whRes.body.data.subscription.id);
      createdIds.invoices.push(whRes.body.data.transaction.id);

      const verifySignature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      mockRazorpayPayment({
        id: paymentId,
        amount: amountPaise,
        currency: 'INR',
        status: 'captured',
        order_id: orderId,
        refunded: false,
      });

      const verifyRes = await request(app)
        .post('/api/v1/monetization/razorpay/verify')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: verifySignature,
          planId: vendorPlanId,
          period: 'MONTHLY',
        });

      expect(verifyRes.body.data.alreadyProcessed).toBe(true);
    });

    it('rejects webhook with missing signature', async () => {
      const webhookPayload = buildWebhookPayload('payment.captured');

      const res = await request(app)
        .post('/api/v1/monetization/razorpay/webhook')
        .send(webhookPayload);

      expect(res.status).toBe(401);
    });

    it('rejects webhook with invalid signature', async () => {
      const webhookPayload = buildWebhookPayload('payment.captured');

      const res = await request(app)
        .post('/api/v1/monetization/razorpay/webhook')
        .set('x-razorpay-signature', 'invalid_sig')
        .send(webhookPayload);

      expect(res.status).toBe(401);
    });
  });

  // ─────────────────────────────────────────────
  // 4. Subscription Activation
  // ─────────────────────────────────────────────
  describe('4. Subscription Activation', () => {
    it('activates vendor subscription and updates vendor status', async () => {
      const { orderId, amountPaise } = await (async () => {
        const orderAmount = 39900;
        const oId = 'order_sub_vendor_' + Date.now().toString(36);
        mockOrdersCreate.mockResolvedValueOnce({
          id: oId, amount: orderAmount, currency: 'INR',
          receipt: `PS-${Date.now().toString(36).toUpperCase()}`,
          status: 'created',
        });
        const res = await request(app)
          .post('/api/v1/monetization/razorpay/order')
          .set('Authorization', `Bearer ${vendorToken}`)
          .send({ planId: vendorPlanId, period: 'MONTHLY' });
        createdIds.transactions.push(res.body.data.transactionId);
        return { orderId: res.body.data.orderId, amountPaise: res.body.data.amountPaise };
      })();

      const paymentId = 'pay_sub_vendor_' + Date.now().toString(36);
      const signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      mockRazorpayPayment({
        id: paymentId, amount: amountPaise, currency: 'INR',
        status: 'captured', order_id: orderId, refunded: false,
      });

      const res = await request(app)
        .post('/api/v1/monetization/razorpay/verify')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({
          razorpayOrderId: orderId, razorpayPaymentId: paymentId,
          razorpaySignature: signature, planId: vendorPlanId, period: 'MONTHLY',
        });

      expect(res.body.data.subscription.audience).toBe('VENDOR');

      const vendor = await prisma.vendor.findUnique({ where: { userId: vendorUserId } });
      expect(vendor?.subscriptionStatus).toBe('ACTIVE');
      expect(vendor?.suspendedAt).toBeNull();

      createdIds.subscriptions.push(res.body.data.subscription.id);
      createdIds.invoices.push(res.body.data.invoice.id);
    });

    it('activates creator subscription and updates creator profile', async () => {
      const { orderId, amountPaise } = await (async () => {
        const orderAmount = 14900;
        const oId = 'order_sub_creator_' + Date.now().toString(36);
        mockOrdersCreate.mockResolvedValueOnce({
          id: oId, amount: orderAmount, currency: 'INR',
          receipt: `PS-${Date.now().toString(36).toUpperCase()}`,
          status: 'created',
        });
        const res = await request(app)
          .post('/api/v1/monetization/razorpay/order')
          .set('Authorization', `Bearer ${creatorToken}`)
          .send({ planId: creatorPlanId, period: 'MONTHLY' });
        createdIds.transactions.push(res.body.data.transactionId);
        return { orderId: res.body.data.orderId, amountPaise: res.body.data.amountPaise };
      })();

      const paymentId = 'pay_sub_creator_' + Date.now().toString(36);
      const signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      mockRazorpayPayment({
        id: paymentId, amount: amountPaise, currency: 'INR',
        status: 'captured', order_id: orderId, refunded: false,
      });

      const res = await request(app)
        .post('/api/v1/monetization/razorpay/verify')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({
          razorpayOrderId: orderId, razorpayPaymentId: paymentId,
          razorpaySignature: signature, planId: creatorPlanId, period: 'MONTHLY',
        });

      expect(res.body.data.subscription.audience).toBe('CREATOR');

      const creator = await prisma.creatorProfile.findUnique({ where: { userId: creatorUserId } });
      expect(creator?.membershipPlanId).toBe(creatorPlanId);
      expect(creator?.membershipExpiresAt).toBeInstanceOf(Date);

      createdIds.subscriptions.push(res.body.data.subscription.id);
      createdIds.invoices.push(res.body.data.invoice.id);
    });

    it('creates invoice upon successful payment', async () => {
      const { orderId, amountPaise } = await (async () => {
        const orderAmount = 39900;
        const oId = 'order_inv_' + Date.now().toString(36);
        mockOrdersCreate.mockResolvedValueOnce({
          id: oId, amount: orderAmount, currency: 'INR',
          receipt: `PS-${Date.now().toString(36).toUpperCase()}`,
          status: 'created',
        });
        const res = await request(app)
          .post('/api/v1/monetization/razorpay/order')
          .set('Authorization', `Bearer ${vendorToken}`)
          .send({ planId: vendorPlanId, period: 'MONTHLY' });
        createdIds.transactions.push(res.body.data.transactionId);
        return { orderId: res.body.data.orderId, amountPaise: res.body.data.amountPaise };
      })();

      const paymentId = 'pay_inv_' + Date.now().toString(36);
      const signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      mockRazorpayPayment({
        id: paymentId, amount: amountPaise, currency: 'INR',
        status: 'captured', order_id: orderId, refunded: false,
      });

      const res = await request(app)
        .post('/api/v1/monetization/razorpay/verify')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({
          razorpayOrderId: orderId, razorpayPaymentId: paymentId,
          razorpaySignature: signature, planId: vendorPlanId, period: 'MONTHLY',
        });

      expect(res.body.data.invoice).toBeDefined();
      expect(res.body.data.invoice.amountPaise).toBe(amountPaise);
      expect(res.body.data.invoice.transactionId).toBe(res.body.data.transaction.id);

      createdIds.subscriptions.push(res.body.data.subscription.id);
      createdIds.invoices.push(res.body.data.invoice.id);
    });

    it('cancels prior active subscription for same audience on new activation', async () => {
      const { orderId: oId1, amountPaise: amt1 } = await (async () => {
        const oId = 'order_cancel_1_' + Date.now().toString(36);
        mockOrdersCreate.mockResolvedValueOnce({
          id: oId, amount: 39900, currency: 'INR',
          receipt: `PS-${Date.now().toString(36).toUpperCase()}`,
          status: 'created',
        });
        const res = await request(app)
          .post('/api/v1/monetization/razorpay/order')
          .set('Authorization', `Bearer ${vendorToken}`)
          .send({ planId: vendorPlanId, period: 'MONTHLY' });
        createdIds.transactions.push(res.body.data.transactionId);
        return { orderId: res.body.data.orderId, amountPaise: res.body.data.amountPaise };
      })();

      const pId1 = 'pay_cancel_1_' + Date.now().toString(36);
      const sig1 = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
        .update(`${oId1}|${pId1}`).digest('hex');
      mockRazorpayPayment({
        id: pId1, amount: amt1, currency: 'INR',
        status: 'captured', order_id: oId1, refunded: false,
      });

      const sub1 = await request(app)
        .post('/api/v1/monetization/razorpay/verify')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({
          razorpayOrderId: oId1, razorpayPaymentId: pId1,
          razorpaySignature: sig1, planId: vendorPlanId, period: 'MONTHLY',
        });
      createdIds.subscriptions.push(sub1.body.data.subscription.id);
      createdIds.invoices.push(sub1.body.data.invoice.id);

      const { orderId: oId2, amountPaise: amt2 } = await (async () => {
        const oId = 'order_cancel_2_' + Date.now().toString(36);
        mockOrdersCreate.mockResolvedValueOnce({
          id: oId, amount: 39900, currency: 'INR',
          receipt: `PS-${Date.now().toString(36).toUpperCase()}`,
          status: 'created',
        });
        const res = await request(app)
          .post('/api/v1/monetization/razorpay/order')
          .set('Authorization', `Bearer ${vendorToken}`)
          .send({ planId: vendorPlanId, period: 'MONTHLY' });
        createdIds.transactions.push(res.body.data.transactionId);
        return { orderId: res.body.data.orderId, amountPaise: res.body.data.amountPaise };
      })();

      const pId2 = 'pay_cancel_2_' + Date.now().toString(36);
      const sig2 = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
        .update(`${oId2}|${pId2}`).digest('hex');
      mockRazorpayPayment({
        id: pId2, amount: amt2, currency: 'INR',
        status: 'captured', order_id: oId2, refunded: false,
      });

      const sub2 = await request(app)
        .post('/api/v1/monetization/razorpay/verify')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({
          razorpayOrderId: oId2, razorpayPaymentId: pId2,
          razorpaySignature: sig2, planId: vendorPlanId, period: 'MONTHLY',
        });
      createdIds.subscriptions.push(sub2.body.data.subscription.id);
      createdIds.invoices.push(sub2.body.data.invoice.id);

      const cancelledSub = await prisma.userSubscription.findUnique({
        where: { id: sub1.body.data.subscription.id },
      });
      expect(cancelledSub?.status).toBe('CANCELLED');
      expect(cancelledSub?.cancelledAt).toBeInstanceOf(Date);
    });

    it('redeems coupon on successful payment', async () => {
      await createCoupon({ type: 'PERCENTAGE', value: 30, maxDiscount: 20000 });
      const coupon = await prisma.coupon.findFirst({ where: { id: createdIds.coupons[0] } });

      const { orderId, amountPaise } = await (async () => {
        const orderAmount = 39900;
        const discountedAmount = Math.max(0, orderAmount - Math.min(20000, orderAmount * 30 / 100));
        const oId = 'order_cpn_' + Date.now().toString(36);
        mockOrdersCreate.mockResolvedValueOnce({
          id: oId, amount: discountedAmount, currency: 'INR',
          receipt: `PS-${Date.now().toString(36).toUpperCase()}`,
          status: 'created',
        });
        const res = await request(app)
          .post('/api/v1/monetization/razorpay/order')
          .set('Authorization', `Bearer ${vendorToken}`)
          .send({ planId: vendorPlanId, period: 'MONTHLY', couponCode: coupon!.code });
        createdIds.transactions.push(res.body.data.transactionId);
        return { orderId: res.body.data.orderId, amountPaise: res.body.data.amountPaise };
      })();

      const paymentId = 'pay_cpn_' + Date.now().toString(36);
      const sig = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
        .update(`${orderId}|${paymentId}`).digest('hex');

      mockRazorpayPayment({
        id: paymentId, amount: amountPaise, currency: 'INR',
        status: 'captured', order_id: orderId, refunded: false,
      });

      const res = await request(app)
        .post('/api/v1/monetization/razorpay/verify')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({
          razorpayOrderId: orderId, razorpayPaymentId: paymentId,
          razorpaySignature: sig, planId: vendorPlanId, period: 'MONTHLY',
        });

      expect(res.status).toBe(200);

      const redemption = await prisma.couponRedemption.findFirst({
        where: { couponId: coupon!.id, userId: vendorUserId },
      });
      expect(redemption).toBeDefined();

      const updatedCoupon = await prisma.coupon.findUnique({ where: { id: coupon!.id } });
      expect(updatedCoupon?.usedCount).toBe(1);

      createdIds.subscriptions.push(res.body.data.subscription.id);
      createdIds.invoices.push(res.body.data.invoice.id);
    });

    it('lists my transactions after purchase', async () => {
      const { orderId, amountPaise } = await (async () => {
        const oId = 'order_list_tx_' + Date.now().toString(36);
        mockOrdersCreate.mockResolvedValueOnce({
          id: oId, amount: 39900, currency: 'INR',
          receipt: `PS-${Date.now().toString(36).toUpperCase()}`,
          status: 'created',
        });
        const res = await request(app)
          .post('/api/v1/monetization/razorpay/order')
          .set('Authorization', `Bearer ${vendorToken}`)
          .send({ planId: vendorPlanId, period: 'MONTHLY' });
        createdIds.transactions.push(res.body.data.transactionId);
        return { orderId: res.body.data.orderId, amountPaise: res.body.data.amountPaise };
      })();

      const paymentId = 'pay_list_tx_' + Date.now().toString(36);
      const sig = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
        .update(`${orderId}|${paymentId}`).digest('hex');
      mockRazorpayPayment({
        id: paymentId, amount: amountPaise, currency: 'INR',
        status: 'captured', order_id: orderId, refunded: false,
      });

      await request(app)
        .post('/api/v1/monetization/razorpay/verify')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({
          razorpayOrderId: orderId, razorpayPaymentId: paymentId,
          razorpaySignature: sig, planId: vendorPlanId, period: 'MONTHLY',
        });

      const listRes = await request(app)
        .get('/api/v1/monetization/transactions/me')
        .set('Authorization', `Bearer ${vendorToken}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);
      expect(listRes.body.pagination).toBeDefined();
    });
  });
});
