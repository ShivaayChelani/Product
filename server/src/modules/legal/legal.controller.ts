import { Response } from 'express';
import { LegalDocumentType } from '@prisma/client';
import { legalService } from './legal.service';
import { catchAsync } from '../../shared/utils/catchAsync';
import { sendSuccess, sendCreated } from '../../shared/utils/response';

export const legalController = {
  // ── Public ──
  listTypes: catchAsync(async (req: any, res: Response) => {
    const locale = (req.query.locale as string) || 'en';
    const result = await legalService.listPublishedTypes(locale);
    sendSuccess(res, result);
  }),

  getPublished: catchAsync(async (req: any, res: Response) => {
    const type = req.params.type as LegalDocumentType;
    const locale = (req.query.locale as string) || 'en';
    const result = await legalService.getPublished(type, locale);
    sendSuccess(res, result);
  }),

  // ── Admin ──
  listDocuments: catchAsync(async (req: any, res: Response) => {
    const locale = (req.query.locale as string) || 'en';
    const result = await legalService.listDocuments(locale);
    sendSuccess(res, result);
  }),

  createDocument: catchAsync(async (req: any, res: Response) => {
    const result = await legalService.createDocument(req.body);
    sendCreated(res, result, 'Legal document ready');
  }),

  getDocument: catchAsync(async (req: any, res: Response) => {
    const result = await legalService.getDocumentWithVersions(String(req.params.id));
    sendSuccess(res, result);
  }),

  listVersions: catchAsync(async (req: any, res: Response) => {
    const result = await legalService.listVersions(String(req.params.id));
    sendSuccess(res, result);
  }),

  createVersion: catchAsync(async (req: any, res: Response) => {
    const result = await legalService.createVersion(String(req.params.id), req.user.id, req.body);
    sendCreated(res, result, 'Draft version created');
  }),

  getVersion: catchAsync(async (req: any, res: Response) => {
    const result = await legalService.getVersion(String(req.params.versionId));
    sendSuccess(res, result);
  }),

  updateVersion: catchAsync(async (req: any, res: Response) => {
    const result = await legalService.updateDraftVersion(String(req.params.versionId), req.body);
    sendSuccess(res, result, { message: 'Draft updated' });
  }),

  publishVersion: catchAsync(async (req: any, res: Response) => {
    const result = await legalService.publishVersion(String(req.params.versionId), req.user.id);
    sendSuccess(res, result, { message: 'Version published' });
  }),

  archiveVersion: catchAsync(async (req: any, res: Response) => {
    const result = await legalService.archiveVersion(String(req.params.versionId), req.user.id);
    sendSuccess(res, result, { message: 'Version archived' });
  }),

  rollbackVersion: catchAsync(async (req: any, res: Response) => {
    const result = await legalService.rollbackToVersion(String(req.params.versionId), req.user.id, req.body.publish);
    sendSuccess(res, result, { message: req.body.publish ? 'Rolled back and published' : 'Rollback draft created' });
  }),
};
