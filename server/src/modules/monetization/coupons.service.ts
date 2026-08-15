import { CouponOwnerType, CouponType, Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError } from '../../shared/utils/ApiError';

export const couponsService = {
  async list(filters?: { vendorId?: string | null; ownerType?: CouponOwnerType; q?: string }) {
    const where: Prisma.CouponWhereInput = {};
    if (filters?.vendorId) where.vendorId = filters.vendorId;
    if (filters?.ownerType) where.ownerType = filters.ownerType;
    if (filters?.q) {
      where.OR = [
        { code: { contains: filters.q, mode: 'insensitive' } },
        { description: { contains: filters.q, mode: 'insensitive' } },
      ];
    }
    return prisma.coupon.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { vendor: { select: { id: true, businessName: true } } },
    });
  },

  async create(input: {
    code: string;
    type: CouponType;
    value: number;
    maxDiscount?: number | null;
    minPurchase?: number | null;
    usageLimit?: number | null;
    perUserLimit?: number;
    startsAt?: string | null;
    expiresAt?: string | null;
    description?: string | null;
    isActive?: boolean;
    vendorId?: string | null;
    recipientEmail?: string | null;
  }, ownerType: CouponOwnerType = CouponOwnerType.ADMIN) {
    const existing = await prisma.coupon.findUnique({ where: { code: input.code } });
    if (existing) throw new ApiError(409, 'Coupon code already exists');

    if (input.type === 'PERCENTAGE' && input.value > 100) {
      throw new ApiError(400, 'Percentage coupon cannot exceed 100');
    }

    return prisma.coupon.create({
      data: {
        code: input.code,
        type: input.type,
        ownerType,
        vendorId: input.vendorId ?? null,
        value: input.value,
        maxDiscount: input.maxDiscount ?? null,
        minPurchase: input.minPurchase ?? null,
        usageLimit: input.usageLimit ?? null,
        perUserLimit: input.perUserLimit ?? 1,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        description: input.description ?? null,
        isActive: input.isActive ?? true,
        recipientEmail: input.recipientEmail ?? null,
      },
    });
  },

  async update(id: string, input: Partial<{
    value: number;
    maxDiscount: number | null;
    minPurchase: number | null;
    usageLimit: number | null;
    perUserLimit: number;
    startsAt: string | null;
    expiresAt: string | null;
    description: string | null;
    isActive: boolean;
  }>) {
    const coupon = await prisma.coupon.findUnique({ where: { id } });
    if (!coupon) throw new ApiError(404, 'Coupon not found');

    return prisma.coupon.update({
      where: { id },
      data: {
        ...(input.value !== undefined ? { value: input.value } : {}),
        ...(input.maxDiscount !== undefined ? { maxDiscount: input.maxDiscount } : {}),
        ...(input.minPurchase !== undefined ? { minPurchase: input.minPurchase } : {}),
        ...(input.usageLimit !== undefined ? { usageLimit: input.usageLimit } : {}),
        ...(input.perUserLimit !== undefined ? { perUserLimit: input.perUserLimit } : {}),
        ...(input.startsAt !== undefined ? { startsAt: input.startsAt ? new Date(input.startsAt) : null } : {}),
        ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt ? new Date(input.expiresAt) : null } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
  },

  async remove(id: string) {
    await prisma.coupon.delete({ where: { id } });
    return { deleted: true };
  },

  async validate(
    code: string,
    userId: string,
    purchaseAmount = 0,
    opts?: { platformCheckout?: boolean },
  ) {
    const coupon = await prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
    if (!coupon || !coupon.isActive) throw new ApiError(404, 'Invalid coupon');
    if (opts?.platformCheckout && coupon.ownerType !== CouponOwnerType.ADMIN) {
      throw new ApiError(400, 'This coupon cannot be applied to PalSafar subscriptions');
    }

    if (coupon.recipientEmail) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
      if (!user || user.email.toLowerCase() !== coupon.recipientEmail.toLowerCase()) {
        throw new ApiError(403, 'This coupon is not gifted to you');
      }
    }

    const now = new Date();
    if (coupon.startsAt && coupon.startsAt > now) throw new ApiError(400, 'Coupon is not active yet');
    if (coupon.expiresAt && coupon.expiresAt < now) throw new ApiError(400, 'Coupon has expired');
    if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) {
      throw new ApiError(400, 'Coupon usage limit reached');
    }
    if (coupon.minPurchase != null && purchaseAmount < coupon.minPurchase) {
      throw new ApiError(400, `Minimum purchase of ₹${coupon.minPurchase} required`);
    }
    const userUses = await prisma.couponRedemption.count({
      where: { couponId: coupon.id, userId },
    });
    if (userUses >= coupon.perUserLimit) {
      throw new ApiError(400, 'You have already used this coupon');
    }

    let discount = 0;
    if (coupon.type === 'PERCENTAGE') {
      discount = (purchaseAmount * coupon.value) / 100;
      if (coupon.maxDiscount != null) discount = Math.min(discount, coupon.maxDiscount);
    } else if (coupon.type === 'FLAT') {
      discount = coupon.value;
    }

    return { coupon, discount };
  },
};
