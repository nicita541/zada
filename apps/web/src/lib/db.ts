import Dexie, { type Table } from "dexie";
import type { LocalNoteDraft, NoteSyncSettings, SyncQueueItem } from "@zada/shared";

export interface LocalTask {
  id: string;
  title: string;
  description: string | null;
  type: string;
  priority: string | null;
  dueDate: string | null;
  completed: boolean;
  tags: string[];
  updatedAt: string;
}

export interface LocalSubscriptionCache {
  id: "current";
  snapshot: unknown;
  updatedAt: string;
}

export class ZadaLocalDatabase extends Dexie {
  tasks!: Table<LocalTask, string>;
  notes!: Table<LocalNoteDraft, string>;
  syncQueue!: Table<SyncQueueItem, string>;
  noteSettings!: Table<NoteSyncSettings & { id: "notes" }, string>;
  subscription!: Table<LocalSubscriptionCache, string>;

  constructor() {
    super("zada-local");
    this.version(1).stores({
      tasks: "id, completed, dueDate, updatedAt",
      notes: "id, syncStatus, updatedAt",
      syncQueue: "id, entityType, entityId, createdAt",
      noteSettings: "id",
      subscription: "id"
    });
  }
}

export const db = new ZadaLocalDatabase();
