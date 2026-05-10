export type EntityId = string;

export type Priority = "p1" | "p2" | "p3" | "p4";

export type TaskType =
  | "feature"
  | "bug"
  | "polish"
  | "balance"
  | "art"
  | "audio"
  | "ui"
  | "code"
  | "design"
  | "research"
  | "testing"
  | "build"
  | "release"
  | "milestone";

export type RepeatRule = "daily" | "weekly" | "monthly" | "yearly" | "weekdays";

export type SyncStatus = "local_only" | "pending" | "synced" | "error";

export type PlanCode = "free" | "pro" | "lifetime_dev" | "admin";

export type UserRole = "user" | "developer" | "admin";

export type PremiumFeatureKey =
  | "unlimited_projects"
  | "advanced_stats"
  | "saved_filters"
  | "advanced_reminders"
  | "custom_themes"
  | "csv_export"
  | "advanced_import"
  | "game_dev_workspace"
  | "gdd_documents"
  | "game_concept_documents"
  | "code_snippets"
  | "local_file_references"
  | "game_dev_dashboard"
  | "bug_tracker_advanced"
  | "milestones_advanced";

export interface SyncableEntity {
  id: EntityId;
  userId: EntityId;
  workspaceId?: EntityId;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  syncRevision: number;
}

export interface TaskOutlineItem {
  id: EntityId;
  parentId: EntityId | null;
  outline: string | null;
  depth: number;
  title: string;
  description: string | null;
  completed: boolean;
  tags: string[];
  priority: Priority | null;
  dueDate: string | null;
  startDate: string | null;
  time: string | null;
  repeat: RepeatRule | null;
  remindAt: string | null;
  type: TaskType;
  projectRef: string | null;
  sourceLine: number;
}

export interface TaskOutlineTreeItem extends TaskOutlineItem {
  children: TaskOutlineTreeItem[];
}

export interface TaskOutlineParseResult {
  projectName: string | null;
  items: TaskOutlineItem[];
  tree: TaskOutlineTreeItem[];
  warnings: string[];
  errors: string[];
}

export interface QuickAddResult {
  title: string;
  tags: string[];
  priority: Priority | null;
  dueDate: string | null;
  startDate: string | null;
  time: string | null;
  repeat: RepeatRule | null;
  remindAt: string | null;
  type: TaskType;
  projectRef: string | null;
}

export type InternalLinkKind =
  | "Task"
  | "Note"
  | "Concept"
  | "File"
  | "GDD"
  | "Snippet"
  | "Bug"
  | "Milestone";

export interface InternalLink {
  raw: string;
  kind: InternalLinkKind;
  target: string;
  start: number;
  end: number;
}

export interface SubscriptionSnapshot {
  plan: PlanCode;
  role: UserRole;
  status: "inactive" | "active" | "past_due" | "canceled" | "manual";
  currentPeriodEnd: string | null;
  verifiedAt: string | null;
  entitlements: PremiumFeatureKey[];
}

export interface OfflinePremiumDecision {
  allowed: boolean;
  reason: "free_feature" | "active_plan" | "entitlement" | "offline_cache_valid" | "expired" | "missing";
}

export interface NoteSyncSettings {
  notesEnabled: boolean;
  uploadLocalNotesOnEnable: boolean;
}

export interface LocalNoteDraft {
  id: EntityId;
  title: string;
  content: string;
  tags: string[];
  syncStatus: SyncStatus;
  updatedAt: string;
}

export interface GameDevTemplate {
  projectName: string;
  columns: string[];
  conceptFields: string[];
  gddSections: string[];
  defaultTaskGroups: Array<{
    title: string;
    type: TaskType;
    tasks: string[];
  }>;
}
