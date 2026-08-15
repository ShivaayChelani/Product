import crypto from 'crypto';
import {
  PlanAudience,
  PlanBillingPeriod,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  Role,
  RoleAssignmentStatus,
  SubscriptionStatus,
  VendorSubscriptionStatus,
} from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError, ErrorCodes } from '../../shared/utils/ApiError';
import { logger } from '../../config/logger';
import { plansService } from './plans.service';
import { couponsService } from './coupons.service';
import { subscriptionAuditService } from './subscription-audit.service';
import { LEGACY_PLAN_SLUGS, PUBLIC_LAUNCH_SLUGS, planCatalogService } from './plan-catalog.service';
import {
  grantDurationDays,
  isGrantableVendorPlan,
  periodForGrantDuration,
  resolveGrantPeriodEnd,
} from './grant-subscription';

let _razorpayMock: any = null;

function razorpayConfigured() {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

function getRazorpay() {
  if (_razorpayMock) return _razorpayMock;
  if (!razorpayConfigured()) {
    throw new ApiError(503, 'Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
  }
  // Lazy require so server boots without the package until installed
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Razorpay = require('razorpay');
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

/** Test-only seam to inject a mock Razorpay instance. */
export function _setRazorpayMock(instance: any) {
  _razorpayMock = instance;
}

function periodDays(period: PlanBillingPeriod): number {
  if (period === PlanBillingPeriod.QUARTERLY) return 90;
  if (period === PlanBillingPeriod.SEMIANNUAL) return 180;
  if (period === PlanBillingPeriod.YEARLY) return 365;
  if (period === PlanBillingPeriod.LIFETIME) return 36500;
  return 30;
}

function receiptNumber() {
  return `PS-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function invoiceNumber() {
  return `INV-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function isVendorAccount(user: {
  permission: Role;
  vendor: { id: string } | null;
  userRoles: Array<{ role: Role; status: RoleAssignmentStatus }>;
}): boolean {
  if (user.vendor) return true;
  if (user.permission === Role.VENDOR) return true;
  return user.userRoles.some(
    (r) =>
      r.role === Role.VENDOR &&
      (r.status === RoleAssignmentStatus.APPROVED || r.status === RoleAssignmentStatus.ACTIVE),
  );
}

export const paymentsService = {
  async createRazorpayOrder(userId: string, planId: string, period: PlanBillingPeriod, couponCode?: string) {
    const plan = await plansService.getById(planId);
    if (plan.status !== 'ACTIVE') throw new ApiError(400, 'This plan is not available for purchase');
    const allowedSlugs = PUBLIC_LAUNCH_SLUGS[plan.audience];
    const isLegacy = (LEGACY_PLAN_SLUGS as readonly string[]).includes(plan.slug);
    const outsideLaunchCatalog = Boolean(allowedSlugs && !allowedSlugs.includes(plan.slug));
    if (isLegacy || (outsideLaunchCatalog && process.env.NODE_ENV !== 'test')) {
      throw new ApiError(400, 'This plan is not available for purchase');
    }

    const price = plan.prices.find((p) => p.period === period && p.isActive);
    if (!price) throw new ApiError(400, 'Selected billing period is not available for this plan');

    let amountPaise = price.amountPaise;
    let couponId: string | undefined;
    let discountPaise = 0;

    if (couponCode) {
      const { coupon, discount } = await couponsService.validate(couponCode, userId, price.amountPaise);
      discountPaise = Math.round(discount);
      amountPaise = Math.max(0, price.amountPaise - discountPaise);
      couponId = coupon.id;
    }

    if (amountPaise === 0) {
      // 100% free / fully discounted! Activate subscription immediately.
      let subscription: any;
      let txRecord: any;

      await prisma.$transaction(async (tx) => {
        subscription = await this.activateSubscription({
          userId,
          planId,
          audience: plan.audience,
          period,
          provider: PaymentProvider.RAZORPAY,
          amountPaise: 0,
          currency: price.currency || 'INR',
        });

        txRecord = await tx.paymentTransaction.create({
          data: {
            userId,
            provider: PaymentProvider.RAZORPAY,
            status: PaymentStatus.CAPTURED,
            amountPaise: 0,
            currency: price.currency || 'INR',
            description: `${plan.name} (${period}) - 100% Coupon Applied`,
            receiptNumber: receiptNumber(),
            paidAt: new Date(),
            subscriptionId: subscription.id,
            rawPayload: {
              appliedCouponCode: couponCode,
              discountPaise,
              free: true,
            } as any,
          },
        });

        if (couponId) {
          await tx.couponRedemption.create({
            data: {
              couponId,
              userId,
              orderRef: txRecord.id,
            },
          });

          await tx.coupon.update({
            where: { id: couponId },
            data: { usedCount: { increment: 1 } },
          });
        }
      }, { timeout: 15000 });

      const invoice = await this.createInvoice(userId, txRecord.id);

      return {
        free: true,
        subscription,
        transaction: txRecord,
        invoice,
        plan: { id: plan.id, name: plan.name, audience: plan.audience, period },
      };
    }

    const razorpay = getRazorpay();
    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: price.currency || 'INR',
      receipt: receiptNumber(),
      notes: {
        userId,
        planId,
        period,
        audience: plan.audience,
      },
    });

    const tx = await prisma.paymentTransaction.create({
      data: {
        userId,
        provider: PaymentProvider.RAZORPAY,
        status: PaymentStatus.PENDING,
        amountPaise,
        currency: price.currency || 'INR',
        description: `${plan.name} (${period})`,
        providerOrderId: order.id,
        receiptNumber: order.receipt || receiptNumber(),
        rawPayload: {
          ...order,
          appliedCouponCode: couponCode,
          discountPaise,
        } as any,
      },
    });

    return {
      orderId: order.id,
      amountPaise,
      currency: price.currency || 'INR',
      keyId: process.env.RAZORPAY_KEY_ID,
      transactionId: tx.id,
      plan: { id: plan.id, name: plan.name, audience: plan.audience, period },
    };
  },

  verifyRazorpaySignature(orderId: string, paymentId: string, signature: string) {
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) throw new ApiError(503, 'Razorpay is not configured');
    const body = `${orderId}|${paymentId}`;
    const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
    if (expected !== signature) {
      throw new ApiError(400, 'Invalid payment signature');
    }
  },

  async confirmRazorpayPayment(
    userId: string,
    input: {
      razorpayOrderId: string;
      razorpayPaymentId: string;
      razorpaySignature: string;
      planId: string;
      period: PlanBillingPeriod;
    },
  ) {
    this.verifyRazorpaySignature(
      input.razorpayOrderId,
      input.razorpayPaymentId,
      input.razorpaySignature,
    );

    // Idempotency check — skip network call if already processed
    const existing = await prisma.paymentTransaction.findFirst({
      where: { providerPaymentId: input.razorpayPaymentId },
    });
    if (existing?.status === PaymentStatus.CAPTURED) {
      return { alreadyProcessed: true, transaction: existing };
    }

    // Look up the pending order
    const pending = await prisma.paymentTransaction.findFirst({
      where: {
        userId,
        providerOrderId: input.razorpayOrderId,
        provider: PaymentProvider.RAZORPAY,
      },
    });
    if (!pending) throw new ApiError(404, 'Payment order not found');

    const notes = ((pending.rawPayload as any)?.notes || {}) as Record<string, string>;
    const planId = notes.planId || input.planId;
    const period = (notes.period || input.period) as PlanBillingPeriod;
    if (notes.userId && notes.userId !== userId) {
      throw new ApiError(403, 'Payment order does not belong to this user');
    }
    if (notes.planId && notes.planId !== input.planId) {
      throw new ApiError(400, 'Plan mismatch. Amount is determined by the server order, not the client.');
    }
    if (notes.period && notes.period !== input.period) {
      throw new ApiError(400, 'Billing period mismatch.');
    }

    // Fetch authoritative payment details from Razorpay
    const razorpay = getRazorpay();
    const payment = await razorpay.payments.fetch(input.razorpayPaymentId);

    // Validate all payment integrity checks
    this.validateRazorpayPayment(payment, pending);

    // Process everything in a single atomic transaction
    let subscription: any;
    let transaction: any;
    try {
      const result = await prisma.$transaction(async (tx) => {
        return this.processSuccessfulPayment(tx, {
          userId,
          planId,
          period,
          provider: PaymentProvider.RAZORPAY,
          providerPaymentId: input.razorpayPaymentId,
          providerSignature: input.razorpaySignature,
          pendingId: pending.id,
          amountPaise: pending.amountPaise,
          currency: pending.currency,
          couponCode: (pending.rawPayload as any)?.appliedCouponCode as string | undefined,
        });
      }, { timeout: 15000 });
      subscription = result.subscription;
      transaction = result.transaction;
    } catch (err: any) {
      // Unique constraint violation — a concurrent request already processed this payment
      if (err?.code === 'P2002') {
        const already = await prisma.paymentTransaction.findFirst({
          where: { providerPaymentId: input.razorpayPaymentId },
        });
        if (already?.status === PaymentStatus.CAPTURED) {
          return { alreadyProcessed: true, transaction: already };
        }
      }
      throw err;
    }

    // Invoice is a non-critical downstream task — safe to run after commit
    const invoice = await this.createInvoice(userId, transaction.id);

    return { alreadyProcessed: false, subscription, transaction, invoice };
  },

  validateRazorpayPayment(payment: { status: string; amount: number; currency: string; order_id: string; refunded: boolean; id: string }, pending: { amountPaise: number; currency: string; providerOrderId: string | null }) {
    if (payment.status !== 'captured') {
      throw new ApiError(400, `Payment is not captured. Current status: ${payment.status}`);
    }
    if (payment.amount !== pending.amountPaise) {
      logger.warn({ paymentId: payment.id, expectedAmount: pending.amountPaise, receivedAmount: payment.amount }, 'Payment amount mismatch');
      throw new ApiError(400, `Payment amount mismatch. Expected ${pending.amountPaise}, received ${payment.amount}.`);
    }
    if (payment.currency !== pending.currency) {
      throw new ApiError(400, `Currency mismatch. Expected ${pending.currency}, received ${payment.currency}.`);
    }
    if (payment.order_id !== pending.providerOrderId) {
      throw new ApiError(400, `Order mismatch. Expected ${pending.providerOrderId}, received ${payment.order_id}.`);
    }
    if (payment.refunded === true) {
      logger.warn({ paymentId: payment.id }, 'Refunded payment used for activation attempt');
      throw new ApiError(400, 'Payment has been refunded');
    }
  },

  async processSuccessfulPayment(
    tx: Prisma.TransactionClient,
    params: {
      userId: string;
      planId: string;
      period: PlanBillingPeriod;
      provider: PaymentProvider;
      providerPaymentId?: string;
      providerSignature?: string;
      pendingId: string;
      amountPaise: number;
      currency: string;
      couponCode?: string;
    },
  ) {
    const plan = await plansService.getById(params.planId);
    const start = new Date();
    const days = periodDays(params.period);
    const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
    const graceEndsAt = new Date(end.getTime() + plan.gracePeriodDays * 24 * 60 * 60 * 1000);

    // Cancel any prior live subscription for the same audience
    await tx.userSubscription.updateMany({
      where: {
        userId: params.userId,
        audience: plan.audience,
        status: { in: ['ACTIVE', 'TRIALING', 'GRACE', 'PAST_DUE'] },
      },
      data: { status: SubscriptionStatus.CANCELLED, cancelledAt: start },
    });

    // Create the new active subscription
    const subscription = await tx.userSubscription.create({
      data: {
        userId: params.userId,
        planId: params.planId,
        audience: plan.audience,
        status: SubscriptionStatus.ACTIVE,
        billingPeriod: params.period,
        provider: params.provider,
        providerSubscriptionId: params.providerPaymentId ?? null,
        currentPeriodStart: start,
        currentPeriodEnd: end,
        graceEndsAt,
        autoRenew: true,
      },
      include: { plan: true },
    });

    // Update vendor subscription status
    if (plan.audience === PlanAudience.VENDOR) {
      await tx.vendor.updateMany({
        where: { userId: params.userId },
        data: {
          subscriptionStatus: VendorSubscriptionStatus.ACTIVE,
          suspendedAt: null,
        },
      });
    }

    // Update creator membership
    if (plan.audience === PlanAudience.CREATOR) {
      const features = (plan.features as Record<string, unknown>) || {};
      await tx.creatorProfile.updateMany({
        where: { userId: params.userId },
        data: {
          membershipPlanId: plan.id,
          membershipExpiresAt: end,
          uploadLimit: typeof features.uploadLimit === 'number' ? features.uploadLimit : null,
        },
      });
    }

    // Mark the pending transaction as captured
    const transaction = await tx.paymentTransaction.update({
      where: { id: params.pendingId },
      data: {
        status: PaymentStatus.CAPTURED,
        providerPaymentId: params.providerPaymentId,
        providerSignature: params.providerSignature,
        subscriptionId: subscription.id,
        paidAt: new Date(),
      },
    });

    // Redeem coupon if one was applied during order creation
    if (params.couponCode) {
      const coupon = await tx.coupon.findUnique({
        where: { code: params.couponCode.toUpperCase() },
      });
      if (coupon) {
        await tx.couponRedemption.create({
          data: {
            couponId: coupon.id,
            userId: params.userId,
            orderRef: transaction.id,
          },
        });
        await tx.coupon.update({
          where: { id: coupon.id },
          data: { usedCount: { increment: 1 } },
        });
      }
    }

    // Write audit log inside the transaction
    await tx.subscriptionAuditLog.create({
      data: {
        actorId: params.userId,
        action: 'SUBSCRIPTION_ACTIVATED',
        entityType: 'UserSubscription',
        entityId: subscription.id,
        after: {
          planId: params.planId,
          audience: plan.audience,
          period: params.period,
          provider: params.provider,
          expiresAt: end.toISOString(),
        } as any,
      },
    });

    return { subscription, transaction };
  },

  async activateSubscription(params: {
    userId: string;
    planId: string;
    audience: PlanAudience;
    period: PlanBillingPeriod;
    provider: PaymentProvider;
    providerPaymentId?: string;
    providerSubscriptionId?: string;
    amountPaise?: number;
    currency?: string;
    daysOverride?: number;
    preserveAtLeastUntil?: Date | null;
    autoRenew?: boolean;
    skipActivationAudit?: boolean;
    actorId?: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    const plan = await plansService.getById(params.planId);
    const start = new Date();
    const days = params.daysOverride ?? periodDays(params.period);
    const end = resolveGrantPeriodEnd(start, days, params.preserveAtLeastUntil ?? null);
    const graceEndsAt = new Date(end.getTime() + plan.gracePeriodDays * 24 * 60 * 60 * 1000);

    // End prior live subscription for same audience
    await prisma.userSubscription.updateMany({
      where: {
        userId: params.userId,
        audience: params.audience,
        status: { in: ['ACTIVE', 'TRIALING', 'GRACE', 'PAST_DUE'] },
      },
      data: { status: SubscriptionStatus.CANCELLED, cancelledAt: start },
    });

    const subscription = await prisma.userSubscription.create({
      data: {
        userId: params.userId,
        planId: params.planId,
        audience: params.audience,
        status: SubscriptionStatus.ACTIVE,
        billingPeriod: params.period,
        provider: params.provider,
        providerSubscriptionId: params.providerSubscriptionId ?? params.providerPaymentId ?? null,
        currentPeriodStart: start,
        currentPeriodEnd: end,
        graceEndsAt,
        autoRenew: params.autoRenew ?? true,
        metadata: params.metadata ?? undefined,
      },
      include: { plan: true },
    });

    if (params.audience === PlanAudience.VENDOR) {
      await prisma.vendor.updateMany({
        where: { userId: params.userId },
        data: {
          subscriptionStatus: VendorSubscriptionStatus.ACTIVE,
          suspendedAt: null,
        },
      });
    }

    if (params.audience === PlanAudience.CREATOR) {
      const features = (plan.features as Record<string, unknown>) || {};
      await prisma.creatorProfile.updateMany({
        where: { userId: params.userId },
        data: {
          membershipPlanId: plan.id,
          membershipExpiresAt: end,
          uploadLimit: typeof features.uploadLimit === 'number' ? features.uploadLimit : null,
        },
      });
    }

    if (!params.skipActivationAudit) {
      await subscriptionAuditService.log({
        actorId: params.actorId ?? params.userId,
        action: 'SUBSCRIPTION_ACTIVATED',
        entityType: 'UserSubscription',
        entityId: subscription.id,
        after: {
          planId: params.planId,
          audience: params.audience,
          period: params.period,
          provider: params.provider,
          expiresAt: end.toISOString(),
        },
      });
    }

    return subscription;
  },

  async createInvoice(userId: string, transactionId: string) {
    const tx = await prisma.paymentTransaction.findUnique({ where: { id: transactionId } });
    if (!tx) throw new ApiError(404, 'Transaction not found');

    const existing = await prisma.invoice.findUnique({ where: { transactionId } });
    if (existing) return existing;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { vendor: true },
    });

    return prisma.invoice.create({
      data: {
        userId,
        transactionId,
        invoiceNumber: invoiceNumber(),
        amountPaise: tx.amountPaise,
        taxPaise: 0,
        currency: tx.currency,
        gstNumber: user?.vendor?.gstNumber ?? null,
        billingName: user?.vendor?.businessName || user?.name || null,
        billingAddress: user?.vendor
          ? `${user.vendor.address}, ${user.vendor.city}, ${user.vendor.state}`
          : null,
        lineItems: [
          {
            description: tx.description || 'Subscription',
            amountPaise: tx.amountPaise,
          },
        ] as Prisma.InputJsonValue,
      },
    });
  },

  async listTransactions(filters: {
    userId?: string;
    page?: number;
    limit?: number;
    status?: PaymentStatus;
  }) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    const where: Prisma.PaymentTransactionWhereInput = {};
    if (filters.userId) where.userId = filters.userId;
    if (filters.status) where.status = filters.status;

    const [data, total] = await Promise.all([
      prisma.paymentTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          invoice: true,
          subscription: { include: { plan: true } },
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.paymentTransaction.count({ where }),
    ]);

    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  },

  async listInvoices(userId: string, page = 1, limit = 20) {
    const take = Math.min(limit, 100);
    const [data, total] = await Promise.all([
      prisma.invoice.findMany({
        where: { userId },
        orderBy: { issuedAt: 'desc' },
        skip: (page - 1) * take,
        take,
        include: { transaction: true },
      }),
      prisma.invoice.count({ where: { userId } }),
    ]);
    return { data, pagination: { page, limit: take, total, totalPages: Math.ceil(total / take) } };
  },

  async listRefunds(page = 1, limit = 20) {
    const take = Math.min(limit, 100);
    const [data, total] = await Promise.all([
      prisma.refund.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * take,
        take,
        include: {
          transaction: { select: { id: true, userId: true, amountPaise: true, provider: true, status: true } },
        },
      }),
      prisma.refund.count(),
    ]);
    return { data, pagination: { page, limit: take, total, totalPages: Math.ceil(total / take) } };
  },

  async getAdminGrantContext(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        vendor: {
          select: {
            id: true,
            businessName: true,
            status: true,
            subscriptionStatus: true,
          },
        },
        userRoles: { select: { role: true, status: true } },
      },
    });
    if (!user) throw new ApiError(404, 'User not found');
    if (!isVendorAccount(user)) {
      throw new ApiError(400, 'Subscriptions can only be granted to vendor accounts');
    }

    const [plans, current] = await Promise.all([
      prisma.subscriptionPlan.findMany({
        where: {
          audience: PlanAudience.VENDOR,
          status: 'ACTIVE',
          slug: { in: [...(PUBLIC_LAUNCH_SLUGS.VENDOR ?? [])] },
        },
        include: {
          prices: { where: { isActive: true }, orderBy: { period: 'asc' } },
          limits: { orderBy: { sortOrder: 'asc' } },
          permissions: true,
          featureAssignments: { orderBy: { sortOrder: 'asc' }, include: { feature: true } },
          highlights: true,
          faqs: { orderBy: { sortOrder: 'asc' } },
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      prisma.userSubscription.findFirst({
        where: {
          userId,
          audience: PlanAudience.VENDOR,
          status: { in: ['ACTIVE', 'TRIALING', 'GRACE', 'PAST_DUE'] },
        },
        orderBy: { currentPeriodEnd: 'desc' },
        include: { plan: { select: { id: true, name: true, slug: true } } },
      }),
    ]);

    return {
      vendor: {
        userId: user.id,
        name: user.name,
        email: user.email,
        businessName: user.vendor?.businessName ?? null,
        vendorStatus: user.vendor?.status ?? null,
        subscriptionStatus: user.vendor?.subscriptionStatus ?? current?.status ?? 'NONE',
      },
      currentSubscription: current
        ? {
            id: current.id,
            planId: current.planId,
            planName: current.plan.name,
            planSlug: current.plan.slug,
            status: current.status,
            currentPeriodStart: current.currentPeriodStart,
            currentPeriodEnd: current.currentPeriodEnd,
            provider: current.provider,
          }
        : null,
      plans: plans.map((p) => planCatalogService.formatPlanForClient(p as any)),
    };
  },

  async adminGrant(
    adminUserId: string,
    input: {
      userId: string;
      planId: string;
      durationMonths: 1 | 3 | 6 | 12;
      reason?: string;
      confirmReplace?: boolean;
    },
  ) {
    const plan = await plansService.getById(input.planId);
    if (!isGrantableVendorPlan(plan)) {
      if (plan.status !== 'ACTIVE') throw new ApiError(400, 'This plan is not active and cannot be granted');
      if (plan.audience !== PlanAudience.VENDOR) throw new ApiError(400, 'Only vendor plans can be granted with this action');
      throw new ApiError(400, 'Only canonical vendor plans can be granted');
    }

    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      include: {
        vendor: { select: { id: true } },
        userRoles: { select: { role: true, status: true } },
      },
    });
    if (!user) throw new ApiError(404, 'User not found');
    if (!isVendorAccount(user)) {
      throw new ApiError(400, 'Cannot grant a vendor plan to a non-vendor account');
    }

    const existing = await prisma.userSubscription.findFirst({
      where: {
        userId: input.userId,
        audience: PlanAudience.VENDOR,
        status: { in: ['ACTIVE', 'TRIALING', 'GRACE', 'PAST_DUE'] },
      },
      orderBy: { currentPeriodEnd: 'desc' },
      include: { plan: { select: { id: true, name: true, slug: true } } },
    });

    if (existing && !input.confirmReplace) {
      throw new ApiError(
        409,
        'Vendor already has an active subscription. Confirm replacement to continue.',
        true,
        ErrorCodes.ACTIVE_SUBSCRIPTION_EXISTS,
        {
          current: {
            planId: existing.planId,
            planName: existing.plan.name,
            planSlug: existing.plan.slug,
            status: existing.status,
            currentPeriodEnd: existing.currentPeriodEnd.toISOString(),
          },
        },
      );
    }

    const period = periodForGrantDuration(input.durationMonths);
    const days = grantDurationDays(input.durationMonths);
    const now = new Date();
    const periodEnd = resolveGrantPeriodEnd(now, days, existing?.currentPeriodEnd ?? null);

    const subscription = await this.activateSubscription({
      userId: input.userId,
      planId: plan.id,
      audience: PlanAudience.VENDOR,
      period,
      provider: PaymentProvider.ADMIN_GRANT,
      daysOverride: days,
      preserveAtLeastUntil: existing?.currentPeriodEnd ?? null,
      autoRenew: false,
      skipActivationAudit: true,
      actorId: adminUserId,
      metadata: {
        source: 'ADMIN_GRANT',
        grantedBy: adminUserId,
        durationMonths: input.durationMonths,
        reason: input.reason ?? null,
      },
    });

    await subscriptionAuditService.log({
      actorId: adminUserId,
      action: 'SUBSCRIPTION_GRANTED',
      entityType: 'UserSubscription',
      entityId: subscription.id,
      before: existing
        ? {
            subscriptionId: existing.id,
            planId: existing.planId,
            planName: existing.plan.name,
            currentPeriodEnd: existing.currentPeriodEnd.toISOString(),
            status: existing.status,
          }
        : null,
      after: {
        adminId: adminUserId,
        vendorUserId: input.userId,
        planId: plan.id,
        planSlug: plan.slug,
        durationMonths: input.durationMonths,
        startDate: subscription.currentPeriodStart.toISOString(),
        expiryDate: subscription.currentPeriodEnd.toISOString(),
        reason: input.reason ?? null,
        action: 'SUBSCRIPTION_GRANTED',
        replacedSubscriptionId: existing?.id ?? null,
      },
    });

    return {
      subscription,
      replaced: Boolean(existing),
      periodEnd: periodEnd.toISOString(),
    };
  },

  async handleRazorpayWebhook(rawBody: Buffer | string, signature: string | undefined) {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) throw new ApiError(503, 'RAZORPAY_WEBHOOK_SECRET is not configured');
    if (!signature) throw new ApiError(401, 'Missing webhook signature');

    const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
    if (expected !== signature) throw new ApiError(401, 'Invalid webhook signature');

    const payload = JSON.parse(body) as {
      event: string;
      payload?: { payment?: { entity?: any }; order?: { entity?: any } };
    };

    if (payload.event === 'payment.captured') {
      const payment = payload.payload?.payment?.entity;
      if (!payment?.id || !payment?.order_id) return { ignored: true };

      const pending = await prisma.paymentTransaction.findFirst({
        where: { providerOrderId: payment.order_id, provider: PaymentProvider.RAZORPAY },
      });
      if (!pending) return { ignored: true, reason: 'order_not_found' };

      // Idempotency: if already captured (by verify endpoint or prior webhook), skip
      if (pending.providerPaymentId || pending.status === PaymentStatus.CAPTURED) {
        return { ignored: true };
      }

      if (payment.status && payment.status !== 'captured') {
        return { ignored: true, reason: 'not_captured' };
      }
      if (typeof payment.amount === 'number' && payment.amount !== pending.amountPaise) {
        logger.warn({ orderId: payment.order_id, expected: pending.amountPaise, received: payment.amount }, 'Webhook amount mismatch');
        throw new ApiError(400, 'Payment amount mismatch');
      }
      if (payment.currency && payment.currency !== pending.currency) {
        throw new ApiError(400, 'Currency mismatch');
      }

      const notes = {
        ...((pending.rawPayload as any)?.notes || {}),
        ...(payment.notes || {}),
      } as Record<string, string>;
      if (!notes.userId || !notes.planId || !notes.period) {
        return { ignored: true, reason: 'missing_notes' };
      }
      if (notes.userId !== pending.userId) {
        throw new ApiError(403, 'Payment user mismatch');
      }

      let subscription: any;
      let transaction: any;
      try {
        const result = await prisma.$transaction(async (tx) => {
          return this.processSuccessfulPayment(tx, {
            userId: String(notes.userId),
            planId: String(notes.planId),
            period: notes.period as PlanBillingPeriod,
            provider: PaymentProvider.RAZORPAY,
            providerPaymentId: payment.id,
            pendingId: pending.id,
            amountPaise: pending.amountPaise,
            currency: pending.currency,
            couponCode: (pending.rawPayload as any)?.appliedCouponCode as string | undefined,
          });
        }, { timeout: 15000 });
        subscription = result.subscription;
        transaction = result.transaction;
      } catch (err: any) {
        if (err?.code === 'P2002') {
          return { ignored: true, reason: 'already_processed' };
        }
        throw err;
      }

      await this.createInvoice(String(notes.userId), transaction.id);
      return { processed: true, subscription, transaction };
    }

    return { ignored: true, event: payload.event };
  },

  async revenueSummary() {
    const captured = await prisma.paymentTransaction.aggregate({
      where: { status: PaymentStatus.CAPTURED },
      _sum: { amountPaise: true },
      _count: true,
    });
    const refunded = await prisma.paymentTransaction.aggregate({
      where: { status: { in: [PaymentStatus.REFUNDED, PaymentStatus.PARTIALLY_REFUNDED] } },
      _sum: { amountPaise: true },
      _count: true,
    });
    const activeSubs = await prisma.userSubscription.count({
      where: { status: { in: ['ACTIVE', 'TRIALING', 'GRACE'] } },
    });
    return {
      capturedAmountPaise: captured._sum.amountPaise || 0,
      capturedCount: captured._count,
      refundedAmountPaise: refunded._sum.amountPaise || 0,
      refundedCount: refunded._count,
      activeSubscriptions: activeSubs,
    };
  },
};
