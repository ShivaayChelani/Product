import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../app';
import { prisma } from '../config/database';



const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

function signPayload(payload: string): string {
  const signer = crypto.createSign('sha256');
  signer.update(payload);
  const base64Sig = signer.sign(privateKey, 'base64');
  // convert to base64url
  return base64Sig.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-vitest-min-32-chars!!';

function ssvToken(userId: string, opts?: jwt.SignOptions) {
  return jwt.sign({ userId, purpose: 'admob_ssv' }, JWT_SECRET, { expiresIn: '1h', ...opts });
}

function accessTokenFor(userId: string) {
  return jwt.sign({ userId, role: 'user', type: 'access' }, JWT_SECRET, { expiresIn: '1h' });
}

describe('AdMob SSV Security Tests', () => {
  let testUser: any;

  beforeAll(async () => {
    // 1. Setup mock keys
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        keys: [
          {
            keyId: 12345,
            pem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
            base64: 'test',
          },
        ],
      }),
    }) as any;

    // 2. Clear state related to testUser if it exists from previous failure
    const previousUser = await prisma.user.findFirst({ where: { email: 'ssvtest@example.com' } });
    if (previousUser) {
      await prisma.adMobSsvEvent.deleteMany({ where: { userId: previousUser.id } }).catch(() => {});
      await prisma.walletTransaction.deleteMany({ where: { wallet: { userId: previousUser.id } } }).catch(() => {});
      await prisma.wallet.deleteMany({ where: { userId: previousUser.id } }).catch(() => {});
      await prisma.user.delete({ where: { id: previousUser.id } }).catch(() => {});
    }
    await prisma.adConfiguration.deleteMany({ where: { key: 'default' } });

    // 3. Create config
    await prisma.adConfiguration.create({
      data: {
        key: 'default',
        adsEnabled: true,
        rewardedEnabled: true,
        rewardedPoints: 50,
        rewardedAdUnitIdAndroid: 'test-ad-unit',
      },
    });

    // 4. Create PointRule
    await prisma.pointRule.upsert({
      where: { key: 'rewarded_ad' },
      update: {
        cooldownSec: null,
        maxDaily: null
      },
      create: {
        key: 'rewarded_ad',
        label: 'Ad Reward',
        points: 50,
        category: 'general',
        isActive: true,
      }
    });

    // 5. Create user
    testUser = await prisma.user.create({
      data: {
        email: 'ssvtest@example.com',
        password: 'hash',
        name: 'SSV Test',
      },
    });
    
    await prisma.wallet.create({
      data: { userId: testUser.id, palPoints: 0 },
    });
  });

  afterAll(async () => {
    if (testUser) {
      await prisma.adMobSsvEvent.deleteMany({ where: { userId: testUser.id } }).catch(() => {});
      await prisma.walletTransaction.deleteMany({ where: { wallet: { userId: testUser.id } } }).catch(() => {});
      await prisma.wallet.deleteMany({ where: { userId: testUser.id } }).catch(() => {});
      await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {});
    }
    await prisma.adConfiguration.deleteMany({ where: { key: 'default' } });
    vi.restoreAllMocks();
  });

  it('TEST 1: Valid Google-style SSV signature -> reward succeeds', async () => {
    const ssvCustomData = ssvToken(testUser.id);
    const queryStr = `ad_network=123&ad_unit=test-ad-unit&custom_data=${ssvCustomData}&reward_amount=50&reward_item=PalPoints&timestamp=123456&transaction_id=tx1`;
    const sig = signPayload(queryStr);
    
    const res = await request(app).get(`/api/v1/monetization/ads/ssv?${queryStr}&signature=${sig}&key_id=12345`);
    expect(res.status).toBe(200);

    const event = await prisma.adMobSsvEvent.findUnique({ where: { transactionId: 'tx1' } });
    expect(event).not.toBeNull();
    
    const wallet = await prisma.wallet.findUnique({ where: { userId: testUser.id } });
    expect(wallet?.palPoints).toBe(50);
  });

  it('TEST 9: Replay identical valid event -> no second reward', async () => {
    const ssvCustomData = ssvToken(testUser.id);
    const queryStr = `ad_network=123&ad_unit=test-ad-unit&custom_data=${ssvCustomData}&reward_amount=50&reward_item=PalPoints&timestamp=123456&transaction_id=tx1`;
    const sig = signPayload(queryStr);
    
    // First was already called in TEST 1
    const res = await request(app).get(`/api/v1/monetization/ads/ssv?${queryStr}&signature=${sig}&key_id=12345`);
    expect(res.status).toBe(200); // Idempotent success response

    const txs = await prisma.walletTransaction.findMany({ where: { referenceId: 'tx1' } });
    expect(txs.length).toBe(1); // exactly one
    
    const wallet = await prisma.wallet.findUnique({ where: { userId: testUser.id } });
    expect(wallet?.palPoints).toBe(50); // Still 50
  });

  it('TEST 2: Invalid signature -> reject -> no PalPoints', async () => {
    const ssvCustomData = ssvToken(testUser.id);
    const queryStr = `ad_network=123&ad_unit=test-ad-unit&custom_data=${ssvCustomData}&reward_amount=50&reward_item=PalPoints&timestamp=123456&transaction_id=tx2`;
    const res = await request(app).get(`/api/v1/monetization/ads/ssv?${queryStr}&signature=invalid_signature&key_id=12345`);
    expect(res.status).toBe(401);
  });

  it('TEST 3: Modified reward amount -> signature invalid/reject -> no PalPoints', async () => {
    const ssvCustomData = ssvToken(testUser.id);
    const queryStrOriginal = `ad_network=123&ad_unit=test-ad-unit&custom_data=${ssvCustomData}&reward_amount=50&reward_item=PalPoints&timestamp=123456&transaction_id=tx3`;
    const sig = signPayload(queryStrOriginal);
    
    const queryStrModified = `ad_network=123&ad_unit=test-ad-unit&custom_data=${ssvCustomData}&reward_amount=999999&reward_item=PalPoints&timestamp=123456&transaction_id=tx3`;
    const res = await request(app).get(`/api/v1/monetization/ads/ssv?${queryStrModified}&signature=${sig}&key_id=12345`);
    expect(res.status).toBe(401); // Signature mismatch because string changed
  });

  it('TEST 4: Modified user/custom_data -> signature invalid/reject', async () => {
    const ssvCustomData = ssvToken(testUser.id);
    const queryStrOriginal = `ad_network=123&ad_unit=test-ad-unit&custom_data=${ssvCustomData}&reward_amount=50&reward_item=PalPoints&timestamp=123456&transaction_id=tx4`;
    const sig = signPayload(queryStrOriginal);
    
    const ssvCustomDataModified = jwt.sign({ userId: 'victim-user' }, process.env.JWT_SECRET || 'test-jwt-secret-for-vitest-min-32-chars!!', { expiresIn: '1h' });
    const queryStrModified = `ad_network=123&ad_unit=test-ad-unit&custom_data=${ssvCustomDataModified}&reward_amount=50&reward_item=PalPoints&timestamp=123456&transaction_id=tx4`;
    const res = await request(app).get(`/api/v1/monetization/ads/ssv?${queryStrModified}&signature=${sig}&key_id=12345`);
    expect(res.status).toBe(401);
  });

  it('TEST 5: Unknown user -> reject', async () => {
    const ssvCustomData = ssvToken('unknown-123');
    const queryStr = `ad_network=123&ad_unit=test-ad-unit&custom_data=${ssvCustomData}&reward_amount=50&reward_item=PalPoints&timestamp=123456&transaction_id=tx5`;
    const sig = signPayload(queryStr);
    
    const res = await request(app).get(`/api/v1/monetization/ads/ssv?${queryStr}&signature=${sig}&key_id=12345`);
    expect(res.status).toBe(404); // User not found
  });

  it('TEST 6: Wrong ad unit -> reject', async () => {
    const ssvCustomData = ssvToken(testUser.id);
    const queryStr = `ad_network=123&ad_unit=wrong-ad-unit&custom_data=${ssvCustomData}&reward_amount=50&reward_item=PalPoints&timestamp=123456&transaction_id=tx6`;
    const sig = signPayload(queryStr);
    
    const res = await request(app).get(`/api/v1/monetization/ads/ssv?${queryStr}&signature=${sig}&key_id=12345`);
    expect(res.status).toBe(400);
  });

  it('TEST 8: Wrong reward amount -> reject', async () => {
    const ssvCustomData = ssvToken(testUser.id);
    // Even if signature is somehow valid over this amount, we check it against server config (50)
    const queryStr = `ad_network=123&ad_unit=test-ad-unit&custom_data=${ssvCustomData}&reward_amount=999&reward_item=PalPoints&timestamp=123456&transaction_id=tx8`;
    const sig = signPayload(queryStr);
    
    const res = await request(app).get(`/api/v1/monetization/ads/ssv?${queryStr}&signature=${sig}&key_id=12345`);
    expect(res.status).toBe(400); // "Unexpected reward amount"
  });

  it('TEST 10: Two concurrent identical valid callbacks -> exactly one reward', async () => {
    const ssvCustomData = ssvToken(testUser.id);
    const queryStr = `ad_network=123&ad_unit=test-ad-unit&custom_data=${ssvCustomData}&reward_amount=50&reward_item=PalPoints&timestamp=123456&transaction_id=tx10`;
    const sig = signPayload(queryStr);
    
    const p1 = request(app).get(`/api/v1/monetization/ads/ssv?${queryStr}&signature=${sig}&key_id=12345`);
    const p2 = request(app).get(`/api/v1/monetization/ads/ssv?${queryStr}&signature=${sig}&key_id=12345`);
    
    const [res1, res2] = await Promise.all([p1, p2]);
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    const txs = await prisma.walletTransaction.findMany({ where: { referenceId: 'tx10' } });
    expect(txs.length).toBe(1);
  });

  it('TEST 11: Client directly calls claim-reward -> no reward (503)', async () => {
    // Client trying to fake reward
    const token = jwt.sign({ userId: testUser.id, role: 'user', type: 'access' }, process.env.JWT_SECRET || 'test-jwt-secret-for-vitest-min-32-chars!!', { expiresIn: '1h' });
    const res = await request(app)
      .post('/api/v1/monetization/ads/claim-reward')
      .set('Authorization', `Bearer ${token}`)
      .send({ eventId: 'tx11' });
    
    expect(res.status).toBe(503);
  });

  it('TEST 12: Unsigned SSV callback -> reject', async () => {
    const ssvCustomData = ssvToken(testUser.id);
    const queryStr = `ad_network=123&ad_unit=test-ad-unit&custom_data=${ssvCustomData}&reward_amount=50&reward_item=PalPoints&timestamp=123456&transaction_id=tx12`;
    const res = await request(app).get(`/api/v1/monetization/ads/ssv?${queryStr}&key_id=12345`);
    expect(res.status).toBe(400); // Missing signature
  });

  it('TEST 13: Unknown key_id -> safely refresh -> still unknown -> reject', async () => {
    const ssvCustomData = ssvToken(testUser.id);
    const queryStr = `ad_network=123&ad_unit=test-ad-unit&custom_data=${ssvCustomData}&reward_amount=50&reward_item=PalPoints&timestamp=123456&transaction_id=tx13`;
    const sig = signPayload(queryStr);
    
    const res = await request(app).get(`/api/v1/monetization/ads/ssv?${queryStr}&signature=${sig}&key_id=9999`);
    expect(res.status).toBe(401);
    expect((global.fetch as any).mock.calls.length).toBeGreaterThan(0); // Should have tried to fetch keys
  });

  it('authenticated ads/config returns ssvCustomData bound to that user', async () => {
    const res = await request(app)
      .get('/api/v1/monetization/ads/config')
      .set('Authorization', `Bearer ${accessTokenFor(testUser.id)}`);
    expect(res.status).toBe(200);
    const token = res.body.data?.ssvCustomData;
    expect(typeof token).toBe('string');
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; purpose: string };
    expect(decoded.userId).toBe(testUser.id);
    expect(decoded.purpose).toBe('admob_ssv');
  });

  it('unauthenticated ads/config does not return ssvCustomData', async () => {
    const res = await request(app).get('/api/v1/monetization/ads/config?userId=' + testUser.id);
    expect(res.status).toBe(200);
    expect(res.body.data?.ssvCustomData).toBeUndefined();
  });

  it('ads/config query userId cannot obtain another user custom data', async () => {
    const other = await prisma.user.create({
      data: { email: 'ssv-other@example.com', password: 'hash', name: 'Other' },
    });
    const res = await request(app)
      .get(`/api/v1/monetization/ads/config?userId=${other.id}`)
      .set('Authorization', `Bearer ${accessTokenFor(testUser.id)}`);
    expect(res.status).toBe(200);
    const decoded = jwt.verify(res.body.data.ssvCustomData, JWT_SECRET) as { userId: string };
    expect(decoded.userId).toBe(testUser.id);
    expect(decoded.userId).not.toBe(other.id);
    await prisma.user.delete({ where: { id: other.id } }).catch(() => {});
  });

  it('modified custom_data JWT is rejected even with a matching AdMob signature', async () => {
    const tampered = ssvToken(testUser.id).slice(0, -4) + 'xxxx';
    const queryStr = `ad_network=123&ad_unit=test-ad-unit&custom_data=${tampered}&reward_amount=50&reward_item=PalPoints&timestamp=123456&transaction_id=tx-tamper`;
    const sig = signPayload(queryStr);
    const before = await prisma.wallet.findUnique({ where: { userId: testUser.id } });
    const res = await request(app).get(`/api/v1/monetization/ads/ssv?${queryStr}&signature=${sig}&key_id=12345`);
    expect(res.status).toBe(400);
    const after = await prisma.wallet.findUnique({ where: { userId: testUser.id } });
    expect(after?.palPoints).toBe(before?.palPoints);
  });

  it('expired custom_data is rejected', async () => {
    const expired = ssvToken(testUser.id, { expiresIn: '-1s' });
    const queryStr = `ad_network=123&ad_unit=test-ad-unit&custom_data=${expired}&reward_amount=50&reward_item=PalPoints&timestamp=123456&transaction_id=tx-expired`;
    const sig = signPayload(queryStr);
    const res = await request(app).get(`/api/v1/monetization/ads/ssv?${queryStr}&signature=${sig}&key_id=12345`);
    expect(res.status).toBe(400);
  });

  it('access token cannot be used as SSV custom_data', async () => {
    const session = accessTokenFor(testUser.id);
    const queryStr = `ad_network=123&ad_unit=test-ad-unit&custom_data=${session}&reward_amount=50&reward_item=PalPoints&timestamp=123456&transaction_id=tx-session`;
    const sig = signPayload(queryStr);
    const res = await request(app).get(`/api/v1/monetization/ads/ssv?${queryStr}&signature=${sig}&key_id=12345`);
    expect(res.status).toBe(400);
  });

  it('Google callback verification test request returns 200 and credits nothing', async () => {
    const before = await prisma.wallet.findUnique({ where: { userId: testUser.id } });
    const ssvCustomData = ssvToken(testUser.id);
    const queryStr = `ad_network=123&ad_unit=1234567890&custom_data=${ssvCustomData}&reward_amount=10&reward_item=PalPoints&timestamp=123456&transaction_id=123456789`;
    const sig = signPayload(queryStr);

    const res = await request(app).get(`/api/v1/monetization/ads/ssv?${queryStr}&signature=${sig}&key_id=12345`);
    expect(res.status).toBe(200);

    const event = await prisma.adMobSsvEvent.findUnique({ where: { transactionId: '123456789' } });
    expect(event).toBeNull();
    const txs = await prisma.walletTransaction.findMany({ where: { referenceId: '123456789' } });
    expect(txs.length).toBe(0);
    const after = await prisma.wallet.findUnique({ where: { userId: testUser.id } });
    expect(after?.palPoints).toBe(before?.palPoints ?? 0);
  });

  it('Google callback verification test request with invalid signature is rejected', async () => {
    const ssvCustomData = ssvToken(testUser.id);
    const queryStr = `ad_network=123&ad_unit=1234567890&custom_data=${ssvCustomData}&reward_amount=10&reward_item=PalPoints&timestamp=123456&transaction_id=123456789`;
    const res = await request(app).get(`/api/v1/monetization/ads/ssv?${queryStr}&signature=not_a_signature&key_id=12345`);
    expect(res.status).toBe(401);
  });

  it('Google callback verification test request with tampered custom_data is rejected', async () => {
    const ssvCustomData = ssvToken(testUser.id);
    const tampered = ssvCustomData.slice(0, -4) + 'xxxx';
    const queryStr = `ad_network=123&ad_unit=1234567890&custom_data=${tampered}&reward_amount=10&reward_item=PalPoints&timestamp=123456&transaction_id=123456789`;
    const sig = signPayload(queryStr);
    const res = await request(app).get(`/api/v1/monetization/ads/ssv?${queryStr}&signature=${sig}&key_id=12345`);
    expect(res.status).toBe(400);
  });

  it('test ad_unit alone does not bypass real ad-unit validation', async () => {
    const ssvCustomData = ssvToken(testUser.id);
    const queryStr = `ad_network=123&ad_unit=1234567890&custom_data=${ssvCustomData}&reward_amount=50&reward_item=PalPoints&timestamp=123456&transaction_id=real-tx-abc`;
    const sig = signPayload(queryStr);
    const res = await request(app).get(`/api/v1/monetization/ads/ssv?${queryStr}&signature=${sig}&key_id=12345`);
    expect(res.status).toBe(400); // Invalid ad unit — test fingerprint requires all fixed values
  });

  it('SSV callback creates a wallet if missing and credits the bound user', async () => {
    await prisma.walletTransaction.deleteMany({ where: { userId: testUser.id } });
    await prisma.wallet.deleteMany({ where: { userId: testUser.id } });
    const ssvCustomData = ssvToken(testUser.id);
    const queryStr = `ad_network=123&ad_unit=test-ad-unit&custom_data=${ssvCustomData}&reward_amount=50&reward_item=PalPoints&timestamp=123456&transaction_id=tx-nowallet`;
    const sig = signPayload(queryStr);
    const res = await request(app).get(`/api/v1/monetization/ads/ssv?${queryStr}&signature=${sig}&key_id=12345`);
    expect(res.status).toBe(200);
    const wallet = await prisma.wallet.findUnique({ where: { userId: testUser.id } });
    expect(wallet?.palPoints).toBe(50);
  });
});
