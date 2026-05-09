import { create } from "zustand";
import type { AuthResponse, ProjectDto, TaskDto } from "@zada/api-client";
import {
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
import { api } from "../lib/api";
import { db, type LocalProject, type LocalTask } from "../lib/db";
import { runManualSync } from "../lib/syncEngine";

interface AppState {
  activeView: ViewId;
  authStatus: AuthStatus;
  authError: string | null;
  currentUser: AuthUser | null;
  projects: LocalProject[];
  activeProjectId: string | null;
  selectedTaskId: string | null;
  tasks: LocalTask[];
  notes: LocalNoteDraft[];
  noteSettings: NoteSyncSettings;
  importSource: string;
  importPreview: TaskOutlineParseResult;
  subscription: SubscriptionSnapshot;
  syncState: "offline" | "idle" | "syncing" | "error";
  setActiveView: (view: ViewId) => void;
  hydrate: () => Promise<void>;
  login: (input: { email: string; password: string }) => Promise<void>;
  register: (input: { email: string; password: string; name?: string }) => Promise<void>;
  logout: () => Promise<void>;
  forgotPassword: (email: string) => Promise<string | null>;
  resetPassword: (input: { email: string; resetToken: string; password: string }) => Promise<void>;
  setActiveProject: (id: string | null) => void;
  createProject: (input: { name: string; description?: string }) => Promise<LocalProject>;
  updateProject: (id: string, input: { name?: string; description?: string | null }) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  selectTask: (id: string | null) => void;
  createTask: (input: TaskDraft) => Promise<LocalTask>;
  updateTask: (id: string, input: Partial<TaskDraft> & { completed?: boolean; status?: string }) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  completeTask: (id: string) => Promise<void>;
  uncompleteTask: (id: string) => Promise<void>;
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

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export type AuthUser = AuthResponse["user"];

export interface TaskDraft {
  title: string;
  description?: string | null;
  projectId?: string | null;
  type?: string;
  priority?: string | null;
  dueDate?: string | null;
  tags?: string[];
  gameArea?: string | null;
  severity?: string | null;
  buildVersion?: string | null;
  stepsToReproduce?: string | null;
  expectedResult?: string | null;
  actualResult?: string | null;
}

const now = () => new Date().toISOString();
const accessTokenKey = "zada.accessToken";
const refreshTokenKey = "zada.refreshToken";

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
    title: "Собрать идеи проекта",
    description: "Входящие остаются быстрыми и не перегруженными.",
    status: "todo",
    type: "feature",
    priority: "p2",
    dueDate: new Date().toISOString().slice(0, 10),
    completed: false,
    tags: ["planning"],
    updatedAt: now()
  },
  {
    id: "starter-gdd",
    title: "Набросать раздел GDD про бой",
    description: "Связать дизайн-заметки, баги и сниппеты по мере развития идеи.",
    status: "todo",
    type: "design",
    priority: "p1",
    dueDate: null,
    completed: false,
    tags: ["gdd", "combat"],
    updatedAt: now()
  }
];

const defaultImportSource = `# Проект: RPG Demo

1. Игрок [code]
  1.1 Реализовать движение #player #movement p1
  1.2 Реализовать атаку #combat p1
2. Боевая система [design]
  2.1 Описать тайминги удара #gdd
  2.2 Создать тестовый баг #combat [bug]
3. Вертикальный срез [milestone]
  3.1 Подготовить сборку #release`;

