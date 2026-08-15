import { PlanAudience, PlanBillingPeriod, PlanStatus, Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError } from '../../shared/utils/ApiError';
import {
  planCatalogInclude,
  planCatalogService,
  inferCatalogFromLegacyFeatures,
  LEGACY_PLAN_SLUGS,
  PUBLIC_LAUNCH_SLUGS,
} from './plan-catalog.service';

type CreatePlanInput = {
  audience: PlanAudience;
  name: string;
  slug: string;
  description?: string | null;
  badge?: string | null;
  color?: string | null;
  status?: PlanStatus;
  sortOrder?: number;
  features?: Record<string, unknown>;
  trialDays?: number;
  gracePeriodDays?: number;
  iconUrl?: string | null;
  bannerUrl?: string | null;
  promoText?: string | null;
  isMostPopular?: boolean;
  isBestValue?: boolean;
  isRecommended?: boolean;
  scheduledActivateAt?: Date | null;
  scheduledExpireAt?: Date | null;
  googleProductIdMonthly?: string | null;
  googleProductIdYearly?: string | null;
  appleProductIdMonthly?: string | null;
  appleProductIdYearly?: string | null;
  razorpayPlanIdMonthly?: string | null;
  razorpayPlanIdYearly?: string | null;
  prices: Array<{ period: 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'YEARLY' | 'LIFETIME'; amountPaise: number; currency?: string; isActive?: boolean }>;
  catalog?: Parameters<typeof planCatalogService.applyCatalogToPlan>[1];
};

const planInclude = planCatalogInclude;

