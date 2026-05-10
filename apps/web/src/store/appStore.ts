import { create } from "zustand";
import type { AuthResponse, ProjectDto, ReminderDto, SubtaskDto, TagDto, TaskDto } from "@zada/api-client";
import {
  createSyncQueueItem,
  defaultNoteSyncSettings,
  getNextDueDate,
  nextNoteSyncStatus,
  parseQuickAdd,
  parseTaskOutline,
  type LocalNoteDraft,
  type NoteSyncSettings,
  type SubscriptionSnapshot,
  type TaskOutlineParseResult
} from "@zada/shared";
import { api } from "../lib/api";
import { db, type LocalProject, type LocalReminder, type LocalSubtask, type LocalTag, type LocalTask, type LocalTaskTag } from "../lib/db";
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
  subtasksByTaskId: Record<string, LocalSubtask[]>;
  remindersByTaskId: Record<string, LocalReminder[]>;
  dueReminders: LocalReminder[];
  tags: LocalTag[];
  taskTags: LocalTaskTag[];
  searchQuery: string;
  taskFilters: TaskFilters;
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
  setSearchQuery: (query: string) => void;
  setTaskFilters: (filters: Partial<TaskFilters>) => void;
  clearTaskFilters: () => void;
  loadTaskDetail: (taskId: string) => Promise<void>;
  createSubtask: (taskId: string, title: string) => Promise<void>;
  updateSubtask: (id: string, input: Partial<Pick<LocalSubtask, "title" | "completed" | "position">>) => Promise<void>;
  deleteSubtask: (id: string) => Promise<void>;
  createReminder: (taskId: string, remindAt: string) => Promise<void>;
  updateReminder: (id: string, input: Partial<Pick<LocalReminder, "remindAt" | "dismissedAt" | "type">>) => Promise<void>;
  deleteReminder: (id: string) => Promise<void>;
  dismissReminder: (id: string) => Promise<void>;
  refreshDueReminders: () => Promise<void>;
  createTag: (input: { name: string; color?: string | null }) => Promise<LocalTag | null>;
  assignTaskTag: (taskId: string, tagId: string) => Promise<void>;
  removeTaskTag: (taskId: string, tagId: string) => Promise<void>;
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
  startDate?: string | null;
  dueDate?: string | null;
  time?: string | null;
  repeat?: string | null;
  estimatedMinutes?: number | null;
  tags?: string[];
  gameArea?: string | null;
  severity?: string | null;
  buildVersion?: string | null;
  stepsToReproduce?: string | null;
  expectedResult?: string | null;
  actualResult?: string | null;
}

