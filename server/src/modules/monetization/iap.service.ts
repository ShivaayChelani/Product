import {
  PlanAudience,
  PlanBillingPeriod,
  PaymentProvider,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError } from '../../shared/utils/ApiError';
import { plansService } from './plans.service';
import { paymentsService } from './payments.service';

/**
 * Server-side IAP verification.
 * Google Play / Apple credentials are optional until configured —
 * purchases are NEVER activated from an unverified client token.
 */
export const iapService = {
  async verifyAndActivate(
    userId: string,
    input: {
      platform: 'android' | 'ios';
      productId: string;
      purchaseToken: string;
      transactionId?: string;
      planId: string;
      period: PlanBillingPeriod;
    },
  ) {
    const plan = await plansService.getById(input.planId);
    if (plan.audience !== PlanAudience.USER_PREMIUM) {
      throw new ApiError(400, 'IAP is only for User Premium plans');
    }
    if (plan.status !== 'ACTIVE') {
      throw new ApiError(400, 'This plan is not available');
    }

    const expectedSku =
      input.period === PlanBillingPeriod.YEARLY
        ? (input.platform === 'ios' ? plan.appleProductIdYearly : plan.googleProductIdYearly)
        : (input.platform === 'ios' ? plan.appleProductIdMonthly : plan.googleProductIdMonthly);

    if (!expectedSku || expectedSku !== input.productId) {
      throw new ApiError(400, 'Product ID does not match the selected plan');
    }

    const providerPaymentId =
      input.transactionId || `${input.platform}:${input.productId}:${input.purchaseToken.slice(0, 48)}`;

    const existing = await prisma.paymentTransaction.findFirst({
      where: { providerPaymentId },
    });
    if (existing?.status === PaymentStatus.CAPTURED) {
      const entitlements = await import('./entitlements.service').then((m) =>
        m.entitlementsService.getForUser(userId),
      );
      return { alreadyProcessed: true, entitlements };
    }

    if (input.platform === 'android') {
      await this.verifyGooglePlay(input.productId, input.purchaseToken);
    } else {
      await this.verifyApple(input.purchaseToken, input.transactionId);
    }

    const price = plan.prices.find((p) => p.period === input.period);
    const subscription = await paymentsService.activateSubscription({
      userId,
      planId: plan.id,
      audience: PlanAudience.USER_PREMIUM,
      period: input.period,
      provider: input.platform === 'android' ? PaymentProvider.GOOGLE_PLAY : PaymentProvider.APPLE_IAP,
      providerPaymentId,
      providerSubscriptionId: input.purchaseToken,
      amountPaise: price?.amountPaise ?? 0,
      currency: price?.currency ?? 'INR',
    });

    const transaction = await prisma.paymentTransaction.create({
      data: {
        userId,
        subscriptionId: subscription.id,
        provider: input.platform === 'android' ? PaymentProvider.GOOGLE_PLAY : PaymentProvider.APPLE_IAP,
        status: PaymentStatus.CAPTURED,
        amountPaise: price?.amountPaise ?? 0,
        currency: price?.currency ?? 'INR',
        description: `${plan.name} (${input.period}) via ${input.platform}`,
        providerPaymentId,
        providerOrderId: input.productId,
        paidAt: new Date(),
        rawPayload: {
          productId: input.productId,
          purchaseToken: input.purchaseToken.slice(0, 80),
          transactionId: input.transactionId,
        } as Prisma.InputJsonValue,
      },
    });

    await paymentsService.createInvoice(userId, transaction.id);
    const { entitlementsService } = await import('./entitlements.service');
    const entitlements = await entitlementsService.getForUser(userId);

    return { alreadyProcessed: false, subscription, transaction, entitlements };
  },

  async verifyGooglePlay(productId: string, purchaseToken: string) {
    const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME || 'com.palsasafar';
    const credentialsJson = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
    if (!credentialsJson) {
      throw new ApiError(
        503,
        'Google Play billing verification is not configured. Set GOOGLE_PLAY_SERVICE_ACCOUNT_JSON.',
      );
    }

    let credentials: object;
    try {
      credentials = JSON.parse(credentialsJson);
    } catch {
      throw new ApiError(500, 'Invalid GOOGLE_PLAY_SERVICE_ACCOUNT_JSON');
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { google } = require('googleapis');
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });
    const androidpublisher = google.androidpublisher({ version: 'v3', auth });
    const res = await androidpublisher.purchases.subscriptions.get({
      packageName,
      subscriptionId: productId,
      token: purchaseToken,
    });

    const data = res.data;
    if (!data) throw new ApiError(400, 'Google Play returned empty purchase data');
    // paymentState 1 = received; 2 = free trial; 0 = pending
    if (data.paymentState === 0) {
      throw new ApiError(402, 'Purchase is still pending');
    }
    if (data.cancelReason != null && data.expiryTimeMillis && Number(data.expiryTimeMillis) < Date.now()) {
      throw new ApiError(400, 'Subscription already expired');
    }
    return data;
  },

  async verifyApple(purchaseToken: string, transactionId?: string) {
    const issuerId = process.env.APPLE_IAP_ISSUER_ID;
    const keyId = process.env.APPLE_IAP_KEY_ID;
    const privateKey = process.env.APPLE_IAP_PRIVATE_KEY;
    const bundleId = process.env.APPLE_IAP_BUNDLE_ID;

    if (!issuerId || !keyId || !privateKey || !bundleId) {
      throw new ApiError(
        503,
        'Apple IAP verification is not configured. Set APPLE_IAP_ISSUER_ID, APPLE_IAP_KEY_ID, APPLE_IAP_PRIVATE_KEY, APPLE_IAP_BUNDLE_ID.',
      );
    }

    // App Store Server API — verify via getTransactionInfo when available.
    // Using signed JWT auth against Apple's API.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const jwt = require('jsonwebtoken');
    const now = Math.floor(Date.now() / 1000);
    const token = jwt.sign(
      {
        iss: issuerId,
        iat: now,
        exp: now + 3600,
        aud: 'appstoreconnect-v1',
        bid: bundleId,
      },
      privateKey.replace(/\\n/g, '\n'),
      { algorithm: 'ES256', header: { alg: 'ES256', kid: keyId, typ: 'JWT' } },
    );

    const txId = transactionId || purchaseToken;
    const base =
      process.env.APPLE_IAP_ENV === 'sandbox'
        ? 'https://api.storekit-sandbox.itunes.apple.com'
        : 'https://api.storekit.itunes.apple.com';

    const res = await fetch(`${base}/inApps/v1/transactions/${encodeURIComponent(txId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new ApiError(400, `Apple IAP verification failed: ${text || res.statusText}`);
    }

    return res.json();
  },
};
