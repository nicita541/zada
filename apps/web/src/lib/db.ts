import Dexie, { type Table } from "dexie";
import type { LocalNoteDraft, NoteSyncSettings, SyncQueueItem } from "@zada/shared";

export interface LocalEntity {
  id: string;
  workspaceId?: string | null;
  projectId?: string | null;
  title?: string;
  name?: string;
  updatedAt: string;
  deletedAt?: string | null;
  [key: string]: unknown;
}

export interface LocalProject {
  id: string;
  workspaceId?: string | null;
  name: string;
  description: string | null;
  type: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface LocalTask {
  id: string;
  workspaceId?: string | null;
  projectId?: string | null;
  columnId?: string | null;
  parentId?: string | null;
  title: string;
  description: string | null;
  status?: string;
  type: string;
  priority: string | null;
  startDate?: string | null;
  dueDate: string | null;
  time?: string | null;
  repeat?: string | null;
  gameArea?: string | null;
  severity?: string | null;
  buildVersion?: string | null;
  stepsToReproduce?: string | null;
  expectedResult?: string | null;
  actualResult?: string | null;
  position?: number;
  completed: boolean;
  tags: string[];
  updatedAt: string;
  deletedAt?: string | null;
}

export interface LocalSubscriptionCache {
  id: "current";
  snapshot: unknown;
  updatedAt: string;
}

export class ZadaLocalDatabase extends Dexie {
  projects!: Table<LocalProject, string>;
  board_columns!: Table<LocalEntity, string>;
  tasks!: Table<LocalTask, string>;
  tags!: Table<LocalEntity, string>;
  task_tags!: Table<LocalEntity, string>;
  subtasks!: Table<LocalEntity, string>;
  reminders!: Table<LocalEntity, string>;
  habits!: Table<LocalEntity, string>;
  habit_logs!: Table<LocalEntity, string>;
  notes!: Table<LocalNoteDraft, string>;
  references!: Table<LocalEntity, string>;
  code_snippets!: Table<LocalEntity, string>;
  milestones!: Table<LocalEntity, string>;
  focus_sessions!: Table<LocalEntity, string>;
  sync_queue!: Table<SyncQueueItem, string>;
  sync_meta!: Table<LocalEntity, string>;
  subscription_cache!: Table<LocalSubscriptionCache, string>;
  note_sync_settings!: Table<NoteSyncSettings & { id: "notes" }, string>;

  constructor() {
    super("zada-local");
    this.version(1).stores({
      tasks: "id, completed, dueDate, updatedAt",
      notes: "id, syncStatus, updatedAt",
      syncQueue: "id, entityType, entityId, createdAt",
      noteSettings: "id",
      subscription: "id"
    });
    this.version(2).stores({
      projects: "id, workspaceId, updatedAt",
      board_columns: "id, workspaceId, projectId, updatedAt",
      tasks: "id, completed, dueDate, updatedAt",
      tags: "id, workspaceId, name, updatedAt",
      task_tags: "id, taskId, tagId, updatedAt",
      subtasks: "id, taskId, updatedAt",
      reminders: "id, remindAt, updatedAt",
      habits: "id, workspaceId, updatedAt",
      habit_logs: "id, habitId, loggedFor, updatedAt",
      notes: "id, syncStatus, updatedAt",
      references: "id, workspaceId, projectId, updatedAt",
      code_snippets: "id, workspaceId, projectId, language, updatedAt",
      milestones: "id, workspaceId, projectId, updatedAt",
      focus_sessions: "id, taskId, startedAt, updatedAt",
      sync_queue: "id, entityType, entityId, createdAt",
      sync_meta: "id, updatedAt",
      subscription_cache: "id, updatedAt",
      note_sync_settings: "id"
    });
  }
}

export const db = new ZadaLocalDatabase();
