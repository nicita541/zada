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

  me() {
    return this.request("/auth/me");
  }

  listProjects() {
    return this.request("/projects");
  }

  listTasks() {
    return this.request("/tasks");
  }

  createTask(input: { title: string; description?: string; type?: string; priority?: string | null; dueDate?: string }) {
    return this.request("/tasks", { method: "POST", body: input });
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
