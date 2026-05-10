import type { SubscriptionSnapshot } from "@zada/shared";

export interface ApiClientOptions {
  baseUrl: string;
  getAccessToken?: () => string | null;
  onUnauthorized?: () => void;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
  };
  accessToken: string;
  refreshToken: string;
}

export interface CurrentUserResponse {
  user: AuthResponse["user"];
  workspaces: Array<{ id: string; name: string }>;
  settings: unknown;
}

export interface ProjectDto {
  id: string;
  name: string;
  description?: string | null;
  type?: string;
  workspaceId?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface TaskDto {
  id: string;
  workspaceId?: string;
  title: string;
  description?: string | null;
  projectId?: string | null;
  columnId?: string | null;
  parentId?: string | null;
  status?: string;
  type?: string;
  priority?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  time?: string | null;
  repeat?: string | null;
  estimatedMinutes?: number | null;
  completedAt?: string | null;
  gameArea?: string | null;
  severity?: string | null;
  buildVersion?: string | null;
  stepsToReproduce?: string | null;
  expectedResult?: string | null;
  actualResult?: string | null;
  position?: number;
  updatedAt?: string;
  deletedAt?: string | null;
  tags?: string[];
  subtasks?: SubtaskDto[];
  reminders?: ReminderDto[];
  taskTags?: Array<{ tag: { name: string } }>;
}

export interface SubtaskDto {
  id: string;
  workspaceId?: string;
  taskId: string;
  title: string;
  completed: boolean;
  position: number;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface ReminderDto {
  id: string;
  workspaceId?: string;
  taskId?: string | null;
  habitId?: string | null;
  type?: string;
  remindAt: string;
  deliveredAt?: string | null;
  dismissedAt?: string | null;
  updatedAt?: string;
  deletedAt?: string | null;
  task?: TaskDto | null;
}

export interface TagDto {
  id: string;
  workspaceId?: string;
  name: string;
  color?: string | null;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface TaskTagDto {
  id?: string;
  taskId: string;
  tagId: string;
}

export interface BillingStatusResponse {
  subscription: SubscriptionSnapshot;
  enabledFeatures: string[];
  availableFeatures: Record<string, { label: string; minimumPlan: string }>;
}

export class ZadaApiClient {
  constructor(private readonly options: ApiClientOptions) {}

  register(input: { email: string; password: string; name?: string }) {
    return this.request<AuthResponse>("/auth/register", { method: "POST", body: input, auth: false });
  }

  login(input: { email: string; password: string }) {
    return this.request<AuthResponse>("/auth/login", { method: "POST", body: input, auth: false });
  }

  refresh(refreshToken: string) {
    return this.request<Omit<AuthResponse, "user">>("/auth/refresh", {
      method: "POST",
      body: { refreshToken },
      auth: false
    });
  }

  logout(refreshToken?: string) {
    return this.request<void>("/auth/logout", { method: "POST", body: { refreshToken } });
  }

  me() {
    return this.request<CurrentUserResponse>("/auth/me");
  }

  forgotPassword(input: { email: string }) {
    return this.request<{ ok: boolean; resetToken?: string }>("/auth/forgot-password", {
      method: "POST",
      body: input,
      auth: false
    });
  }

  resetPassword(input: { email: string; resetToken: string; password: string }) {
    return this.request<{ ok: boolean }>("/auth/reset-password", { method: "POST", body: input, auth: false });
  }

  listProjects() {
    return this.request<{ projects: ProjectDto[] }>("/projects");
  }

  createProject(input: { id?: string; name: string; description?: string | null; type?: string; workspaceId?: string }) {
    return this.request<ProjectDto>("/projects", { method: "POST", body: input });
  }

  updateProject(id: string, input: { name?: string; description?: string | null }) {
    return this.request<ProjectDto>(`/projects/${id}`, { method: "PATCH", body: input });
  }

  deleteProject(id: string) {
    return this.request<void>(`/projects/${id}`, { method: "DELETE" });
  }

  listTasks(
    filters: {
      projectId?: string;
      status?: string;
      completed?: boolean;
      priority?: string;
      type?: string;
      tag?: string;
      dueFrom?: string;
      dueTo?: string;
      search?: string;
    } = {}
  ) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== "") {
        params.set(key, String(value));
      }
    }
    const query = params.toString();
    return this.request<{ tasks: TaskDto[] }>(`/tasks${query ? `?${query}` : ""}`);
  }

  getTask(id: string) {
    return this.request<TaskDto>(`/tasks/${id}`);
  }

  createTask(input: Partial<TaskDto> & { title: string }) {
    return this.request<TaskDto>("/tasks", { method: "POST", body: input });
  }

