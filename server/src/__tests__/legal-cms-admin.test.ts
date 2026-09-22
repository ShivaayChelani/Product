import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app';
import { prisma } from '../config/database';
import { getAuthToken } from './helpers/auth';
import { getPublishedLegalVersions } from './helpers/legal';

/**
 * Legal CMS admin verification (read + mutation-safe write path).
 *
 * The full publish pipeline (createDocument → createVersion → publishVersion) is
 * already exercised by ensurePublishedLegalDocs() in global setup. This suite
 * locks in the HTTP wiring: admin auth/capability gates, the draft lifecycle,
 * and the public read path that must never leak drafts.
 *
 * Only DRAFT versions are created here — publishing would race the register/Google
 * gates in other suites because every vitest worker shares the same test database.
 */
describe('Legal CMS admin (HTTP wiring)', () => {
  let adminToken: string;
  let userToken: string;
  let termsDocumentId: string;
  const draftsCreated: string[] = [];

  beforeAll(async () => {
    adminToken = await getAuthToken('ADMIN');
    userToken = await getAuthToken('USER');

    const res = await request(app)
      .get('/api/v1/admin/legal/documents')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status, `admin documents -> ${res.status} ${JSON.stringify(res.body)}`).toBe(200);
    const terms = res.body.data.find(
      (doc: { type: string; locale: string }) =>
        doc.type === 'TERMS_CONDITIONS' && doc.locale === 'en',
    );
    expect(terms, 'seed must publish TERMS_CONDITIONS in global setup').toBeTruthy();
    termsDocumentId = terms.id;
  });

  afterAll(async () => {
    if (draftsCreated.length > 0) {
      await prisma.legalDocumentVersion.deleteMany({ where: { id: { in: draftsCreated } } });
    }
  });

  it('rejects anonymous and non-admin callers', async () => {
    const anon = await request(app).get('/api/v1/admin/legal/documents');
    expect(anon.status).toBe(401);

    const forbidden = await request(app)
      .get('/api/v1/admin/legal/documents')
      .set('Authorization', `Bearer ${userToken}`);
    expect(forbidden.status).toBe(403);
  });

  it('admin can list documents and their versions', async () => {
    const versions = await request(app)
      .get(`/api/v1/admin/legal/documents/${termsDocumentId}/versions`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(versions.status).toBe(200);
    const published = versions.body.data.filter((v: { status: string }) => v.status === 'PUBLISHED');
    expect(published.length).toBeGreaterThanOrEqual(1);
    expect(published[0].versionNumber).toBeGreaterThanOrEqual(1);
    expect(published[0].format).toBe('MARKDOWN');
  });

  it('draft lifecycle is visible to admins but never served publicly', async () => {
    const before = await getPublishedLegalVersions();

    const created = await request(app)
      .post(`/api/v1/admin/legal/documents/${termsDocumentId}/versions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Terms & Conditions (draft)',
        content: '# Draft\n\nNot ready for public release.',
        format: 'MARKDOWN',
        changeSummary: 'CMS draft lifecycle verification',
      });
    expect(created.status, `create version -> ${created.status} ${JSON.stringify(created.body)}`).toBe(
      201,
    );
    const versionId = created.body.data.id as string;
    draftsCreated.push(versionId);
    expect(created.body.data.status).toBe('DRAFT');

    const updated = await request(app)
      .patch(`/api/v1/admin/legal/versions/${versionId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Terms & Conditions (draft v2)' });
    expect(updated.status, `update version -> ${updated.status} ${JSON.stringify(updated.body)}`).toBe(
      200,
    );

    const fetched = await request(app)
      .get(`/api/v1/admin/legal/versions/${versionId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.data.title).toBe('Terms & Conditions (draft v2)');
    expect(fetched.body.data.status).toBe('DRAFT');

    // The draft must not shift published versions or leak to the public read path.
    const after = await getPublishedLegalVersions();
    expect(after).toEqual(before);

    const publicTerms = await request(app)
      .get('/api/v1/legal/TERMS_CONDITIONS')
      .set('Accept', 'application/json');
    expect(publicTerms.status).toBe(200);
    if (Array.isArray(publicTerms.body.data)) {
      const titles = publicTerms.body.data.map((v: { title?: string }) => v.title);
      expect(titles).not.toContain('Terms & Conditions (draft v2)');
    } else {
      expect(publicTerms.body.data.title).not.toBe('Terms & Conditions (draft v2)');
    }
  });

  it('public current-versions endpoint matches the DB published state', async () => {
    const dbVersions = await getPublishedLegalVersions();
    const res = await request(app).get('/api/v1/legal/current-versions');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(dbVersions);
  });
});