import { readJsonFile, writeJsonFile } from "@/utils/storage";

const FILE = "mr_complete_backup_reminder.json";
const DAYS_30 = 30 * 24 * 60 * 60 * 1000;
const DAYS_7 = 7 * 24 * 60 * 60 * 1000;
const CHANGE_THRESHOLD = 25;
const FIRST_BACKUP_RECORD_THRESHOLD = 3;

interface CompleteBackupReminderMetadata {
  lastSuccessfulBackupAt?: number;
  changedRecordIds: string[];
  snoozedUntil?: number;
  forceReminder?: boolean;
}

export interface CompleteBackupReminderStatus {
  due: boolean;
  snoozed: boolean;
  reason: "never-backed-up" | "age" | "changes" | "restore" | null;
  lastSuccessfulBackupAt?: number;
  changedRecordCount: number;
}

const DEFAULT_METADATA: CompleteBackupReminderMetadata = {
  changedRecordIds: [],
};

let queue = Promise.resolve();

async function readMetadata(): Promise<CompleteBackupReminderMetadata> {
  const saved = await readJsonFile<Partial<CompleteBackupReminderMetadata>>(FILE);
  return {
    ...DEFAULT_METADATA,
    ...saved,
    changedRecordIds: Array.from(new Set(saved?.changedRecordIds ?? [])),
  };
}

function mutate(operation: () => Promise<void>): Promise<void> {
  const result = queue.then(operation, operation);
  queue = result.catch(() => {});
  return result;
}

export function markRecordChangedForCompleteBackup(recordId: string): Promise<void> {
  return mutate(async () => {
    const metadata = await readMetadata();
    if (metadata.changedRecordIds.includes(recordId)) return;
    metadata.changedRecordIds.push(recordId);
    await writeJsonFile(FILE, metadata);
  });
}

export function markCompleteBackupSuccessful(at = Date.now()): Promise<void> {
  return mutate(async () => {
    await writeJsonFile(FILE, {
      lastSuccessfulBackupAt: at,
      changedRecordIds: [],
      forceReminder: false,
    } satisfies CompleteBackupReminderMetadata);
  });
}

export function requireCompleteBackupAfterRestore(): Promise<void> {
  return mutate(async () => {
    const metadata = await readMetadata();
    await writeJsonFile(FILE, {
      ...metadata,
      forceReminder: true,
      snoozedUntil: undefined,
    });
  });
}

export function snoozeCompleteBackupReminder(now = Date.now()): Promise<void> {
  return mutate(async () => {
    const metadata = await readMetadata();
    await writeJsonFile(FILE, {
      ...metadata,
      snoozedUntil: now + DAYS_7,
    });
  });
}

export async function getCompleteBackupReminderStatus(
  recordCount: number,
  now = Date.now(),
): Promise<CompleteBackupReminderStatus> {
  await queue;
  const metadata = await readMetadata();
  const changedRecordCount = metadata.changedRecordIds.length;
  let reason: CompleteBackupReminderStatus["reason"] = null;

  if (metadata.forceReminder) {
    reason = "restore";
  } else if (!metadata.lastSuccessfulBackupAt) {
    if (recordCount >= FIRST_BACKUP_RECORD_THRESHOLD) reason = "never-backed-up";
  } else if (now - metadata.lastSuccessfulBackupAt >= DAYS_30) {
    reason = "age";
  } else if (changedRecordCount >= CHANGE_THRESHOLD) {
    reason = "changes";
  }

  const snoozed = reason !== null && (metadata.snoozedUntil ?? 0) > now;
  return {
    due: reason !== null && !snoozed,
    snoozed,
    reason,
    lastSuccessfulBackupAt: metadata.lastSuccessfulBackupAt,
    changedRecordCount,
  };
}