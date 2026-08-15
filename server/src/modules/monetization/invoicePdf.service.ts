import PDFDocument from 'pdfkit';
import { prisma } from '../../config/database';
import { ApiError } from '../../shared/utils/ApiError';

export const invoicePdfService = {
  async getOwnedInvoice(userId: string, invoiceOrTxId: string, isAdmin = false) {
    const invoice = await prisma.invoice.findFirst({
      where: {
        OR: [{ id: invoiceOrTxId }, { transactionId: invoiceOrTxId }, { invoiceNumber: invoiceOrTxId }],
        ...(isAdmin ? {} : { userId }),
      },
      include: {
        transaction: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });
    if (!invoice) throw new ApiError(404, 'Invoice not found');
    return invoice;
  },

  async buildPdfBuffer(userId: string, invoiceOrTxId: string, isAdmin = false): Promise<{ buffer: Buffer; filename: string }> {
    const invoice = await this.getOwnedInvoice(userId, invoiceOrTxId, isAdmin);
    const lineItems = Array.isArray(invoice.lineItems) ? (invoice.lineItems as any[]) : [];
    const taxPaise = invoice.taxPaise || 0;
    const amountPaise = invoice.amountPaise || 0;
    const taxable = Math.max(0, amountPaise - taxPaise);

    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));

    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    doc.fontSize(20).fillColor('#63300E').text('PalSafar', { continued: false });
    doc.fontSize(11).fillColor('#8B7355').text('Tax Invoice / GST Invoice');
    doc.moveDown();
    doc.fontSize(12).fillColor('#2C1810');
    doc.text(`Invoice No: ${invoice.invoiceNumber}`);
    doc.text(`Issued: ${new Date(invoice.issuedAt).toLocaleString('en-IN')}`);
    doc.text(`Status: ${invoice.transaction?.status || 'PAID'}`);
    doc.moveDown();
    doc.text(`Bill to: ${invoice.billingName || invoice.user?.name || 'Customer'}`);
    if (invoice.billingAddress) doc.text(invoice.billingAddress);
    if (invoice.gstNumber) doc.text(`GSTIN: ${invoice.gstNumber}`);
    if (invoice.user?.email) doc.text(`Email: ${invoice.user.email}`);
    doc.moveDown();
    doc.text('Line items', { underline: true });
    doc.moveDown(0.5);

    if (lineItems.length === 0) {
      doc.text(`Subscription — ₹${(amountPaise / 100).toFixed(2)}`);
    } else {
      for (const item of lineItems) {
        const desc = String(item.description || 'Item');
        const amt = Number(item.amountPaise || 0);
        doc.text(`${desc} — ₹${(amt / 100).toFixed(2)}`);
      }
    }

    doc.moveDown();
    doc.text(`Taxable value: ₹${(taxable / 100).toFixed(2)}`);
    doc.text(`Tax (GST): ₹${(taxPaise / 100).toFixed(2)}`);
    doc.fontSize(13).fillColor('#63300E').text(`Total: ₹${(amountPaise / 100).toFixed(2)} ${invoice.currency || 'INR'}`);
    doc.moveDown();
    doc.fontSize(9).fillColor('#8B7355').text('This is a computer-generated invoice for PalSafar subscription / membership payments.');
    doc.end();

    const buffer = await done;
    return { buffer, filename: `${invoice.invoiceNumber}.pdf` };
  },
};
