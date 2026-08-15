import { VendorDocumentStatus, VendorDocumentType } from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError } from '../../shared/utils/ApiError';

export const documentsService = {
  async listForVendorUser(userId: string) {
    const vendor = await prisma.vendor.findUnique({ where: { userId } });
    if (!vendor) throw new ApiError(404, 'Vendor profile not found');
    return prisma.vendorDocument.findMany({
      where: { vendorId: vendor.id },
      orderBy: { createdAt: 'desc' },
    });
  },

  async listPendingAdmin(page = 1, limit = 50) {
    const take = Math.min(limit, 100);
    const where = { status: VendorDocumentStatus.PENDING };
    const [data, total] = await Promise.all([
      prisma.vendorDocument.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * take,
        take,
        include: {
          vendor: {
            select: {
              id: true,
              businessName: true,
              city: true,
              status: true,
              user: { select: { id: true, email: true, name: true } },
            },
          },
        },
      }),
      prisma.vendorDocument.count({ where }),
    ]);
    return { data, pagination: { page, limit: take, total, totalPages: Math.ceil(total / take) || 1 } };
  },

  async upload(userId: string, input: { type: VendorDocumentType; fileUrl: string; fileName?: string | null }) {
    const vendor = await prisma.vendor.findUnique({ where: { userId } });
    if (!vendor) throw new ApiError(404, 'Vendor profile not found');

    const doc = await prisma.vendorDocument.create({
      data: {
        vendorId: vendor.id,
        type: input.type,
        fileUrl: input.fileUrl,
        fileName: input.fileName ?? null,
        status: VendorDocumentStatus.PENDING,
      },
    });

    // Keep legacy documents[] in sync for admin list views that still read it
    const urls = Array.from(new Set([...(vendor.documents || []), input.fileUrl]));
    await prisma.vendor.update({
      where: { id: vendor.id },
      data: { documents: urls },
    });

    return doc;
  },

  async review(docId: string, status: VendorDocumentStatus, rejectionReason?: string | null) {
    const doc = await prisma.vendorDocument.findUnique({ where: { id: docId } });
    if (!doc) throw new ApiError(404, 'Document not found');
    if (status === VendorDocumentStatus.PENDING) {
      throw new ApiError(400, 'Invalid review status');
    }

    return prisma.vendorDocument.update({
      where: { id: docId },
      data: {
        status,
        rejectionReason: status === VendorDocumentStatus.APPROVED ? null : (rejectionReason ?? null),
        reviewedAt: new Date(),
      },
    });
  },
};
