export type SyncOperation = "create" | "update" | "delete";

export interface SyncQueueItem<TPayload = unknown> {
  id: string;
  entityType: string;
  entityId: string;
  operation: SyncOperation;
  payload: TPayload;
  createdAt: string;
  retryCount: number;
  lastError: string | null;
}

export interface SyncCursor {
  lastRevision: number;
  deviceId: string;
}

export function shouldPullChanges(localRevision: number, remoteRevision: number): boolean {
  return remoteRevision > localRevision;
}

export function resolveLastWriteWins<T extends { updatedAt: string }>(local: T, remote: T): T {
  return new Date(remote.updatedAt).getTime() >= new Date(local.updatedAt).getTime() ? remote : local;
}

export function createSyncQueueItem<TPayload>(
  entityType: string,
  entityId: string,
  operation: SyncOperation,
  payload: TPayload,
  now = new Date()
): SyncQueueItem<TPayload> {
  return {
    id: `${entityType}-${entityId}-${now.getTime()}`,
    entityType,
    entityId,
    operation,
    payload,
    createdAt: now.toISOString(),
    retryCount: 0,
    lastError: null
  };
}
