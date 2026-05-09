import { create } from "zustand";
import {
  createGameDevOutline,
  createSyncQueueItem,
  defaultNoteSyncSettings,
  nextNoteSyncStatus,
  parseQuickAdd,
  parseTaskOutline,
  type LocalNoteDraft,
  type NoteSyncSettings,
  type SubscriptionSnapshot,
  type TaskOutlineParseResult
} from "@zada/shared";
import { db, type LocalTask } from "../lib/db";
import { runManualSync } from "../lib/syncEngine";

interface AppState {
  activeView: ViewId;
  tasks: LocalTask[];
  notes: LocalNoteDraft[];
  noteSettings: NoteSyncSettings;
  importSource: string;
  importPreview: TaskOutlineParseResult;
  subscription: SubscriptionSnapshot;
  syncState: "offline" | "idle" | "syncing" | "error";
  setActiveView: (view: ViewId) => void;
  hydrate: () => Promise<void>;
  quickAdd: (input: string) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  setImportSource: (source: string) => void;
  confirmImport: () => Promise<void>;
  createGameDevWorkspace: () => void;
  saveNote: (note: Pick<LocalNoteDraft, "title" | "content" | "tags"> & { id?: string }) => Promise<void>;
  toggleNotesSync: (enabled: boolean) => Promise<void>;
  cacheSubscription: (snapshot: SubscriptionSnapshot) => Promise<void>;
  manualSync: () => Promise<void>;
}

export type ViewId =
  | "today"
  | "projects"
  | "calendar"
  | "habits"
  | "notes"
  | "import"
  | "game-dev"
  | "focus"
  | "stats"
  | "settings"
  | "subscription";

const now = () => new Date().toISOString();

const defaultSubscription: SubscriptionSnapshot = {
  plan: "free",
  role: "user",
  status: "inactive",
  currentPeriodEnd: null,
  verifiedAt: null,
  entitlements: []
};

const starterTasks: LocalTask[] = [
  {
    id: "starter-inbox",
    title: "Collect project ideas",
    description: "Inbox stays fast and uncluttered.",
    type: "feature",
    priority: "p2",
    dueDate: new Date().toISOString().slice(0, 10),
    completed: false,
    tags: ["planning"],
    updatedAt: now()
  },
  {
    id: "starter-gdd",
    title: "Draft GDD combat section",
    description: "Link design notes, bugs, and snippets as the idea matures.",
    type: "design",
    priority: "p1",
    dueDate: null,
    completed: false,
    tags: ["gdd", "combat"],
    updatedAt: now()
  }
];

const defaultImportSource = createGameDevOutline("RPG Demo");

