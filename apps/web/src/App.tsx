import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  Archive,
  Bell,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardList,
  Code2,
  Columns3,
  Download,
  FileCode2,
  FileText,
  Flame,
  Gauge,
  Import,
  Link2,
  Moon,
  MoreHorizontal,
  NotebookText,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Sun,
  Timer,
  Upload,
  Zap
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Badge, Button, Panel } from "@zada/ui";
import { canUseFeatureOffline, gameDevTemplate, parseInternalLinks, premiumFeatures } from "@zada/shared";
import { useAppStore, type ViewId } from "./store/appStore";
import { api } from "./lib/api";
import { I18nProvider, useI18n, type Locale, type TranslationKey } from "./i18n";

const navItems: Array<{ id: ViewId; labelKey: TranslationKey; icon: ReactNode }> = [
  { id: "today", labelKey: "nav.today", icon: <ClipboardList size={18} /> },
  { id: "projects", labelKey: "nav.projects", icon: <Columns3 size={18} /> },
  { id: "calendar", labelKey: "nav.calendar", icon: <CalendarDays size={18} /> },
  { id: "habits", labelKey: "nav.habits", icon: <Flame size={18} /> },
  { id: "notes", labelKey: "nav.notes", icon: <NotebookText size={18} /> },
  { id: "import", labelKey: "nav.import", icon: <Import size={18} /> },
  { id: "game-dev", labelKey: "nav.gameDev", icon: <FileCode2 size={18} /> },
  { id: "focus", labelKey: "nav.focus", icon: <Timer size={18} /> },
  { id: "stats", labelKey: "nav.stats", icon: <Gauge size={18} /> },
  { id: "settings", labelKey: "nav.settings", icon: <Settings size={18} /> }
];

type TFunction = ReturnType<typeof useI18n>["t"];

export default function App() {
  const hydrate = useAppStore((state) => state.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <I18nProvider>
      <div className="app-root">
        <AppShell />
      </div>
    </I18nProvider>
  );
}