  updateTask(id: string, input: Partial<TaskDto>) {
    return this.request<TaskDto>(`/tasks/${id}`, { method: "PATCH", body: input });
  }

  deleteTask(id: string) {
    return this.request<void>(`/tasks/${id}`, { method: "DELETE" });
  }

  completeTask(id: string) {
    return this.request<TaskDto>(`/tasks/${id}/complete`, { method: "POST" });
  }

  uncompleteTask(id: string) {
    return this.request<TaskDto>(`/tasks/${id}/uncomplete`, { method: "POST" });
  }

  duplicateTask(id: string) {
    return this.request<TaskDto>(`/tasks/${id}/duplicate`, { method: "POST" });
  }

  reorderTasks(items: Array<{ id: string; position: number; columnId?: string | null }>) {
    return this.request<{ ok: boolean }>("/tasks/reorder", { method: "POST", body: { items } });
  }

  listSubtasks(taskId: string) {
    return this.request<{ subtasks: SubtaskDto[] }>(`/tasks/${taskId}/subtasks`);
  }

  createSubtask(taskId: string, input: Partial<SubtaskDto> & { title: string }) {
    return this.request<SubtaskDto>(`/tasks/${taskId}/subtasks`, { method: "POST", body: input });
  }

  updateSubtask(id: string, input: Partial<SubtaskDto>) {
    return this.request<SubtaskDto>(`/subtasks/${id}`, { method: "PATCH", body: input });
  }

  deleteSubtask(id: string) {
    return this.request<void>(`/subtasks/${id}`, { method: "DELETE" });
  }

  reorderSubtasks(items: Array<{ id: string; position: number }>) {
    return this.request<{ ok: boolean }>("/subtasks/reorder", { method: "POST", body: { items } });
  }

  listReminders(taskId: string) {
    return this.request<{ reminders: ReminderDto[] }>(`/tasks/${taskId}/reminders`);
  }

  createReminder(taskId: string, input: Partial<ReminderDto> & { remindAt: string }) {
    return this.request<ReminderDto>(`/tasks/${taskId}/reminders`, { method: "POST", body: input });
  }

  updateReminder(id: string, input: Partial<ReminderDto>) {
    return this.request<ReminderDto>(`/reminders/${id}`, { method: "PATCH", body: input });
  }

  deleteReminder(id: string) {
    return this.request<void>(`/reminders/${id}`, { method: "DELETE" });
  }

  dismissReminder(id: string) {
    return this.request<ReminderDto>(`/reminders/${id}/dismiss`, { method: "POST" });
  }

  listDueReminders(now?: string) {
    return this.request<{ reminders: ReminderDto[] }>(`/reminders/due${now ? `?now=${encodeURIComponent(now)}` : ""}`);
  }

  listTags() {
    return this.request<{ tags: TagDto[] }>("/tags");
  }

  createTag(input: { id?: string; name: string; color?: string | null; workspaceId?: string }) {
    return this.request<TagDto>("/tags", { method: "POST", body: input });
  }

  updateTag(id: string, input: Partial<TagDto>) {
    return this.request<TagDto>(`/tags/${id}`, { method: "PATCH", body: input });
  }

  deleteTag(id: string) {
    return this.request<void>(`/tags/${id}`, { method: "DELETE" });
  }

  assignTaskTag(taskId: string, tagId: string) {
    return this.request<TaskDto>(`/tasks/${taskId}/tags/${tagId}`, { method: "POST" });
  }

  removeTaskTag(taskId: string, tagId: string) {
    return this.request<void>(`/tasks/${taskId}/tags/${tagId}`, { method: "DELETE" });
  }

  previewImport(source: string) {
    return this.request("/import/preview", { method: "POST", body: { source } });
  }

  confirmImport(source: string) {
    return this.request("/import/confirm", { method: "POST", body: { source } });
  }

  createGameDevProject(projectName?: string) {
    return this.request("/import/game-dev-outline", { method: "POST", body: { projectName } });
  }

  billingStatus() {
    return this.request<BillingStatusResponse>("/billing/status");
  }

  checkout() {
    return this.request("/billing/checkout", { method: "POST" });
  }

  syncBootstrap() {
    return this.request("/sync/bootstrap");
  }

  syncPush(changes: unknown[]) {
    return this.request("/sync/push", { method: "POST", body: { changes } });
  }

  private async request<T>(path: string, init: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };

    if (init.auth !== false) {
      const token = this.options.getAccessToken?.();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    }

    const response = await fetch(`${this.options.baseUrl.replace(/\/$/, "")}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body)
    });

    if (response.status === 401) {
      this.options.onUnauthorized?.();
    }

    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(error?.error ?? `Request failed with ${response.status}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }
}
