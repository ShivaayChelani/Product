import fs from 'fs';
import { initializeApp, cert, applicationDefault, getApps } from 'firebase-admin/app';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';
import { env } from './env';
import { logger } from './logger';

let messagingInstance: Messaging | null = null;

function loadFirebasePrivateKey(): string | undefined {
  if (env.firebase.privateKeyPath) {
    try {
      return fs.readFileSync(env.firebase.privateKeyPath, 'utf8');
    } catch (err) {
      logger.error({ err, path: env.firebase.privateKeyPath }, 'Failed to read Firebase private key file');
    }
  }
  if (env.firebase.privateKey) {
    return env.firebase.privateKey.replace(/\\n/g, '\n');
  }
  return undefined;
}

function hasExplicitCredentials(
  projectId: string,
  clientEmail: string,
  privateKey: string | undefined,
): boolean {
  return Boolean(projectId && clientEmail && privateKey);
}

function hasPartialExplicitCredentials(
  projectId: string,
  clientEmail: string,
  privateKey: string | undefined,
  privateKeyPath: string,
): boolean {
  const anyExplicit = Boolean(clientEmail || privateKey || privateKeyPath);
  if (!anyExplicit) return false;
  return !hasExplicitCredentials(projectId, clientEmail, privateKey);
}

export function initFirebase(): void {
  const { projectId, clientEmail, storageBucket, privateKeyPath } = env.firebase;
  const privateKey = loadFirebasePrivateKey();
  const useExplicit = hasExplicitCredentials(projectId, clientEmail, privateKey);

  if (getApps().length > 0) {
    logger.info('Firebase Admin SDK already initialized');
    messagingInstance = getMessaging();
    return;
  }

  if (hasPartialExplicitCredentials(projectId, clientEmail, privateKey, privateKeyPath)) {
    logger.error(
      {
        hasProjectId: Boolean(projectId),
        hasClientEmail: Boolean(clientEmail),
        hasPrivateKey: Boolean(privateKey),
      },
      'Firebase credentials incomplete — set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY (or PATH). Skipping ADC fallback.',
    );
    return;
  }

  try {
    if (useExplicit) {
      initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey: privateKey!,
        }),
        storageBucket: storageBucket || undefined,
      });
      logger.info('Firebase Admin SDK initialized with explicit service account credentials');
    } else {
      // ADC only when no explicit service-account vars are set (GCP Cloud Run / GKE / GCE).
      initializeApp({
        credential: applicationDefault(),
        storageBucket: storageBucket || undefined,
        projectId: projectId || undefined,
      });
      logger.info('Firebase Admin SDK initialized with Application Default Credentials');
    }
    messagingInstance = getMessaging();
  } catch (error) {
    logger.error({ error }, 'Failed to initialize Firebase Admin SDK — push notifications disabled');
  }
}

export function getMessagingInstance(): Messaging | null {
  return messagingInstance;
}

export function isFirebaseReady(): boolean {
  return messagingInstance !== null;
}