function AppShell() {
  const { t } = useI18n();
  const activeView = useAppStore((state) => state.activeView);
  const setActiveView = useAppStore((state) => state.setActiveView);
  const syncState = useAppStore((state) => state.syncState);
  const manualSync = useAppStore((state) => state.manualSync);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand-mark">Z</div>
          <div>
            <div className="brand-name">{t("common.appName")}</div>
            <div className="brand-meta">{t("shell.personalWorkspace")}</div>
          </div>
        </div>
        <nav className="sidebar-nav" aria-label={t("shell.mainNavigation")}>
          {navItems.map((item) => {
            const label = t(item.labelKey);
            return (
              <button
                className={`nav-button ${activeView === item.id ? "active" : ""}`}
                key={item.id}
                onClick={() => setActiveView(item.id)}
                title={label}
              >
                {item.icon}
                <span>{label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="search-box">
            <Search size={18} />
            <input placeholder={t("common.searchPlaceholder")} />
          </div>
          <div className="topbar-actions">
            <SyncIndicator state={syncState} />
            <button className="icon-button" title={t("common.syncNow")} onClick={manualSync}>
              <RefreshCw size={18} />
            </button>
            <button className="icon-button notification-button" title={t("shell.notifications")}>
              <Bell size={18} />
            </button>
            <button className="icon-button" title={t("nav.subscription")} onClick={() => setActiveView("subscription")}>
              <Sparkles size={18} />
            </button>
            <button className="icon-button" title={t("shell.toggleTheme")} onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>
          </div>
        </header>

        <div className="content-scroll">
          <ViewRenderer view={activeView} />
        </div>
      </main>

      <MobileNav activeView={activeView} setActiveView={setActiveView} />
      <button className="fab" title={t("shell.addTask")} onClick={() => setActiveView("today")}>
        <Plus size={22} />
      </button>
    </div>
  );
}

function ViewRenderer({ view }: { view: ViewId }) {
  switch (view) {
    case "projects":
      return <ProjectsView />;
    case "calendar":
      return <CalendarView />;
    case "habits":
      return <HabitsView />;
    case "notes":
      return <NotesView />;
    case "import":
      return <ImportView />;
    case "game-dev":
      return <GameDevView />;
    case "focus":
      return <FocusView />;
    case "stats":
      return <StatsView />;
    case "settings":
      return <SettingsView />;
    case "subscription":
      return <SubscriptionView />;
    default:
      return <TodayView />;
  }
}

function TodayView() {
  const { t } = useI18n();
  const tasks = useAppStore((state) => state.tasks);
  const toggleTask = useAppStore((state) => state.toggleTask);
  const completedCount = tasks.filter((task) => task.completed).length;
  const openTasks = tasks.filter((task) => !task.completed);

  return (
    <div className="page-grid">
      <section className="page-main">
        <PageHeader title={t("nav.today")} meta={t("today.metaOpenTasks", { count: openTasks.length })} />
        <QuickAdd />
        <div className="task-list">
          {tasks.map((task) => (
            <article className={`task-row ${task.completed ? "done" : ""}`} key={task.id}>
              <button className="check-button" title={t("today.toggleComplete")} onClick={() => toggleTask(task.id)}>
                {task.completed ? <Check size={15} /> : null}
              </button>
              <div className="task-body">
                <div className="task-title-row">
                  <h3>{task.title}</h3>
                  <Badge tone={task.type === "bug" ? "danger" : task.type === "design" ? "info" : "neutral"}>
                    {dynamicLabel(t, `taskTypes.${task.type}`, task.type)}
                  </Badge>
                </div>
                {task.description ? <p>{task.description}</p> : null}
                <div className="task-meta">
                  {task.priority ? <span>{task.priority.toUpperCase()}</span> : null}
                  {task.dueDate ? <span>{task.dueDate}</span> : null}
                  {task.tags.map((tag) => (
                    <span key={tag}>#{tag}</span>
                  ))}
                </div>
              </div>
              <button className="icon-button small" title={t("today.openTask")}>
                <ChevronRight size={16} />
              </button>
            </article>
          ))}
        </div>
      </section>

      <aside className="page-side">
        <Panel>
          <PanelTitle icon={<Gauge size={18} />} title={t("today.dailyLoad")} />
          <div className="metric-grid">
            <Metric label={t("today.open")} value={openTasks.length} />
            <Metric label={t("common.done")} value={completedCount} />
            <Metric label={t("nav.focus")} value="50m" />
            <Metric label={t("common.sync")} value={t("common.local")} />
          </div>
        </Panel>
        <Panel>
          <PanelTitle icon={<CalendarDays size={18} />} title={t("today.upcoming")} />
          <div className="compact-list">
            {tasks
              .filter((task) => task.dueDate)
              .slice(0, 4)
              .map((task) => (
                <div className="compact-row" key={task.id}>
                  <span>{task.title}</span>
                  <strong>{task.dueDate}</strong>
                </div>
              ))}
          </div>
        </Panel>
      </aside>
    </div>
  );
}

function QuickAdd() {
  const { t } = useI18n();
  const quickAdd = useAppStore((state) => state.quickAdd);
  const [value, setValue] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    await quickAdd(value);
    setValue("");
  }

  return (
    <form className="quick-add" onSubmit={submit}>
      <Plus size={18} />
      <input value={value} onChange={(event) => setValue(event.target.value)} placeholder={t("today.quickAddPlaceholder")} />
      <Button title={t("shell.addTask")} type="submit">
        <Zap size={16} />
        {t("common.add")}
      </Button>
    </form>
  );
}

function ProjectsView() {
  const { t } = useI18n();
  const tasks = useAppStore((state) => state.tasks);
  const groups = useMemo(
    () => [
      { title: t("projects.inbox"), count: tasks.length, color: "indigo" },
      { title: t("projects.gameProject"), count: tasks.filter((task) => task.tags.includes("gdd")).length, color: "green" },
      { title: t("projects.bugTracker"), count: tasks.filter((task) => task.type === "bug").length, color: "red" }
    ],
    [tasks, t]
  );

  return (
    <section>
      <PageHeader title={t("nav.projects")} meta={t("projects.meta")} />
      <div className="project-grid">
        {groups.map((project) => (
          <article className="project-card" key={project.title}>
            <div className={`project-swatch ${project.color}`} />
            <h3>{project.title}</h3>
            <p>{t("projects.linkedTasks", { count: project.count })}</p>
            <div className="progress-track">
              <span style={{ width: `${Math.min(project.count * 18, 100)}%` }} />
            </div>
          </article>
        ))}
      </div>
      <BoardPreview />
    </section>
  );
}

function BoardPreview() {
  const { t } = useI18n();
  const columns = [
    t("projects.columns.ideas"),
    t("projects.columns.backlog"),
    t("projects.columns.todo"),
    t("projects.columns.inProgress"),
    t("projects.columns.testing"),
    t("projects.columns.done")
  ];
  const tasks = useAppStore((state) => state.tasks);

  return (
    <div className="board-strip">
      {columns.map((column, index) => (
        <section className="kanban-column" key={column}>
          <h3>{column}</h3>
          {tasks.slice(index, index + 2).map((task) => (
            <article className="kanban-card" key={`${column}-${task.id}`}>
              <span>{task.title}</span>
              <Badge>{dynamicLabel(t, `taskTypes.${task.type}`, task.type)}</Badge>
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}

function CalendarView() {
  const { t } = useI18n();
  const tasks = useAppStore((state) => state.tasks).filter((task) => task.dueDate);
  return (
    <section>
      <PageHeader title={t("nav.calendar")} meta={t("calendar.meta")} />
      <div className="calendar-layout">
        <Panel>
          <PanelTitle icon={<CalendarDays size={18} />} title={t("calendar.agenda")} />
          <div className="compact-list">
            {tasks.map((task) => (
              <div className="compact-row" key={task.id}>
                <span>{task.title}</span>
                <strong>{task.dueDate}</strong>
              </div>
            ))}
          </div>
        </Panel>
        <div className="calendar-grid">
          {Array.from({ length: 35 }).map((_, index) => (
            <div className="calendar-cell" key={index}>
              <span>{index + 1}</span>
              {index === 8 ? <small>{t("calendar.importPreview")}</small> : null}
              {index === 13 ? <small>{t("calendar.focusBlock")}</small> : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HabitsView() {
  const { t } = useI18n();
  const habits = [
    { title: t("habits.dailyPlanning"), streak: 9, tone: "success" as const },
    { title: t("habits.prototypeReview"), streak: 4, tone: "warning" as const },
    { title: t("habits.writeDesignNotes"), streak: 12, tone: "info" as const }
  ];

  return (
    <section>
      <PageHeader title={t("nav.habits")} meta={t("habits.meta")} />
      <div className="habit-grid">
        {habits.map((habit) => (
          <article className="habit-card" key={habit.title}>
            <div>
              <h3>{habit.title}</h3>
              <p>{t("habits.streak", { count: habit.streak })}</p>
            </div>
            <Badge tone={habit.tone}>{t("common.active")}</Badge>
          </article>
        ))}
      </div>
    </section>
  );
}

function NotesView() {
  const { t } = useI18n();
  const notes = useAppStore((state) => state.notes);
  const saveNote = useAppStore((state) => state.saveNote);
  const noteSettings = useAppStore((state) => state.noteSettings);
  const [draft, setDraft] = useState({ title: t("notes.newTitle"), content: "", tags: "ideas" });

  async function submit(event: FormEvent) {
    event.preventDefault();
    await saveNote({
      title: draft.title,
      content: draft.content,
      tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean)
    });
    setDraft({ title: t("notes.newTitle"), content: "", tags: "ideas" });
  }

  return (
    <div className="page-grid">
      <section className="page-main">
        <PageHeader title={t("nav.notes")} meta={noteSettings.notesEnabled ? t("notes.syncEnabled") : t("notes.localOnly")} />
        <form className="note-editor" onSubmit={submit}>
          <input
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            placeholder={t("notes.titlePlaceholder")}
          />
          <input
            value={draft.tags}
            onChange={(event) => setDraft({ ...draft, tags: event.target.value })}
            placeholder={t("notes.tagsPlaceholder")}
          />
          <textarea
            value={draft.content}
            onChange={(event) => setDraft({ ...draft, content: event.target.value })}
            placeholder={t("notes.contentPlaceholder")}
          />
          <Button type="submit">
            <FileText size={16} />
            {t("common.save")}
          </Button>
        </form>
        <div className="note-list">
          {notes.map((note) => (
            <article className="note-card" key={note.id}>
              <div className="note-head">
                <h3>{note.title}</h3>
                <Badge tone={note.syncStatus === "local_only" ? "warning" : note.syncStatus === "error" ? "danger" : "success"}>
                  {noteStatusLabel(t, note.syncStatus)}
                </Badge>
              </div>
              <MarkdownPreview markdown={note.content} />
              <div className="task-meta">
                {note.tags.map((tag) => (
                  <span key={tag}>#{tag}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
      <aside className="page-side">
        <NoteSyncPanel />
        <Panel>
          <PanelTitle icon={<Link2 size={18} />} title={t("notes.internalLinks")} />
          <div className="compact-list">
            {notes.flatMap((note) => parseInternalLinks(note.content)).map((link) => (
              <div className="compact-row" key={`${link.kind}-${link.target}`}>
                <span>{dynamicLabel(t, `linkKinds.${link.kind}`, link.kind)}</span>
                <strong>{link.target}</strong>
              </div>
            ))}
          </div>
        </Panel>
      </aside>
    </div>
  );
}

function ImportView() {
  const { t } = useI18n();
  const source = useAppStore((state) => state.importSource);
  const preview = useAppStore((state) => state.importPreview);
  const setImportSource = useAppStore((state) => state.setImportSource);
  const confirmImport = useAppStore((state) => state.confirmImport);

  return (
    <div className="page-grid">
      <section className="page-main">
        <PageHeader title={t("import.title")} meta={preview.projectName ?? t("import.outlineParser")} />
        <textarea className="import-editor" value={source} onChange={(event) => setImportSource(event.target.value)} />
        <div className="toolbar">
          <Button onClick={confirmImport} disabled={preview.errors.length > 0}>
            <Upload size={16} />
            {t("common.confirm")}
          </Button>
          <Button variant="secondary">
            <Download size={16} />
            {t("common.exportJson")}
          </Button>
        </div>
      </section>
      <aside className="page-side">
        <Panel>
          <PanelTitle icon={<Import size={18} />} title={t("import.preview")} />
          <div className="metric-grid">
            <Metric label={t("import.tasks")} value={preview.items.length} />
            <Metric label={t("import.warnings")} value={preview.warnings.length} />
            <Metric label={t("import.errors")} value={preview.errors.length} />
            <Metric label={t("import.project")} value={preview.projectName ? t("common.yes") : t("common.no")} />
          </div>
          <div className="tree-preview">
            {preview.tree.slice(0, 8).map((item) => (
              <div className="tree-row" key={item.id}>
                <span>{item.outline ?? "-"}</span>
                <strong>{item.title}</strong>
              </div>
            ))}
          </div>
        </Panel>
      </aside>
    </div>
  );
}

function GameDevView() {
  const { t } = useI18n();
  const createGameDevWorkspace = useAppStore((state) => state.createGameDevWorkspace);
  const setActiveView = useAppStore((state) => state.setActiveView);
  const subscription = useAppStore((state) => state.subscription);
  const access = canUseFeatureOffline("game_dev_workspace", subscription);

  return (
    <section>
      <PageHeader title={t("nav.gameDev")} meta={access.allowed ? t("gameDev.workspaceEnabled") : t("gameDev.premiumGated")} />
      <div className="game-layout">
        <Panel>
          <PanelTitle icon={<FileCode2 size={18} />} title={t("gameDev.projectTemplate")} />
          <div className="template-grid">
            {gameDevTemplate.defaultTaskGroups.map((group) => (
              <article className="template-item" key={group.title}>
                <Badge>{dynamicLabel(t, `taskTypes.${group.type}`, group.type)}</Badge>
                <h3>{groupTitleLabel(t, group.title)}</h3>
                <p>{t("gameDev.starterTasks", { count: group.tasks.length })}</p>
              </article>
            ))}
          </div>
          {!access.allowed ? <div className="inline-alert">{t("gameDev.premiumFeatureAlert")}</div> : null}
          <Button onClick={access.allowed ? createGameDevWorkspace : () => setActiveView("subscription")}>
            <Plus size={16} />
            {access.allowed ? t("common.create") : t("common.upgrade")}
          </Button>
        </Panel>
        <Panel>
          <PanelTitle icon={<Code2 size={18} />} title={t("gameDev.snippets")} />
          <CodePreview />
        </Panel>
        <Panel>
          <PanelTitle icon={<Archive size={18} />} title={t("gameDev.milestones")} />
          <div className="milestone-list">
            {[
              t("gameDev.milestonesList.prototype"),
              t("gameDev.milestonesList.verticalSlice"),
              t("gameDev.milestonesList.alpha"),
              t("gameDev.milestonesList.beta"),
              t("gameDev.milestonesList.release")
            ].map((milestone, index) => (
              <div className="milestone-row" key={milestone}>
                <span>{milestone}</span>
                <div className="progress-track">
                  <span style={{ width: `${(index + 1) * 14}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </section>
  );
}

function FocusView() {
  const { t } = useI18n();
  return (
    <section>
      <PageHeader title={t("nav.focus")} meta={t("focus.meta")} />
      <div className="focus-shell">
        <div className="focus-timer">25:00</div>
        <div className="toolbar">
          <Button>
            <Play size={16} />
            {t("common.start")}
          </Button>
          <Button variant="secondary">
            <RefreshCw size={16} />
            {t("common.reset")}
          </Button>
        </div>
      </div>
    </section>
  );
}

function StatsView() {
  const { t } = useI18n();
  const tasks = useAppStore((state) => state.tasks);
  const data = [
    { label: t("stats.weekdays.mon"), tasks: 3 },
    { label: t("stats.weekdays.tue"), tasks: 6 },
    { label: t("stats.weekdays.wed"), tasks: 4 },
    { label: t("stats.weekdays.thu"), tasks: tasks.length },
    { label: t("stats.weekdays.fri"), tasks: 5 }
  ];

  return (
    <section>
      <PageHeader title={t("nav.stats")} meta={t("stats.meta")} />
      <Panel>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" stroke="var(--muted)" />
              <YAxis stroke="var(--muted)" />
              <Tooltip />
              <Area type="monotone" dataKey="tasks" stroke="#6366F1" fill="#C7D2FE" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    </section>
  );
}

function SettingsView() {
  const { t } = useI18n();
  return (
    <div className="page-grid">
      <section className="page-main">
        <PageHeader title={t("nav.settings")} meta={t("settings.meta")} />
        <LanguagePanel />
        <AuthPanel />
        <NoteSyncPanel />
      </section>
      <aside className="page-side">
        <SubscriptionView compact />
      </aside>
    </div>
  );
}

function LanguagePanel() {
  const { locale, setLocale, t } = useI18n();
  const options: Array<{ value: Locale; label: string }> = [
    { value: "ru", label: t("settings.russian") },
    { value: "en", label: t("settings.english") }
  ];

  return (
    <Panel>
      <PanelTitle icon={<Settings size={18} />} title={t("settings.interface")} />
      <div className="settings-row language-row">
        <div>
          <strong>{t("settings.language")}</strong>
          <span>{locale === "ru" ? t("settings.russian") : t("settings.english")}</span>
        </div>
        <div className="segmented language-segmented">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={locale === option.value ? "active" : ""}
              onClick={() => setLocale(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function AuthPanel() {
  const { t } = useI18n();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("demo@zada.local");
  const [name, setName] = useState("Demo User");
  const [password, setPassword] = useState("password123");
  const [message, setMessage] = useState<AuthMessage>(
    localStorage.getItem("zada.accessToken") ? { type: "signedInLocal" } : { type: "notSignedIn" }
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const response = mode === "login" ? await api.login({ email, password }) : await api.register({ email, password, name });
      localStorage.setItem("zada.accessToken", response.accessToken);
      localStorage.setItem("zada.refreshToken", response.refreshToken);
      setMessage({ type: "signedInAs", email: response.user.email });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "";
      setMessage(messageText.toLowerCase().includes("invalid") ? { type: "invalidCredentials" } : { type: "authFailed" });
    }
  }

  return (
    <Panel>
      <PanelTitle icon={<Settings size={18} />} title={t("settings.account")} />
      <form className="auth-form" onSubmit={submit}>
        <div className="segmented">
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>
            {t("settings.login")}
          </button>
          <button type="button" className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>
            {t("settings.register")}
          </button>
        </div>
        {mode === "register" ? (
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder={t("settings.name")} />
        ) : null}
        <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t("settings.email")} type="email" />
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={t("settings.password")}
          type="password"
        />
        <div className="toolbar">
          <Button type="submit">{mode === "login" ? t("settings.login") : t("settings.register")}</Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              localStorage.removeItem("zada.accessToken");
              localStorage.removeItem("zada.refreshToken");
              setMessage({ type: "signedOut" });
            }}
          >
            {t("settings.logout")}
          </Button>
        </div>
        <span className="form-message">{authMessageLabel(t, message)}</span>
      </form>
    </Panel>
  );
}

function SubscriptionView({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const subscription = useAppStore((state) => state.subscription);
  const features = Object.entries(premiumFeatures).slice(0, compact ? 6 : 15);
  const [message, setMessage] = useState("");

  return (
    <section>
      {!compact ? (
        <PageHeader title={t("nav.subscription")} meta={t("subscription.plan", { plan: planLabel(t, subscription.plan) })} />
      ) : null}
      <Panel>
        <PanelTitle icon={<Sparkles size={18} />} title={t("subscription.premiumGates")} />
        <div className="subscription-head">
          <div>
            <strong>{planLabel(t, subscription.plan)}</strong>
            <span>{statusLabel(t, subscription.status)}</span>
          </div>
          <Button onClick={() => setMessage(t("subscription.purchaseUnavailable"))} title={t("common.upgrade")}>
            <Sparkles size={16} />
            {t("common.upgrade")}
          </Button>
        </div>
        {message ? <div className="inline-alert">{message}</div> : null}
        <div className="feature-list">
          {features.map(([key]) => {
            const access = canUseFeatureOffline(key as keyof typeof premiumFeatures, subscription);
            return (
              <div className="feature-row" key={key}>
                <span>{featureLabel(t, key)}</span>
                <Badge tone={access.allowed ? "success" : "neutral"}>
                  {access.allowed ? t("subscription.featureEnabled") : t("common.pro")}
                </Badge>
              </div>
            );
          })}
        </div>
      </Panel>
    </section>
  );
}

function NoteSyncPanel() {
  const { t } = useI18n();
  const settings = useAppStore((state) => state.noteSettings);
  const toggleNotesSync = useAppStore((state) => state.toggleNotesSync);

  return (
    <Panel>
      <PanelTitle icon={<RefreshCw size={18} />} title={t("noteSync.title")} />
      <div className="settings-row">
        <div>
          <strong>{t("noteSync.description")}</strong>
          <span>{settings.notesEnabled ? t("noteSync.enabledDescription") : t("noteSync.disabledDescription")}</span>
        </div>
        <label className="switch">
          <input type="checkbox" checked={settings.notesEnabled} onChange={(event) => toggleNotesSync(event.target.checked)} />
          <span />
        </label>
      </div>
      {!settings.notesEnabled ? <div className="inline-alert">{t("noteSync.localOnlyExport")}</div> : null}
    </Panel>
  );
}

function MarkdownPreview({ markdown }: { markdown: string }) {
  const { t } = useI18n();
  const codeMatch = markdown.match(/```(\w+)?\n([\s\S]*?)```/);
  const beforeCode = codeMatch ? markdown.slice(0, codeMatch.index).trim() : markdown.trim();
  const links = parseInternalLinks(markdown);

  return (
    <div className="markdown-preview">
      {beforeCode
        .split("\n")
        .filter(Boolean)
        .map((line) => (line.startsWith("##") ? <h4 key={line}>{line.replace(/^##\s*/, "")}</h4> : <p key={line}>{line}</p>))}
      {codeMatch ? (
        <div className="code-block">
          <div className="code-head">
            <span>{codeMatch[1] ?? "text"}</span>
            <button className="icon-button small" title={t("common.copyCode")}>
              <ClipboardList size={15} />
            </button>
          </div>
          <SyntaxHighlighter language={codeMatch[1] ?? "text"} style={oneDark} customStyle={{ margin: 0 }}>
            {codeMatch[2] ?? ""}
          </SyntaxHighlighter>
        </div>
      ) : null}
      {links.length > 0 ? (
        <div className="link-pills">
          {links.map((link) => (
            <span key={`${link.kind}-${link.target}`}>
              {dynamicLabel(t, `linkKinds.${link.kind}`, link.kind)}: {link.target}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CodePreview() {
  const { t } = useI18n();
  const code = `public class PlayerAttack : MonoBehaviour\n{\n    public void Attack()\n    {\n        hitbox.EnableFor(0.18f);\n    }\n}`;

  return (
    <div className="code-block">
      <div className="code-head">
        <span>csharp</span>
        <button className="icon-button small" title={t("common.copyCode")}>
          <ClipboardList size={15} />
        </button>
      </div>
      <SyntaxHighlighter language="csharp" style={oneDark} customStyle={{ margin: 0 }}>
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

function MobileNav({ activeView, setActiveView }: { activeView: ViewId; setActiveView: (view: ViewId) => void }) {
  const { t } = useI18n();
  const mobileItems = navItems.filter((item) => ["today", "projects", "calendar", "habits"].includes(item.id));

  return (
    <nav className="mobile-nav" aria-label={t("shell.mobileNavigation")}>
      {mobileItems.map((item) => {
        const label = t(item.labelKey);
        return (
          <button className={activeView === item.id ? "active" : ""} key={item.id} onClick={() => setActiveView(item.id)}>
            {item.icon}
            <span>{label}</span>
          </button>
        );
      })}
      <button className={activeView === "settings" ? "active" : ""} onClick={() => setActiveView("settings")}>
        <MoreHorizontal size={18} />
        <span>{t("common.more")}</span>
      </button>
    </nav>
  );
}

function SyncIndicator({ state }: { state: "offline" | "idle" | "syncing" | "error" }) {
  const { t } = useI18n();
  return (
    <div className={`sync-indicator ${state}`}>
      <span />
      {t(`syncState.${state}`)}
    </div>
  );
}

function PageHeader({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        <p>{meta}</p>
      </div>
    </div>
  );
}

function PanelTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="panel-title">
      {icon}
      <h2>{title}</h2>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

type AuthMessage =
  | { type: "signedInLocal" }
  | { type: "notSignedIn" }
  | { type: "signedInAs"; email: string }
  | { type: "signedOut" }
  | { type: "authFailed" }
  | { type: "invalidCredentials" };

function authMessageLabel(t: TFunction, message: AuthMessage): string {
  switch (message.type) {
    case "signedInLocal":
      return t("settings.signedInLocally");
    case "signedInAs":
      return t("settings.signedInAs", { email: message.email });
    case "signedOut":
      return t("settings.signedOutLocally");
    case "authFailed":
      return t("settings.authFailed");
    case "invalidCredentials":
      return t("settings.invalidCredentials");
    default:
      return t("settings.notSignedIn");
  }
}

function noteStatusLabel(t: TFunction, status: string): string {
  const keyByStatus: Record<string, TranslationKey> = {
    local_only: "notes.statusLocalOnly",
    pending: "notes.statusPending",
    synced: "notes.statusSynced",
    error: "notes.statusError"
  };

  return t(keyByStatus[status] ?? "notes.statusPending");
}

function planLabel(t: TFunction, plan: string): string {
  const keyByPlan: Record<string, TranslationKey> = {
    free: "subscription.free",
    pro: "subscription.pro",
    lifetime_dev: "subscription.lifetimeDev",
    admin: "subscription.admin"
  };

  return t(keyByPlan[plan] ?? "subscription.free");
}

function statusLabel(t: TFunction, status: string): string {
  const keyByStatus: Record<string, TranslationKey> = {
    inactive: "subscription.inactive",
    active: "subscription.active",
    past_due: "subscription.pastDue",
    canceled: "subscription.canceled",
    manual: "subscription.manual"
  };

  return t(keyByStatus[status] ?? "subscription.inactive");
}

function featureLabel(t: TFunction, featureKey: string): string {
  return dynamicLabel(t, `subscription.features.${featureKey}`, premiumFeatures[featureKey as keyof typeof premiumFeatures]?.label ?? featureKey);
}

function groupTitleLabel(t: TFunction, title: string): string {
  const keyByTitle: Record<string, TranslationKey> = {
    "Core Mechanics": "gameDev.templateGroups.coreMechanics",
    Player: "gameDev.templateGroups.player",
    Enemies: "gameDev.templateGroups.enemies",
    "UI/UX": "gameDev.templateGroups.uiUx",
    Bugs: "gameDev.templateGroups.bugs",
    Milestones: "gameDev.templateGroups.milestones"
  };

  const key = keyByTitle[title];
  return key ? t(key) : title;
}

function dynamicLabel(t: TFunction, key: string, fallback: string): string {
  const translated = t(key as TranslationKey);
  return translated === key ? fallback : translated;
}