export const plansService = {
  async ensureDefaultPlans() {
    const specs = await planCatalogService.getDefaultPlansSpec();
    const results = [];

    for (const plan of specs) {
      const existing = await prisma.subscriptionPlan.findUnique({ where: { slug: plan.slug }, include: planInclude });

      if (existing) {
        // Admin configuration is the source of truth — never overwrite prices or limits.
        results.push(existing);
        continue;
      }

      const created = await prisma.subscriptionPlan.create({
        data: {
          audience: plan.audience,
          name: plan.name,
          slug: plan.slug,
          description: plan.description,
          badge: plan.badge,
          color: plan.color,
          status: PlanStatus.ACTIVE,
          sortOrder: plan.sortOrder,
          isMostPopular: plan.isMostPopular ?? false,
          isBestValue: plan.isBestValue ?? false,
          isRecommended: plan.isRecommended ?? false,
          trialDays: 0,
          gracePeriodDays: 3,
          prices: {
            create: plan.prices.map((p) => ({
              period: p.period as PlanBillingPeriod,
              amountPaise: p.amountPaise,
              currency: 'INR',
              isActive: true,
            })),
          },
        },
        include: planInclude,
      });
      await planCatalogService.applyCatalogToPlan(created.id, plan.catalog);
      results.push(await this.getById(created.id));
    }

    await prisma.subscriptionPlan.updateMany({
      where: {
        slug: { in: [...LEGACY_PLAN_SLUGS] },
        status: PlanStatus.ACTIVE,
      },
      data: { status: PlanStatus.INACTIVE },
    });

    return results;
  },

  async list(filters?: { audience?: PlanAudience; status?: PlanStatus; includeInactive?: boolean }) {
    const where: Prisma.SubscriptionPlanWhereInput = {};
    if (filters?.audience) where.audience = filters.audience;
    if (filters?.status) where.status = filters.status;
    else if (!filters?.includeInactive) where.status = { in: [PlanStatus.ACTIVE, PlanStatus.DRAFT] };

    return prisma.subscriptionPlan.findMany({
      where,
      include: planInclude,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  },

  async listPublic(audience: PlanAudience) {
    // Read-only. Do not seed or archive here — that would write to whatever DB the API is using.
    const now = new Date();
    const launchSlugs = PUBLIC_LAUNCH_SLUGS[audience];

    const plans = await prisma.subscriptionPlan.findMany({
      where: {
        audience,
        status: PlanStatus.ACTIVE,
        ...(launchSlugs ? { slug: { in: [...launchSlugs] } } : {}),
        OR: [
          { scheduledActivateAt: null },
          { scheduledActivateAt: { lte: now } },
        ],
        AND: [
          {
            OR: [
              { scheduledExpireAt: null },
              { scheduledExpireAt: { gt: now } },
            ],
          },
        ],
      },
      include: {
        prices: { where: { isActive: true }, orderBy: { period: 'asc' } },
        featureAssignments: { orderBy: { sortOrder: 'asc' }, include: { feature: true } },
        limits: { orderBy: { sortOrder: 'asc' } },
        permissions: true,
        highlights: true,
        faqs: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return plans.map((p) => planCatalogService.formatPlanForClient(p as any));
  },

  async getById(id: string) {
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id },
      include: planInclude,
    });
    if (!plan) throw new ApiError(404, 'Subscription plan not found');
    return plan;
  },

  async create(input: CreatePlanInput) {
    const existing = await prisma.subscriptionPlan.findUnique({ where: { slug: input.slug } });
    if (existing) throw new ApiError(409, 'A plan with this slug already exists');

    const plan = await prisma.subscriptionPlan.create({
      data: {
        audience: input.audience,
        name: input.name,
        slug: input.slug,
        description: input.description ?? null,
        badge: input.badge ?? null,
        color: input.color ?? '#B9834B',
        status: input.status ?? PlanStatus.DRAFT,
        sortOrder: input.sortOrder ?? 0,
        features: (input.features ?? {}) as Prisma.InputJsonValue,
        trialDays: input.trialDays ?? 0,
        gracePeriodDays: input.gracePeriodDays ?? 3,
        iconUrl: input.iconUrl ?? null,
        bannerUrl: input.bannerUrl ?? null,
        promoText: input.promoText ?? null,
        isMostPopular: input.isMostPopular ?? false,
        isBestValue: input.isBestValue ?? false,
        isRecommended: input.isRecommended ?? false,
        scheduledActivateAt: input.scheduledActivateAt ?? null,
        scheduledExpireAt: input.scheduledExpireAt ?? null,
        googleProductIdMonthly: input.googleProductIdMonthly ?? null,
        googleProductIdYearly: input.googleProductIdYearly ?? null,
        appleProductIdMonthly: input.appleProductIdMonthly ?? null,
        appleProductIdYearly: input.appleProductIdYearly ?? null,
        razorpayPlanIdMonthly: input.razorpayPlanIdMonthly ?? null,
        razorpayPlanIdYearly: input.razorpayPlanIdYearly ?? null,
        prices: {
          create: input.prices.map((p) => ({
            period: p.period,
            amountPaise: p.amountPaise,
            currency: p.currency ?? 'INR',
            isActive: p.isActive ?? true,
          })),
        },
      },
      include: planInclude,
    });

    const catalog = input.catalog ?? inferCatalogFromLegacyFeatures(input.audience, input.features ?? {});
    await planCatalogService.applyCatalogToPlan(plan.id, catalog);
    return this.getById(plan.id);
  },

  async update(id: string, input: Partial<CreatePlanInput>) {
    await this.getById(id);

    if (input.slug) {
      const clash = await prisma.subscriptionPlan.findFirst({
        where: { slug: input.slug, NOT: { id } },
      });
      if (clash) throw new ApiError(409, 'A plan with this slug already exists');
    }

    return prisma.$transaction(async (tx) => {
      if (input.prices) {
        await tx.planPrice.deleteMany({ where: { planId: id } });
        await tx.planPrice.createMany({
          data: input.prices.map((p) => ({
            planId: id,
            period: p.period,
            amountPaise: p.amountPaise,
            currency: p.currency ?? 'INR',
            isActive: p.isActive ?? true,
          })),
        });
      }

      const updated = await tx.subscriptionPlan.update({
        where: { id },
        data: {
          ...(input.audience !== undefined ? { audience: input.audience } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.slug !== undefined ? { slug: input.slug } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.badge !== undefined ? { badge: input.badge } : {}),
          ...(input.color !== undefined ? { color: input.color } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          ...(input.features !== undefined ? { features: input.features as Prisma.InputJsonValue } : {}),
          ...(input.trialDays !== undefined ? { trialDays: input.trialDays } : {}),
          ...(input.gracePeriodDays !== undefined ? { gracePeriodDays: input.gracePeriodDays } : {}),
          ...(input.iconUrl !== undefined ? { iconUrl: input.iconUrl } : {}),
          ...(input.bannerUrl !== undefined ? { bannerUrl: input.bannerUrl } : {}),
          ...(input.promoText !== undefined ? { promoText: input.promoText } : {}),
          ...(input.isMostPopular !== undefined ? { isMostPopular: input.isMostPopular } : {}),
          ...(input.isBestValue !== undefined ? { isBestValue: input.isBestValue } : {}),
          ...(input.isRecommended !== undefined ? { isRecommended: input.isRecommended } : {}),
          ...(input.scheduledActivateAt !== undefined ? { scheduledActivateAt: input.scheduledActivateAt } : {}),
          ...(input.scheduledExpireAt !== undefined ? { scheduledExpireAt: input.scheduledExpireAt } : {}),
          ...(input.googleProductIdMonthly !== undefined ? { googleProductIdMonthly: input.googleProductIdMonthly } : {}),
          ...(input.googleProductIdYearly !== undefined ? { googleProductIdYearly: input.googleProductIdYearly } : {}),
          ...(input.appleProductIdMonthly !== undefined ? { appleProductIdMonthly: input.appleProductIdMonthly } : {}),
          ...(input.appleProductIdYearly !== undefined ? { appleProductIdYearly: input.appleProductIdYearly } : {}),
          ...(input.razorpayPlanIdMonthly !== undefined ? { razorpayPlanIdMonthly: input.razorpayPlanIdMonthly } : {}),
          ...(input.razorpayPlanIdYearly !== undefined ? { razorpayPlanIdYearly: input.razorpayPlanIdYearly } : {}),
        },
        include: planInclude,
      });

      if (input.catalog || input.features) {
        const catalog = input.catalog ?? inferCatalogFromLegacyFeatures(
          updated.audience,
          (input.features ?? updated.features ?? {}) as Record<string, unknown>,
        );
        await planCatalogService.applyCatalogToPlan(id, catalog, tx);
      }

      return updated;
    }).then(() => this.getById(id));
  },

  async setStatus(id: string, status: PlanStatus) {
    await this.getById(id);
    return prisma.subscriptionPlan.update({
      where: { id },
      data: { status },
      include: planInclude,
    });
  },

  async duplicate(id: string) {
    const plan = await this.getById(id);
    const slug = `${plan.slug}-copy-${Date.now().toString(36)}`;
    return this.create({
      audience: plan.audience,
      name: `${plan.name} (Copy)`,
      slug,
      description: plan.description,
      badge: plan.badge,
      color: plan.color,
      status: PlanStatus.DRAFT,
      sortOrder: plan.sortOrder + 1,
      features: (plan.features as Record<string, unknown>) ?? {},
      trialDays: plan.trialDays,
      gracePeriodDays: plan.gracePeriodDays,
      googleProductIdMonthly: plan.googleProductIdMonthly,
      googleProductIdYearly: plan.googleProductIdYearly,
      appleProductIdMonthly: plan.appleProductIdMonthly,
      appleProductIdYearly: plan.appleProductIdYearly,
      razorpayPlanIdMonthly: null,
      razorpayPlanIdYearly: null,
      prices: plan.prices.map((p) => ({
        period: p.period,
        amountPaise: p.amountPaise,
        currency: p.currency,
        isActive: p.isActive,
      })),
    });
  },

  async remove(id: string) {
    const activeSubs = await prisma.userSubscription.count({
      where: {
        planId: id,
        status: { in: ['ACTIVE', 'TRIALING', 'GRACE', 'PAST_DUE'] },
      },
    });
    if (activeSubs > 0) {
      throw new ApiError(409, 'Cannot delete a plan with active subscriptions. Deactivate it instead.');
    }
    await prisma.subscriptionPlan.delete({ where: { id } });
    return { deleted: true };
  },

  async sort(orderedIds: string[]) {
    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.subscriptionPlan.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );
    return this.list({ includeInactive: true });
  },
};