export const useAppStore = create<AppState>((set, get) => ({
  activeView: "today",
  tasks: starterTasks,
  notes: [
    {
      id: "note-combat",
      title: "Combat System",
      content: "## Timing\n\n[[Task: Draft GDD combat section]]\n\n```csharp\npublic void Attack() {}\n```",
      tags: ["combat"],
      syncStatus: "pending",
      updatedAt: now()
    }
  ],
  noteSettings: defaultNoteSyncSettings,
  importSource: defaultImportSource,
  importPreview: parseTaskOutline(defaultImportSource),
  subscription: defaultSubscription,
  syncState: typeof navigator === "undefined" || navigator.onLine ? "idle" : "offline",
  setActiveView: (activeView) => set({ activeView }),
  hydrate: async () => {
    const [tasks, notes, noteSettings, subscription] = await Promise.all([
      db.tasks.toArray(),
      db.notes.toArray(),
      db.noteSettings.get("notes"),
      db.subscription.get("current")
    ]);

    if (tasks.length === 0) {
      await db.tasks.bulkPut(starterTasks);
    }

    set({
      tasks: tasks.length > 0 ? tasks : starterTasks,
      notes: notes.length > 0 ? notes : get().notes,
      noteSettings: noteSettings ?? defaultNoteSyncSettings,
      subscription: (subscription?.snapshot as SubscriptionSnapshot | undefined) ?? defaultSubscription
    });
  },
  quickAdd: async (input) => {
    const parsed = parseQuickAdd(input);
    if (!parsed.title) {
      return;
    }

    const task: LocalTask = {
      id: crypto.randomUUID(),
      title: parsed.title,
      description: null,
      type: parsed.type,
      priority: parsed.priority,
      dueDate: parsed.dueDate,
      completed: false,
      tags: parsed.tags,
      updatedAt: now()
    };

    await db.transaction("rw", db.tasks, db.syncQueue, async () => {
      await db.tasks.put(task);
      await db.syncQueue.put(createSyncQueueItem("task", task.id, "create", task));
    });
    set({ tasks: [task, ...get().tasks] });
  },
  toggleTask: async (id) => {
    const task = get().tasks.find((candidate) => candidate.id === id);
    if (!task) {
      return;
    }

    const updated = { ...task, completed: !task.completed, updatedAt: now() };
    await db.transaction("rw", db.tasks, db.syncQueue, async () => {
      await db.tasks.put(updated);
      await db.syncQueue.put(createSyncQueueItem("task", updated.id, "update", updated));
    });

    set({ tasks: get().tasks.map((candidate) => (candidate.id === id ? updated : candidate)) });
  },
  setImportSource: (importSource) => {
    set({ importSource, importPreview: parseTaskOutline(importSource) });
  },
  confirmImport: async () => {
    const preview = get().importPreview;
    const tasks = preview.items.map<LocalTask>((item) => ({
      id: crypto.randomUUID(),
      title: item.title,
      description: item.description,
      type: item.type,
      priority: item.priority,
      dueDate: item.dueDate,
      completed: item.completed,
      tags: item.tags,
      updatedAt: now()
    }));

    await db.transaction("rw", db.tasks, db.syncQueue, async () => {
      await db.tasks.bulkPut(tasks);
      await db.syncQueue.bulkPut(tasks.map((task) => createSyncQueueItem("task", task.id, "create", task)));
    });

    set({ tasks: [...tasks, ...get().tasks], activeView: "today" });
  },
  createGameDevWorkspace: () => {
    set({ activeView: "import", importSource: defaultImportSource, importPreview: parseTaskOutline(defaultImportSource) });
  },
  saveNote: async (noteInput) => {
    const existing = noteInput.id ? get().notes.find((note) => note.id === noteInput.id) : null;
    const note: LocalNoteDraft = {
      id: noteInput.id ?? crypto.randomUUID(),
      title: noteInput.title,
      content: noteInput.content,
      tags: noteInput.tags,
      syncStatus: nextNoteSyncStatus(get().noteSettings, existing?.syncStatus),
      updatedAt: now()
    };

    await db.transaction("rw", db.notes, db.syncQueue, async () => {
      await db.notes.put(note);
      if (note.syncStatus !== "local_only") {
        await db.syncQueue.put(createSyncQueueItem("note", note.id, existing ? "update" : "create", note));
      }
    });

    set({
      notes: existing ? get().notes.map((candidate) => (candidate.id === note.id ? note : candidate)) : [note, ...get().notes]
    });
  },
  toggleNotesSync: async (enabled) => {
    const settings = { notesEnabled: enabled, uploadLocalNotesOnEnable: enabled };
    await db.noteSettings.put({ id: "notes", ...settings });
    set({ noteSettings: settings });
  },
  cacheSubscription: async (snapshot) => {
    await db.subscription.put({ id: "current", snapshot, updatedAt: now() });
    set({ subscription: snapshot });
  },
  manualSync: async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      set({ syncState: "offline" });
      return;
    }

    set({ syncState: "syncing" });
    try {
      await runManualSync();
      set({ syncState: "idle" });
    } catch {
      set({ syncState: "error" });
    }
  }
}));
