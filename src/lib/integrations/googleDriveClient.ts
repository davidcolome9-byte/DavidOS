import type { AppState } from '../types';
import { serializeState } from '../storage/exportImport';
import {
  DRIVE_BACKUP_FOLDER_PATH,
  GOOGLE_DRIVE_FOLDER_MIME,
  GOOGLE_DRIVE_SCOPE,
  buildDriveBackupFileName,
  escapeDriveQueryValue,
  formatDrivePath,
} from './googleDrivePaths';

const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface GoogleTokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
}

interface GoogleOauth2 {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (response: GoogleTokenResponse) => void;
  }) => GoogleTokenClient;
  revoke?: (token: string, done: (response: { successful?: boolean; error?: string }) => void) => void;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: GoogleOauth2;
      };
    };
  }
}

export interface DriveSession {
  accessToken: string;
  expiresAt: number;
}

export interface DriveFileMetadata {
  id: string;
  name: string;
  mimeType?: string;
  modifiedTime?: string;
  webViewLink?: string;
  size?: string;
}

export interface DriveBackupResult {
  file: DriveFileMetadata;
  path: string;
}

let gisLoadPromise: Promise<void> | null = null;

export function getGoogleDriveClientId(): string {
  return (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim();
}

export function isGoogleDriveConfigured(): boolean {
  return getGoogleDriveClientId().length > 0;
}

export function isDriveSessionFresh(session: DriveSession | null, now = Date.now()): session is DriveSession {
  return Boolean(session && session.expiresAt - now > 60_000);
}

export function loadGoogleIdentityServices(): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Google Drive sync only runs in a browser.'));
  }
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisLoadPromise) return gisLoadPromise;

  gisLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services.'));
    document.head.appendChild(script);
  });

  return gisLoadPromise;
}

export async function requestDriveAccessToken(): Promise<DriveSession> {
  const clientId = getGoogleDriveClientId();
  if (!clientId) {
    throw new Error('Missing VITE_GOOGLE_CLIENT_ID. Add a Google OAuth web client ID to your local environment.');
  }
  if (!window.google?.accounts?.oauth2) await loadGoogleIdentityServices();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new Error('Google Identity Services did not initialize.');

  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_DRIVE_SCOPE,
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }
        if (!response.access_token) {
          reject(new Error('Google did not return an access token.'));
          return;
        }
        const expiresInMs = (response.expires_in ?? 3600) * 1000;
        resolve({
          accessToken: response.access_token,
          expiresAt: Date.now() + expiresInMs,
        });
      },
    });
    client.requestAccessToken();
  });
}

async function driveFetch<T>(accessToken: string, url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  const response = await fetch(url, { ...init, headers });
  if (!response.ok) {
    let message = `Google Drive request failed (${response.status}).`;
    try {
      const body = await response.json() as { error?: { message?: string } };
      if (body.error?.message) message = body.error.message;
    } catch {
      // Keep the status-based message when Drive returns a non-JSON error.
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

async function findChildByName(
  accessToken: string,
  parentId: string,
  name: string,
  mimeType?: string,
): Promise<DriveFileMetadata | null> {
  const terms = [
    `'${escapeDriveQueryValue(parentId)}' in parents`,
    `name = '${escapeDriveQueryValue(name)}'`,
    'trashed = false',
  ];
  if (mimeType) terms.push(`mimeType = '${escapeDriveQueryValue(mimeType)}'`);

  const params = new URLSearchParams({
    q: terms.join(' and '),
    spaces: 'drive',
    fields: 'files(id,name,mimeType,modifiedTime,webViewLink,size)',
    pageSize: '10',
  });
  const result = await driveFetch<{ files?: DriveFileMetadata[] }>(accessToken, `${DRIVE_FILES_URL}?${params}`);
  return result.files?.[0] ?? null;
}

async function createFolder(accessToken: string, parentId: string, name: string): Promise<DriveFileMetadata> {
  return driveFetch<DriveFileMetadata>(accessToken, `${DRIVE_FILES_URL}?fields=id,name,mimeType,modifiedTime,webViewLink`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({
      name,
      mimeType: GOOGLE_DRIVE_FOLDER_MIME,
      parents: [parentId],
    }),
  });
}

export async function ensureDriveFolderPath(
  accessToken: string,
  pathParts: readonly string[],
): Promise<DriveFileMetadata> {
  let parentId = 'root';
  let current: DriveFileMetadata | null = null;
  for (const part of pathParts) {
    current = await findChildByName(accessToken, parentId, part, GOOGLE_DRIVE_FOLDER_MIME);
    if (!current) current = await createFolder(accessToken, parentId, part);
    parentId = current.id;
  }
  if (!current) throw new Error('Drive folder path cannot be empty.');
  return current;
}

export async function uploadTextFileToDrive(
  accessToken: string,
  parentId: string,
  name: string,
  content: string,
  mimeType: string,
): Promise<DriveFileMetadata> {
  const boundary = `davidos_${Date.now().toString(36)}`;
  const metadata = { name, mimeType, parents: [parentId] };
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    `Content-Type: ${mimeType}`,
    '',
    content,
    `--${boundary}--`,
    '',
  ].join('\r\n');
  const params = new URLSearchParams({
    uploadType: 'multipart',
    fields: 'id,name,mimeType,modifiedTime,webViewLink,size',
  });

  return driveFetch<DriveFileMetadata>(accessToken, `${DRIVE_UPLOAD_URL}?${params}`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
}

export async function exportBackupToDrive(state: AppState, session: DriveSession): Promise<DriveBackupResult> {
  const folder = await ensureDriveFolderPath(session.accessToken, DRIVE_BACKUP_FOLDER_PATH);
  const file = await uploadTextFileToDrive(
    session.accessToken,
    folder.id,
    buildDriveBackupFileName(),
    serializeState(state),
    'application/json',
  );
  return { file, path: formatDrivePath(DRIVE_BACKUP_FOLDER_PATH) };
}
