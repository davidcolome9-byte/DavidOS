import { describe, expect, it } from 'vitest';
import {
  DRIVE_BACKUP_FOLDER_PATH,
  buildDriveBackupFileName,
  escapeDriveQueryValue,
  formatDrivePath,
  formatDriveTimestamp,
} from '../integrations/googleDrivePaths';

describe('googleDrivePaths', () => {
  it('formats stable UTC timestamps for filenames', () => {
    const date = new Date('2026-07-08T23:14:44Z');
    expect(formatDriveTimestamp(date)).toBe('2026-07-08-231444');
    expect(buildDriveBackupFileName(date)).toBe('davidos-backup-2026-07-08-231444Z.json');
  });

  it('formats the backup folder path', () => {
    expect(formatDrivePath(DRIVE_BACKUP_FOLDER_PATH)).toBe('DavidOS/06_Exports/Backups');
  });

  it('escapes Drive query values', () => {
    expect(escapeDriveQueryValue("David's \\ Drive")).toBe("David\\'s \\\\ Drive");
  });
});