export interface TaskFilters {
  projectId: string | null;
  status: "all" | "todo" | "done";
  priority: string | null;
  type: string | null;
  tag: string | null;
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

const defaultTaskFilters: TaskFilters = {
  projectId: null,
  status: "all",
  priority: null,
  type: null,
  tag: null
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
  subtasksByTaskId: {},
  remindersByTaskId: {},
  dueReminders: [],
  tags: [],
  taskTags: [],
  searchQuery: "",
  taskFilters: defaultTaskFilters,
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
    const [projects, tasks, subtasks, reminders, tags, taskTags, notes, noteSettings, subscription] = await Promise.all([
      db.projects.toArray(),
      db.tasks.toArray(),
      db.subtasks.toArray(),
      db.reminders.toArray(),
      db.tags.toArray(),
      db.task_tags.toArray(),
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
      subtasksByTaskId: groupSubtasks(subtasks.filter((subtask) => !subtask.deletedAt)),
      remindersByTaskId: groupReminders(reminders.filter((reminder) => !reminder.deletedAt)),
      dueReminders: dueLocalReminders(reminders.filter((reminder) => !reminder.deletedAt)),
      tags: tags.filter((tag) => !tag.deletedAt),
      taskTags: taskTags.filter((taskTag) => !taskTag.deletedAt),
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
        const saved = normalizeProject(
          await api.createProject({
            id: project.id,
            name: project.name,
            description: project.description,
            type: project.type,
            workspaceId: project.workspaceId ?? undefined
          })
        );
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
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setTaskFilters: (filters) => set({ taskFilters: { ...get().taskFilters, ...filters } }),
  clearTaskFilters: () => set({ taskFilters: defaultTaskFilters, searchQuery: "" }),
  loadTaskDetail: async (taskId) => {
    if (canReachApi()) {
      try {
        const [{ subtasks }, { reminders }] = await Promise.all([api.listSubtasks(taskId), api.listReminders(taskId)]);
        const localSubtasks = subtasks.map(normalizeSubtask);
        const localReminders = reminders.map(normalizeReminder);
        await db.transaction("rw", db.subtasks, db.reminders, async () => {
          await db.subtasks.bulkPut(localSubtasks);
          await db.reminders.bulkPut(localReminders);
        });
        set({
          subtasksByTaskId: { ...get().subtasksByTaskId, [taskId]: localSubtasks },
          remindersByTaskId: { ...get().remindersByTaskId, [taskId]: localReminders },
          dueReminders: dueLocalReminders(Object.values({ ...get().remindersByTaskId, [taskId]: localReminders }).flat())
        });
      } catch {
        set({ syncState: "error" });
      }
    }
  },
  createSubtask: async (taskId, title) => {
    const task = get().tasks.find((candidate) => candidate.id === taskId);
    const trimmed = title.trim();
    if (!task || !trimmed) {
      return;
    }

    const subtask: LocalSubtask = {
      id: crypto.randomUUID(),
      workspaceId: task.workspaceId,
      taskId,
      title: trimmed,
      completed: false,
      position: get().subtasksByTaskId[taskId]?.length ?? 0,
      updatedAt: now()
    };

    await db.transaction("rw", db.subtasks, db.sync_queue, async () => {
      await db.subtasks.put(subtask);
      await db.sync_queue.put(createSyncQueueItem("subtask", subtask.id, "create", subtask));
    });

    set({ subtasksByTaskId: appendGrouped(get().subtasksByTaskId, taskId, subtask) });

    if (canReachApi()) {
      try {
        const saved = normalizeSubtask(
          await api.createSubtask(taskId, {
            id: subtask.id,
            title: subtask.title,
            completed: subtask.completed,
            position: subtask.position
          })
        );
        await db.subtasks.put(saved);
        await clearQueuedEntity("subtask", subtask.id);
        set({ subtasksByTaskId: replaceGrouped(get().subtasksByTaskId, taskId, saved) });
      } catch {
        set({ syncState: "error" });
      }
    }
  },
  updateSubtask: async (id, input) => {
    const subtask = findGrouped(get().subtasksByTaskId, id);
    if (!subtask) {
      return;
    }

    const updated: LocalSubtask = { ...subtask, ...input, title: input.title?.trim() ?? subtask.title, updatedAt: now() };
    await db.transaction("rw", db.subtasks, db.sync_queue, async () => {
      await db.subtasks.put(updated);
      await db.sync_queue.put(createSyncQueueItem("subtask", updated.id, "update", updated));
    });
    set({ subtasksByTaskId: replaceGrouped(get().subtasksByTaskId, updated.taskId, updated) });

    if (canReachApi()) {
      try {
        const saved = normalizeSubtask(await api.updateSubtask(id, input));
        await db.subtasks.put(saved);
        await clearQueuedEntity("subtask", id);
        set({ subtasksByTaskId: replaceGrouped(get().subtasksByTaskId, saved.taskId, saved) });
      } catch {
        set({ syncState: "error" });
      }
    }
  },
  deleteSubtask: async (id) => {
    const subtask = findGrouped(get().subtasksByTaskId, id);
    if (!subtask) {
      return;
    }

    const deletedAt = now();
    await db.transaction("rw", db.subtasks, db.sync_queue, async () => {
      await db.subtasks.put({ ...subtask, deletedAt, updatedAt: deletedAt });
      await db.sync_queue.put(createSyncQueueItem("subtask", id, "delete", { id, taskId: subtask.taskId, deletedAt }));
    });
    set({ subtasksByTaskId: removeGrouped(get().subtasksByTaskId, subtask.taskId, id) });

    if (canReachApi()) {
      try {
        await api.deleteSubtask(id);
        await clearQueuedEntity("subtask", id);
      } catch {
        set({ syncState: "error" });
      }
    }
  },
  createReminder: async (taskId, remindAt) => {
    const task = get().tasks.find((candidate) => candidate.id === taskId);
    if (!task || !remindAt) {
      return;
    }

    const reminder: LocalReminder = {
      id: crypto.randomUUID(),
      workspaceId: task.workspaceId,
      taskId,
      type: "task",
      remindAt,
      dismissedAt: null,
      updatedAt: now()
    };

    await db.transaction("rw", db.reminders, db.sync_queue, async () => {
      await db.reminders.put(reminder);
      await db.sync_queue.put(createSyncQueueItem("reminder", reminder.id, "create", reminder));
    });
    set({
      remindersByTaskId: appendGrouped(get().remindersByTaskId, taskId, reminder),
      dueReminders: dueLocalReminders([...Object.values(get().remindersByTaskId).flat(), reminder])
    });

    if (canReachApi()) {
      try {
        const saved = normalizeReminder(
          await api.createReminder(taskId, {
            id: reminder.id,
            remindAt: reminder.remindAt,
            type: reminder.type,
            dismissedAt: reminder.dismissedAt
          })
        );
        await db.reminders.put(saved);
        await clearQueuedEntity("reminder", reminder.id);
        set({ remindersByTaskId: replaceGrouped(get().remindersByTaskId, taskId, saved) });
      } catch {
        set({ syncState: "error" });
      }
    }
  },
  updateReminder: async (id, input) => {
    const reminder = findGrouped(get().remindersByTaskId, id);
    if (!reminder || !reminder.taskId) {
      return;
    }

    const updated: LocalReminder = { ...reminder, ...input, updatedAt: now() };
    await db.transaction("rw", db.reminders, db.sync_queue, async () => {
      await db.reminders.put(updated);
      await db.sync_queue.put(createSyncQueueItem("reminder", updated.id, "update", updated));
    });
    const grouped = replaceGrouped(get().remindersByTaskId, reminder.taskId, updated);
    set({ remindersByTaskId: grouped, dueReminders: dueLocalReminders(Object.values(grouped).flat()) });

    if (canReachApi()) {
      try {
        const saved = normalizeReminder(await api.updateReminder(id, input));
        await db.reminders.put(saved);
        await clearQueuedEntity("reminder", id);
        set({ remindersByTaskId: replaceGrouped(get().remindersByTaskId, saved.taskId ?? reminder.taskId, saved) });
      } catch {
        set({ syncState: "error" });
      }
    }
  },
  deleteReminder: async (id) => {
    const reminder = findGrouped(get().remindersByTaskId, id);
    if (!reminder || !reminder.taskId) {
      return;
    }

    const deletedAt = now();
    await db.transaction("rw", db.reminders, db.sync_queue, async () => {
      await db.reminders.put({ ...reminder, deletedAt, updatedAt: deletedAt });
      await db.sync_queue.put(createSyncQueueItem("reminder", id, "delete", { id, taskId: reminder.taskId, deletedAt }));
    });
    const grouped = removeGrouped(get().remindersByTaskId, reminder.taskId, id);
    set({ remindersByTaskId: grouped, dueReminders: dueLocalReminders(Object.values(grouped).flat()) });

    if (canReachApi()) {
      try {
        await api.deleteReminder(id);
        await clearQueuedEntity("reminder", id);
      } catch {
        set({ syncState: "error" });
      }
    }
  },
  dismissReminder: async (id) => {
    const reminder = findGrouped(get().remindersByTaskId, id) ?? get().dueReminders.find((candidate) => candidate.id === id);
    if (!reminder) {
      return;
    }

    await get().updateReminder(id, { dismissedAt: now() });

    if (canReachApi()) {
      try {
        const saved = normalizeReminder(await api.dismissReminder(id));
        await db.reminders.put(saved);
      } catch {
        set({ syncState: "error" });
      }
    }
  },
  refreshDueReminders: async () => {
    if (canReachApi()) {
      try {
        const { reminders } = await api.listDueReminders(new Date().toISOString());
        const localReminders = reminders.map(normalizeReminder);
        await db.reminders.bulkPut(localReminders);
        set({ dueReminders: localReminders });
        return;
      } catch {
        set({ syncState: "error" });
      }
    }

    set({ dueReminders: dueLocalReminders(Object.values(get().remindersByTaskId).flat()) });
  },
  createTag: async (input) => {
    const name = input.name.trim();
    if (!name) {
      return null;
    }

    const existing = get().tags.find((tag) => tag.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      return existing;
    }

    const tag: LocalTag = { id: crypto.randomUUID(), name, color: input.color ?? null, updatedAt: now() };
    await db.transaction("rw", db.tags, db.sync_queue, async () => {
      await db.tags.put(tag);
      await db.sync_queue.put(createSyncQueueItem("tag", tag.id, "create", tag));
    });
    set({ tags: [...get().tags, tag].sort((left, right) => left.name.localeCompare(right.name)) });

    if (canReachApi()) {
      try {
        const saved = normalizeTag(await api.createTag({ id: tag.id, name: tag.name, color: tag.color }));
        await db.tags.put(saved);
        await clearQueuedEntity("tag", tag.id);
        set({ tags: replaceById(get().tags, saved) });
        return saved;
      } catch {
        set({ syncState: "error" });
      }
    }

    return tag;
  },
  assignTaskTag: async (taskId, tagId) => {
    const tag = get().tags.find((candidate) => candidate.id === tagId);
    const task = get().tasks.find((candidate) => candidate.id === taskId);
    if (!tag || !task) {
      return;
    }

    const relation: LocalTaskTag = {
      id: taskTagId(taskId, tagId),
      taskId,
      tagId,
      workspaceId: task.workspaceId ?? tag.workspaceId,
      updatedAt: now()
    };
    const updatedTask = { ...task, tags: Array.from(new Set([...task.tags, tag.name])), updatedAt: now() };
    await db.transaction("rw", db.task_tags, db.tasks, db.sync_queue, async () => {
      await db.task_tags.put(relation);
      await db.tasks.put(updatedTask);
      await db.sync_queue.put(createSyncQueueItem("task_tag", relation.id, "create", relation));
      await db.sync_queue.put(createSyncQueueItem("task", taskId, "update", updatedTask));
    });
    set({
      taskTags: replaceOrAppend(get().taskTags, relation),
      tasks: replaceById(get().tasks, updatedTask)
    });

    if (canReachApi()) {
      try {
        const saved = normalizeTask(await api.assignTaskTag(taskId, tagId));
        await clearQueuedEntity("task_tag", relation.id);
        await clearQueuedEntity("task", taskId);
        await db.tasks.put(saved);
        set({ tasks: replaceById(get().tasks, saved) });
      } catch {
        set({ syncState: "error" });
      }
    }
  },
  removeTaskTag: async (taskId, tagId) => {
    const tag = get().tags.find((candidate) => candidate.id === tagId);
    const task = get().tasks.find((candidate) => candidate.id === taskId);
    if (!tag || !task) {
      return;
    }

    const relationId = taskTagId(taskId, tagId);
    const updatedTask = { ...task, tags: task.tags.filter((name) => name !== tag.name), updatedAt: now() };
    await db.transaction("rw", db.task_tags, db.tasks, db.sync_queue, async () => {
      await db.task_tags.put({ id: relationId, taskId, tagId, deletedAt: now(), updatedAt: now() });
      await db.tasks.put(updatedTask);
      await db.sync_queue.put(createSyncQueueItem("task_tag", relationId, "delete", { taskId, tagId }));
      await db.sync_queue.put(createSyncQueueItem("task", taskId, "update", updatedTask));
    });
    set({
      taskTags: get().taskTags.filter((relation) => relation.id !== relationId),
      tasks: replaceById(get().tasks, updatedTask)
    });

    if (canReachApi()) {
      try {
        await api.removeTaskTag(taskId, tagId);
        await clearQueuedEntity("task_tag", relationId);
        await clearQueuedEntity("task", taskId);
      } catch {
        set({ syncState: "error" });
      }
    }
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
      startDate: parsed.startDate,
      time: parsed.time,
      repeat: parsed.repeat,
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
  const [{ projects }, { tasks }, { tags }, { reminders: dueReminders }] = await Promise.all([
    api.listProjects(),
    api.listTasks(),
    api.listTags(),
    api.listDueReminders(new Date().toISOString())
  ]);
  const normalizedProjects = projects.map(normalizeProject);
  const normalizedTasks = tasks.map(normalizeTask);
  const normalizedTags = tags.map(normalizeTag);
  const normalizedSubtasks = tasks.flatMap((task) => (task.subtasks ?? []).map(normalizeSubtask));
  const normalizedReminders = [
    ...tasks.flatMap((task) => (task.reminders ?? []).map(normalizeReminder)),
    ...dueReminders.map(normalizeReminder)
  ];
  const normalizedTaskTags = tasks.flatMap((task) =>
    (task.taskTags ?? [])
      .map((taskTag) => normalizedTags.find((tag) => tag.name === taskTag.tag.name))
      .filter((tag): tag is LocalTag => Boolean(tag))
      .map((tag) => ({
        id: taskTagId(task.id, tag.id),
        taskId: task.id,
        tagId: tag.id,
        workspaceId: tag.workspaceId ?? task.workspaceId,
        updatedAt: now()
      }))
  );

  await db.transaction("rw", [db.projects, db.tasks, db.tags, db.task_tags, db.subtasks, db.reminders], async () => {
    await db.projects.bulkPut(normalizedProjects);
    await db.tasks.bulkPut(normalizedTasks);
    await db.tags.bulkPut(normalizedTags);
    await db.task_tags.bulkPut(normalizedTaskTags);
    await db.subtasks.bulkPut(normalizedSubtasks);
    await db.reminders.bulkPut(normalizedReminders);
  });

  set({
    authStatus: "authenticated",
    authError: null,
    currentUser: user,
    projects: normalizedProjects,
    activeProjectId: normalizedProjects[0]?.id ?? null,
    tasks: normalizedTasks,
    tags: normalizedTags,
    taskTags: normalizedTaskTags,
    subtasksByTaskId: groupSubtasks(normalizedSubtasks),
    remindersByTaskId: groupReminders(normalizedReminders),
    dueReminders: dueLocalReminders(normalizedReminders)
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
    estimatedMinutes: task.estimatedMinutes ?? null,
    completedAt: task.completedAt ?? null,
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

function normalizeSubtask(subtask: SubtaskDto): LocalSubtask {
  return {
    id: subtask.id,
    workspaceId: subtask.workspaceId,
    taskId: subtask.taskId,
    title: subtask.title,
    completed: subtask.completed,
    position: subtask.position ?? 0,
    updatedAt: subtask.updatedAt ?? now(),
    deletedAt: subtask.deletedAt ?? null
  };
}

function normalizeReminder(reminder: ReminderDto): LocalReminder {
  return {
    id: reminder.id,
    workspaceId: reminder.workspaceId,
    taskId: reminder.taskId ?? null,
    habitId: reminder.habitId ?? null,
    type: reminder.type ?? "task",
    remindAt: reminder.remindAt,
    deliveredAt: reminder.deliveredAt ?? null,
    dismissedAt: reminder.dismissedAt ?? null,
    updatedAt: reminder.updatedAt ?? now(),
    deletedAt: reminder.deletedAt ?? null
  };
}

function normalizeTag(tag: TagDto): LocalTag {
  return {
    id: tag.id,
    workspaceId: tag.workspaceId,
    name: tag.name,
    color: tag.color ?? null,
    updatedAt: tag.updatedAt ?? now(),
    deletedAt: tag.deletedAt ?? null
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
    startDate: input.startDate ?? null,
    time: input.time ?? null,
    repeat: input.repeat ?? null,
    estimatedMinutes: input.estimatedMinutes ?? null,
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
    estimatedMinutes: task.estimatedMinutes,
    completedAt: task.completedAt,
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

  const completedAt = now();
  const nextDueDate = completed ? getNextDueDate(task.dueDate, task.repeat, completedAt) : null;
  const updated: LocalTask = {
    ...task,
    completed: nextDueDate ? false : completed,
    status: nextDueDate ? "todo" : completed ? "done" : "todo",
    dueDate: nextDueDate ?? task.dueDate,
    completedAt: completed && !nextDueDate ? completedAt : null,
    updatedAt: completedAt
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

function replaceOrAppend<T extends { id: string }>(items: T[], next: T) {
  return items.some((item) => item.id === next.id) ? replaceById(items, next) : [...items, next];
}

function groupSubtasks(subtasks: LocalSubtask[]) {
  return groupByTaskId(subtasks.sort((left, right) => left.position - right.position));
}

function groupReminders(reminders: LocalReminder[]) {
  return groupByTaskId(reminders.sort((left, right) => left.remindAt.localeCompare(right.remindAt)));
}

function groupByTaskId<T extends { taskId?: string | null }>(items: T[]) {
  return items.reduce<Record<string, T[]>>((groups, item) => {
    if (!item.taskId) {
      return groups;
    }
    groups[item.taskId] = [...(groups[item.taskId] ?? []), item];
    return groups;
  }, {});
}

function appendGrouped<T extends { id: string }>(groups: Record<string, T[]>, taskId: string, item: T) {
  return { ...groups, [taskId]: [...(groups[taskId] ?? []), item] };
}

function replaceGrouped<T extends { id: string }>(groups: Record<string, T[]>, taskId: string, item: T) {
  return { ...groups, [taskId]: replaceOrAppend(groups[taskId] ?? [], item) };
}

function removeGrouped<T extends { id: string }>(groups: Record<string, T[]>, taskId: string, id: string) {
  return { ...groups, [taskId]: (groups[taskId] ?? []).filter((item) => item.id !== id) };
}

function findGrouped<T extends { id: string }>(groups: Record<string, T[]>, id: string) {
  return Object.values(groups)
    .flat()
    .find((item) => item.id === id);
}

function dueLocalReminders(reminders: LocalReminder[]) {
  const timestamp = Date.now();
  return reminders
    .filter((reminder) => !reminder.deletedAt && !reminder.dismissedAt && new Date(reminder.remindAt).getTime() <= timestamp)
    .sort((left, right) => left.remindAt.localeCompare(right.remindAt))
    .slice(0, 20);
}

function taskTagId(taskId: string, tagId: string) {
  return `${taskId}:${tagId}`;
}

function canReachApi() {
  return Boolean(getAccessToken()) && (typeof navigator === "undefined" || navigator.onLine);
}

async function clearQueuedEntity(entityType: string, entityId: string) {
  const queued = await db.sync_queue.where("entityId").equals(entityId).toArray();
  await db.sync_queue.bulkDelete(queued.filter((item) => item.entityType === entityType).map((item) => item.id));
}