export const useAppStore = create<AppState>((set, get) => ({
  activeView: "today",
  authStatus: "loading",
  authError: null,
  currentUser: null,
  projects: [],
  activeProjectId: null,
  selectedTaskId: null,
  tasks: starterTasks,
  notes: [
    {
      id: "note-combat",
      title: "Боевая система",
      content: "## Тайминги\n\n[[Task: Набросать раздел GDD про бой]]\n\n```csharp\npublic void Attack() {}\n```",
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
    const [projects, tasks, notes, noteSettings, subscription] = await Promise.all([
      db.projects.toArray(),
      db.tasks.toArray(),
      db.notes.toArray(),
      db.note_sync_settings.get("notes"),
      db.subscription_cache.get("current")
    ]);

    if (tasks.length === 0) {
      await db.tasks.bulkPut(starterTasks);
    }

    const localProjects = projects.filter((project) => !project.deletedAt);
    const localTasks = tasks.length > 0 ? tasks.filter((task) => !task.deletedAt) : starterTasks;

    set({
      projects: localProjects,
      activeProjectId: localProjects[0]?.id ?? null,
      tasks: localTasks,
      notes: notes.length > 0 ? notes : get().notes,
      noteSettings: noteSettings ?? defaultNoteSyncSettings,
      subscription: (subscription?.snapshot as SubscriptionSnapshot | undefined) ?? defaultSubscription
    });

    if (!getAccessToken() && !getRefreshToken()) {
      set({ authStatus: "unauthenticated", currentUser: null });
      return;
    }

    try {
      await loadRemoteWorkspace(set);
    } catch (error) {
      clearTokens();
      set({
        authStatus: "unauthenticated",
        currentUser: null,
        authError: error instanceof Error ? error.message : null
      });
    }
  },
  login: async (input) => {
    set({ authStatus: "loading", authError: null });
    try {
      const response = await api.login(input);
      persistTokens(response);
      await loadRemoteWorkspace(set, response.user);
    } catch (error) {
      set({ authStatus: "unauthenticated", authError: error instanceof Error ? error.message : null });
      throw error;
    }
  },
  register: async (input) => {
    set({ authStatus: "loading", authError: null });
    try {
      const response = await api.register(input);
      persistTokens(response);
      await loadRemoteWorkspace(set, response.user);
    } catch (error) {
      set({ authStatus: "unauthenticated", authError: error instanceof Error ? error.message : null });
      throw error;
    }
  },
  logout: async () => {
    const refreshToken = getRefreshToken();
    try {
      if (getAccessToken()) {
        await api.logout(refreshToken ?? undefined);
      }
    } catch {
      // Local logout must still work when the API is unavailable.
    }
    clearTokens();
    set({ authStatus: "unauthenticated", currentUser: null, authError: null, selectedTaskId: null });
  },
  forgotPassword: async (email) => {
    try {
      const response = await api.forgotPassword({ email });
      set({ authError: null });
      return response.resetToken ?? null;
    } catch (error) {
      set({ authError: error instanceof Error ? error.message : null });
      throw error;
    }
  },
  resetPassword: async (input) => {
    try {
      await api.resetPassword(input);
      set({ authError: null });
    } catch (error) {
      set({ authError: error instanceof Error ? error.message : null });
      throw error;
    }
  },
  setActiveProject: (activeProjectId) => set({ activeProjectId }),
  createProject: async (input) => {
    const project: LocalProject = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      description: input.description?.trim() || null,
      type: "standard",
      updatedAt: now()
    };

    if (!project.name) {
      return project;
    }

    await db.transaction("rw", db.projects, db.sync_queue, async () => {
      await db.projects.put(project);
      await db.sync_queue.put(createSyncQueueItem("project", project.id, "create", project));
    });

    set({ projects: [project, ...get().projects], activeProjectId: project.id });

    if (canReachApi()) {
      try {
        const saved = normalizeProject(await api.createProject(project));
        await db.projects.put(saved);
        await clearQueuedEntity("project", project.id);
        set({ projects: replaceById(get().projects, saved), activeProjectId: saved.id });
        return saved;
      } catch {
        set({ syncState: "error" });
      }
    }

    return project;
  },
  updateProject: async (id, input) => {
    const existing = get().projects.find((project) => project.id === id);
    if (!existing) {
      return;
    }

    const updated: LocalProject = {
      ...existing,
      name: input.name?.trim() || existing.name,
      description: input.description === undefined ? existing.description : input.description?.trim() || null,
      updatedAt: now()
    };

    await db.transaction("rw", db.projects, db.sync_queue, async () => {
      await db.projects.put(updated);
      await db.sync_queue.put(createSyncQueueItem("project", updated.id, "update", updated));
    });

    set({ projects: replaceById(get().projects, updated) });

    if (canReachApi()) {
      try {
        const saved = normalizeProject(await api.updateProject(id, input));
        await db.projects.put(saved);
        await clearQueuedEntity("project", id);
        set({ projects: replaceById(get().projects, saved) });
      } catch {
        set({ syncState: "error" });
      }
    }
  },
  deleteProject: async (id) => {
    const deletedAt = now();
    await db.transaction("rw", db.projects, db.sync_queue, async () => {
      const existing = await db.projects.get(id);
      if (existing) {
        await db.projects.put({ ...existing, deletedAt, updatedAt: deletedAt });
      }
      await db.sync_queue.put(createSyncQueueItem("project", id, "delete", { id, deletedAt }));
    });

    set({
      projects: get().projects.filter((project) => project.id !== id),
      activeProjectId: get().activeProjectId === id ? null : get().activeProjectId
    });

    if (canReachApi()) {
      try {
        await api.deleteProject(id);
        await clearQueuedEntity("project", id);
      } catch {
        set({ syncState: "error" });
      }
    }
  },
  selectTask: (selectedTaskId) => set({ selectedTaskId }),
  createTask: async (input) => {
    const task = localTaskFromDraft(input, get().activeProjectId);
    if (!task.title) {
      return task;
    }

    await db.transaction("rw", db.tasks, db.sync_queue, async () => {
      await db.tasks.put(task);
      await db.sync_queue.put(createSyncQueueItem("task", task.id, "create", task));
    });

    set({ tasks: [task, ...get().tasks] });

    if (canReachApi()) {
      try {
        const saved = normalizeTask(await api.createTask(taskPayload(task)));
        await db.tasks.put(saved);
        await clearQueuedEntity("task", task.id);
        set({ tasks: replaceById(get().tasks, saved) });
        return saved;
      } catch {
        set({ syncState: "error" });
      }
    }

    return task;
  },
  updateTask: async (id, input) => {
    const existing = get().tasks.find((task) => task.id === id);
    if (!existing) {
      return;
    }

    const status = input.status ?? (input.completed === undefined ? existing.status : input.completed ? "done" : "todo");
    const updated: LocalTask = {
      ...existing,
      ...input,
      status,
      completed: input.completed ?? status === "done",
      tags: input.tags ?? existing.tags,
      updatedAt: now()
    };

    await db.transaction("rw", db.tasks, db.sync_queue, async () => {
      await db.tasks.put(updated);
      await db.sync_queue.put(createSyncQueueItem("task", updated.id, "update", updated));
    });

    set({ tasks: replaceById(get().tasks, updated) });

    if (canReachApi()) {
      try {
        const saved = normalizeTask(await api.updateTask(id, taskPayload(updated)));
        await db.tasks.put(saved);
        await clearQueuedEntity("task", id);
        set({ tasks: replaceById(get().tasks, saved) });
      } catch {
        set({ syncState: "error" });
      }
    }
  },
  deleteTask: async (id) => {
    const deletedAt = now();
    await db.transaction("rw", db.tasks, db.sync_queue, async () => {
      const existing = await db.tasks.get(id);
      if (existing) {
        await db.tasks.put({ ...existing, deletedAt, updatedAt: deletedAt });
      }
      await db.sync_queue.put(createSyncQueueItem("task", id, "delete", { id, deletedAt }));
    });

    set({
      tasks: get().tasks.filter((task) => task.id !== id),
      selectedTaskId: get().selectedTaskId === id ? null : get().selectedTaskId
    });

    if (canReachApi()) {
      try {
        await api.deleteTask(id);
        await clearQueuedEntity("task", id);
      } catch {
        set({ syncState: "error" });
      }
    }
  },
  completeTask: async (id) => {
    await updateCompletion(id, true, set, get);
  },
  uncompleteTask: async (id) => {
    await updateCompletion(id, false, set, get);
  },
  quickAdd: async (input) => {
    const parsed = parseQuickAdd(input);
    if (!parsed.title) {
      return;
    }

    await get().createTask({
      title: parsed.title,
      description: null,
      type: parsed.type,
      priority: parsed.priority,
      dueDate: parsed.dueDate,
      tags: parsed.tags
    });
  },
  toggleTask: async (id) => {
    const task = get().tasks.find((candidate) => candidate.id === id);
    if (!task) {
      return;
    }

    if (task.completed) {
      await get().uncompleteTask(id);
    } else {
      await get().completeTask(id);
    }
  },
  setImportSource: (importSource) => {
    set({ importSource, importPreview: parseTaskOutline(importSource) });
  },
  confirmImport: async () => {
    const preview = get().importPreview;
    const tasks = preview.items.map<LocalTask>((item, position) => ({
      id: crypto.randomUUID(),
      projectId: get().activeProjectId,
      title: item.title,
      description: item.description,
      status: item.completed ? "done" : "todo",
      type: item.type,
      priority: item.priority,
      dueDate: item.dueDate,
      completed: item.completed,
      tags: item.tags,
      position,
      updatedAt: now()
    }));

    await db.transaction("rw", db.tasks, db.sync_queue, async () => {
      await db.tasks.bulkPut(tasks);
      await db.sync_queue.bulkPut(tasks.map((task) => createSyncQueueItem("task", task.id, "create", task)));
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

    await db.transaction("rw", db.notes, db.sync_queue, async () => {
      await db.notes.put(note);
      if (note.syncStatus !== "local_only") {
        await db.sync_queue.put(createSyncQueueItem("note", note.id, existing ? "update" : "create", note));
      }
    });

    set({
      notes: existing ? replaceById(get().notes, note) : [note, ...get().notes]
    });
  },
  toggleNotesSync: async (enabled) => {
    const settings = { notesEnabled: enabled, uploadLocalNotesOnEnable: enabled };
    await db.note_sync_settings.put({ id: "notes", ...settings });
    set({ noteSettings: settings });
  },
  cacheSubscription: async (snapshot) => {
    await db.subscription_cache.put({ id: "current", snapshot, updatedAt: now() });
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

function getAccessToken() {
  return localStorage.getItem(accessTokenKey);
}

function getRefreshToken() {
  return localStorage.getItem(refreshTokenKey);
}

function persistTokens(response: AuthResponse) {
  localStorage.setItem(accessTokenKey, response.accessToken);
  localStorage.setItem(refreshTokenKey, response.refreshToken);
}

function clearTokens() {
  localStorage.removeItem(accessTokenKey);
  localStorage.removeItem(refreshTokenKey);
}

async function loadRemoteWorkspace(
  set: (partial: Partial<AppState>) => void,
  knownUser?: AuthUser
) {
  const user = knownUser ?? (await currentUserWithRefresh()).user;
  const [{ projects }, { tasks }] = await Promise.all([api.listProjects(), api.listTasks()]);
  const normalizedProjects = projects.map(normalizeProject);
  const normalizedTasks = tasks.map(normalizeTask);

  await db.transaction("rw", db.projects, db.tasks, async () => {
    await db.projects.bulkPut(normalizedProjects);
    await db.tasks.bulkPut(normalizedTasks);
  });

  set({
    authStatus: "authenticated",
    authError: null,
    currentUser: user,
    projects: normalizedProjects,
    activeProjectId: normalizedProjects[0]?.id ?? null,
    tasks: normalizedTasks
  });
}

async function currentUserWithRefresh() {
  try {
    return await api.me();
  } catch (error) {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      throw error;
    }

    const tokens = await api.refresh(refreshToken);
    localStorage.setItem(accessTokenKey, tokens.accessToken);
    localStorage.setItem(refreshTokenKey, tokens.refreshToken);
    return api.me();
  }
}

function normalizeProject(project: ProjectDto): LocalProject {
  return {
    id: project.id,
    workspaceId: project.workspaceId,
    name: project.name,
    description: project.description ?? null,
    type: project.type ?? "standard",
    updatedAt: project.updatedAt ?? now(),
    deletedAt: project.deletedAt ?? null
  };
}

function normalizeTask(task: TaskDto): LocalTask {
  const tags = task.tags ?? task.taskTags?.map((taskTag) => taskTag.tag.name) ?? [];
  const status = task.status ?? "todo";

  return {
    id: task.id,
    workspaceId: task.workspaceId,
    projectId: task.projectId ?? null,
    columnId: task.columnId ?? null,
    parentId: task.parentId ?? null,
    title: task.title,
    description: task.description ?? null,
    status,
    type: task.type ?? "feature",
    priority: task.priority ?? null,
    startDate: dateOnly(task.startDate),
    dueDate: dateOnly(task.dueDate),
    time: task.time ?? null,
    repeat: task.repeat ?? null,
    gameArea: task.gameArea ?? null,
    severity: task.severity ?? null,
    buildVersion: task.buildVersion ?? null,
    stepsToReproduce: task.stepsToReproduce ?? null,
    expectedResult: task.expectedResult ?? null,
    actualResult: task.actualResult ?? null,
    position: task.position ?? 0,
    completed: status === "done",
    tags,
    updatedAt: task.updatedAt ?? now(),
    deletedAt: task.deletedAt ?? null
  };
}

function localTaskFromDraft(input: TaskDraft, activeProjectId: string | null): LocalTask {
  return {
    id: crypto.randomUUID(),
    projectId: input.projectId === undefined ? activeProjectId : input.projectId,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    status: "todo",
    type: input.type ?? "feature",
    priority: input.priority ?? null,
    dueDate: input.dueDate ?? null,
    completed: false,
    tags: input.tags ?? [],
    gameArea: input.gameArea ?? null,
    severity: input.severity ?? null,
    buildVersion: input.buildVersion ?? null,
    stepsToReproduce: input.stepsToReproduce ?? null,
    expectedResult: input.expectedResult ?? null,
    actualResult: input.actualResult ?? null,
    updatedAt: now()
  };
}

function taskPayload(task: LocalTask): Partial<TaskDto> & { title: string } {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    projectId: task.projectId,
    columnId: task.columnId,
    parentId: task.parentId,
    status: task.completed ? "done" : (task.status ?? "todo"),
    type: task.type,
    priority: task.priority,
    startDate: task.startDate,
    dueDate: task.dueDate,
    time: task.time,
    repeat: task.repeat,
    gameArea: task.gameArea,
    severity: task.severity,
    buildVersion: task.buildVersion,
    stepsToReproduce: task.stepsToReproduce,
    expectedResult: task.expectedResult,
    actualResult: task.actualResult,
    position: task.position,
    tags: task.tags
  };
}

async function updateCompletion(
  id: string,
  completed: boolean,
  set: (partial: Partial<AppState>) => void,
  get: () => AppState
) {
  const task = get().tasks.find((candidate) => candidate.id === id);
  if (!task) {
    return;
  }

  const updated: LocalTask = {
    ...task,
    completed,
    status: completed ? "done" : "todo",
    updatedAt: now()
  };

  await db.transaction("rw", db.tasks, db.sync_queue, async () => {
    await db.tasks.put(updated);
    await db.sync_queue.put(createSyncQueueItem("task", id, "update", updated));
  });

  set({ tasks: replaceById(get().tasks, updated) });

  if (canReachApi()) {
    try {
      const saved = normalizeTask(completed ? await api.completeTask(id) : await api.uncompleteTask(id));
      await db.tasks.put(saved);
      await clearQueuedEntity("task", id);
      set({ tasks: replaceById(get().tasks, saved) });
    } catch {
      set({ syncState: "error" });
    }
  }
}

function dateOnly(value: string | null | undefined) {
  return value ? value.slice(0, 10) : null;
}

function replaceById<T extends { id: string }>(items: T[], next: T) {
  return items.map((item) => (item.id === next.id ? next : item));
}

function canReachApi() {
  return Boolean(getAccessToken()) && (typeof navigator === "undefined" || navigator.onLine);
}

async function clearQueuedEntity(entityType: string, entityId: string) {
  const queued = await db.sync_queue.where("entityId").equals(entityId).toArray();
  await db.sync_queue.bulkDelete(queued.filter((item) => item.entityType === entityType).map((item) => item.id));
}
