export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const GOOGLE_DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';
export const DAVIDOS_DRIVE_ROOT = 'DavidOS';
export const DRIVE_BACKUP_FOLDER_PATH = [DAVIDOS_DRIVE_ROOT, '06_Exports', 'Backups'] as const;

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

export function formatDriveTimestamp(date = new Date()): string {
  return [
    date.getUTCFullYear(),
    pad2(date.getUTCMonth() + 1),
    pad2(date.getUTCDate()),
  ].join('-') + '-' + [
    pad2(date.getUTCHours()),
    pad2(date.getUTCMinutes()),
    pad2(date.getUTCSeconds()),
  ].join('');
}

export function buildDriveBackupFileName(date = new Date()): string {
  return `davidos-backup-${formatDriveTimestamp(date)}Z.json`;
}

export function formatDrivePath(parts: readonly string[]): string {
  return parts.filter(Boolean).join('/');
}

export function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
