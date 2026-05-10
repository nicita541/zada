import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  Archive,
  Bell,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardList,
  Clock,
  Code2,
  Columns3,
  Download,
  FileCode2,
  FileText,
  Filter,
  Flame,
  Gauge,
  Import,
  KeyRound,
  Link2,
  ListChecks,
  LogOut,
  Moon,
  MoreHorizontal,
  NotebookText,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Repeat2,
  Search,
  Settings,
  Sparkles,
  Sun,
  Tag,
  Timer,
  Trash2,
  Upload,
  User,
  X,
  Zap
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Badge, Button, Panel } from "@zada/ui";
import { canUseFeatureOffline, gameDevTemplate, parseInternalLinks, premiumFeatures } from "@zada/shared";
import { BoardView } from "./components/board/BoardView";
import { useAppStore, type ViewId } from "./store/appStore";
import type { LocalReminder, LocalSubtask, LocalTask } from "./lib/db";
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
        <AuthGate>
          <AppShell />
        </AuthGate>
      </div>
    </I18nProvider>
  );
}

function AuthGate({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const authStatus = useAppStore((state) => state.authStatus);

  if (authStatus === "loading") {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="brand-row">
            <div className="brand-mark">Z</div>
            <div>
              <div className="brand-name">{t("common.appName")}</div>
              <div className="brand-meta">{t("auth.loadingSession")}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (authStatus === "unauthenticated") {
    return <AuthScreen />;
  }

  return <>{children}</>;
}

function AppShell() {
  const { t } = useI18n();
  const activeView = useAppStore((state) => state.activeView);
  const setActiveView = useAppStore((state) => state.setActiveView);
  const syncState = useAppStore((state) => state.syncState);
  const manualSync = useAppStore((state) => state.manualSync);
  const currentUser = useAppStore((state) => state.currentUser);
  const searchQuery = useAppStore((state) => state.searchQuery);
  const setSearchQuery = useAppStore((state) => state.setSearchQuery);
  const dueReminders = useAppStore((state) => state.dueReminders);
  const dismissReminder = useAppStore((state) => state.dismissReminder);
  const refreshDueReminders = useAppStore((state) => state.refreshDueReminders);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    refreshDueReminders();
  }, [refreshDueReminders]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand-mark">Z</div>
          <div>
            <div className="brand-name">{t("common.appName")}</div>
            <div className="brand-meta">{currentUser?.email ?? t("shell.personalWorkspace")}</div>
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
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t("common.searchPlaceholder")}
            />
            {searchQuery ? (
              <button className="icon-button small ghost" type="button" title={t("common.clearSearch")} onClick={() => setSearchQuery("")}>
                <X size={14} />
              </button>
            ) : null}
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
          {dueReminders.length > 0 ? (
            <div className="reminder-banner">
              <Bell size={16} />
              <strong>{t("today.dueReminders")}</strong>
              {dueReminders.slice(0, 3).map((reminder) => (
                <button key={reminder.id} type="button" onClick={() => dismissReminder(reminder.id)}>
                  {new Date(reminder.remindAt).toLocaleString()}
                  <X size={14} />
                </button>
              ))}
            </div>
          ) : null}
          <ViewRenderer view={activeView} />
        </div>
      </main>

      <MobileNav activeView={activeView} setActiveView={setActiveView} />
      <TaskDetailModal />
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
  const projects = useAppStore((state) => state.projects);
  const tags = useAppStore((state) => state.tags);
  const subtasksByTaskId = useAppStore((state) => state.subtasksByTaskId);
  const remindersByTaskId = useAppStore((state) => state.remindersByTaskId);
  const searchQuery = useAppStore((state) => state.searchQuery);
  const taskFilters = useAppStore((state) => state.taskFilters);
  const setTaskFilters = useAppStore((state) => state.setTaskFilters);
  const clearTaskFilters = useAppStore((state) => state.clearTaskFilters);
  const completedCount = tasks.filter((task) => task.completed).length;
  const visibleTasks = filterTasks(tasks, searchQuery, taskFilters);
  const openTasks = visibleTasks.filter((task) => !task.completed);
  const todayGroups = groupTodayTasks(visibleTasks);
  const upcomingGroups = groupUpcomingTasks(visibleTasks);

  return (
    <div className="page-grid">
      <section className="page-main">
        <PageHeader title={t("nav.today")} meta={t("today.metaOpenTasks", { count: openTasks.length })} />
        <QuickAdd />
        <GroupedTaskList
          groups={[
            [t("today.overdue"), todayGroups.overdue],
            [t("today.todayGroup"), todayGroups.today],
            [t("today.noDate"), todayGroups.noDate]
          ]}
          subtasksByTaskId={subtasksByTaskId}
          remindersByTaskId={remindersByTaskId}
        />
        {visibleTasks.length === 0 ? <div className="inline-alert">{t("today.noTasks")}</div> : null}
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
          <PanelTitle icon={<Filter size={18} />} title={t("today.filters")} />
          <div className="filter-stack">
            <select value={taskFilters.projectId ?? ""} onChange={(event) => setTaskFilters({ projectId: event.target.value || null })}>
              <option value="">{t("today.allProjects")}</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <select value={taskFilters.status} onChange={(event) => setTaskFilters({ status: event.target.value as "all" | "todo" | "done" })}>
              <option value="all">{t("today.allStatuses")}</option>
              <option value="todo">{t("today.activeOnly")}</option>
              <option value="done">{t("today.completedOnly")}</option>
            </select>
            <select value={taskFilters.priority ?? ""} onChange={(event) => setTaskFilters({ priority: event.target.value || null })}>
              <option value="">{t("today.allPriorities")}</option>
              {["p1", "p2", "p3", "p4"].map((priority) => (
                <option key={priority} value={priority}>
                  {priority.toUpperCase()}
                </option>
              ))}
            </select>
            <select value={taskFilters.type ?? ""} onChange={(event) => setTaskFilters({ type: event.target.value || null })}>
              <option value="">{t("today.allTypes")}</option>
              {["feature", "bug", "design", "code", "testing", "build"].map((type) => (
                <option key={type} value={type}>
                  {dynamicLabel(t, `taskTypes.${type}`, type)}
                </option>
              ))}
            </select>
            <select value={taskFilters.tag ?? ""} onChange={(event) => setTaskFilters({ tag: event.target.value || null })}>
              <option value="">{t("today.allTags")}</option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.name}>
                  #{tag.name}
                </option>
              ))}
            </select>
            <Button type="button" variant="secondary" onClick={clearTaskFilters}>
              <X size={16} />
              {t("common.clear")}
            </Button>
          </div>
        </Panel>
        <Panel>
          <PanelTitle icon={<CalendarDays size={18} />} title={t("today.upcoming")} />
          <UpcomingList groups={upcomingGroups} />
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

function GroupedTaskList({
  groups,
  subtasksByTaskId,
  remindersByTaskId
}: {
  groups: Array<[string, LocalTask[]]>;
  subtasksByTaskId: Record<string, LocalSubtask[]>;
  remindersByTaskId: Record<string, LocalReminder[]>;
}) {
  return (
    <div className="task-list grouped-task-list">
      {groups.map(([label, groupTasks]) =>
        groupTasks.length > 0 ? (
          <section className="task-group" key={label}>
            <h2>{label}</h2>
            {groupTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                subtasks={subtasksByTaskId[task.id] ?? []}
                reminders={remindersByTaskId[task.id] ?? []}
              />
            ))}
          </section>
        ) : null
      )}
    </div>
  );
}

function TaskRow({
  task,
  subtasks,
  reminders
}: {
  task: LocalTask;
  subtasks: LocalSubtask[];
  reminders: LocalReminder[];
}) {
  const { t } = useI18n();
  const toggleTask = useAppStore((state) => state.toggleTask);
  const selectTask = useAppStore((state) => state.selectTask);
  const completedSubtasks = subtasks.filter((subtask) => subtask.completed).length;
  const activeReminders = reminders.filter((reminder) => !reminder.dismissedAt).length;

  return (
    <article className={`task-row ${task.completed ? "done" : ""}`}>
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
          {task.time ? <span>{task.time}</span> : null}
          {task.repeat ? (
            <span title={t("taskDetail.repeat")}>
              <Repeat2 size={12} />
              {repeatLabel(t, task.repeat)}
            </span>
          ) : null}
          {subtasks.length > 0 ? (
            <span title={t("taskDetail.subtasks")}>
              <ListChecks size={12} />
              {completedSubtasks}/{subtasks.length}
            </span>
          ) : null}
          {activeReminders > 0 ? (
            <span title={t("taskDetail.reminders")}>
              <Bell size={12} />
              {activeReminders}
            </span>
          ) : null}
          {task.tags.map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </div>
      </div>
      <button className="icon-button small" title={t("today.openTask")} onClick={() => selectTask(task.id)}>
        <ChevronRight size={16} />
      </button>
    </article>
  );
}

function UpcomingList({ groups }: { groups: { nextSeven: LocalTask[]; later: LocalTask[] } }) {
  const { t } = useI18n();
  const selectTask = useAppStore((state) => state.selectTask);
  const entries: Array<[string, LocalTask[]]> = [
    [t("today.nextSevenDays"), groups.nextSeven],
    [t("today.later"), groups.later]
  ];

  if (groups.nextSeven.length === 0 && groups.later.length === 0) {
    return <div className="inline-alert">{t("today.noUpcoming")}</div>;
  }

  return (
    <div className="compact-list">
      {entries.map(([label, tasks]) =>
        tasks.length > 0 ? (
          <div className="upcoming-group" key={label}>
            <strong>{label}</strong>
            {tasks.slice(0, 5).map((task) => (
              <button className="compact-row compact-button" key={task.id} type="button" onClick={() => selectTask(task.id)}>
                <span>{task.title}</span>
                <strong>{task.dueDate}</strong>
              </button>
            ))}
          </div>
        ) : null
      )}
    </div>
  );
}

function ProjectsView() {
  const { t } = useI18n();
  const projects = useAppStore((state) => state.projects);
  const tasks = useAppStore((state) => state.tasks);
  const subtasksByTaskId = useAppStore((state) => state.subtasksByTaskId);
  const remindersByTaskId = useAppStore((state) => state.remindersByTaskId);
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const setActiveProject = useAppStore((state) => state.setActiveProject);
  const createProject = useAppStore((state) => state.createProject);
  const updateProject = useAppStore((state) => state.updateProject);
  const deleteProject = useAppStore((state) => state.deleteProject);
  const createTask = useAppStore((state) => state.createTask);
  const selectTask = useAppStore((state) => state.selectTask);
  const [projectDraft, setProjectDraft] = useState({ name: "", description: "" });
  const [projectEditDraft, setProjectEditDraft] = useState({ name: "", description: "" });
  const [taskDraft, setTaskDraft] = useState({ title: "", description: "" });
  const [projectFormMessage, setProjectFormMessage] = useState("");
  const [taskFormMessage, setTaskFormMessage] = useState("");
  const [projectMode, setProjectMode] = useState<"list" | "board">("board");
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? projects[0] ?? null;
  const projectTasks = activeProject ? tasks.filter((task) => task.projectId === activeProject.id) : [];

  useEffect(() => {
    setProjectEditDraft({
      name: activeProject?.name ?? "",
      description: activeProject?.description ?? ""
    });
  }, [activeProject?.id, activeProject?.name, activeProject?.description]);

  async function submitProject(event: FormEvent) {
    event.preventDefault();
    if (!projectDraft.name.trim()) {
      setProjectFormMessage(t("projects.nameRequired"));
      return;
    }

    const project = await createProject(projectDraft);
    if (project.name) {
      setProjectDraft({ name: "", description: "" });
      setProjectFormMessage("");
    }
  }

  async function submitTask(event: FormEvent) {
    event.preventDefault();
    if (!taskDraft.title.trim() || !activeProject) {
      setTaskFormMessage(t("projects.taskTitleRequired"));
      return;
    }

    await createTask({
      title: taskDraft.title,
      description: taskDraft.description,
      projectId: activeProject.id,
      tags: []
    });
    setTaskDraft({ title: "", description: "" });
    setTaskFormMessage("");
  }

  async function submitProjectEdit(event: FormEvent) {
    event.preventDefault();
    if (!activeProject) {
      return;
    }

    await updateProject(activeProject.id, projectEditDraft);
  }

  async function removeProject() {
    if (!activeProject) {
      return;
    }

    if (!window.confirm(t("projects.confirmDelete"))) {
      return;
    }

    await deleteProject(activeProject.id);
  }

  return (
    <div className="page-grid">
      <section className="page-main">
        <PageHeader title={t("nav.projects")} meta={t("projects.meta")} />
        <form className="project-form" onSubmit={submitProject}>
          <input
            value={projectDraft.name}
            onChange={(event) => setProjectDraft({ ...projectDraft, name: event.target.value })}
            placeholder={t("projects.namePlaceholder")}
          />
          <input
            value={projectDraft.description}
            onChange={(event) => setProjectDraft({ ...projectDraft, description: event.target.value })}
            placeholder={t("projects.descriptionPlaceholder")}
          />
          <Button type="submit">
            <Plus size={16} />
            {t("projects.createProject")}
          </Button>
        </form>
        {projectFormMessage ? <div className="form-message">{projectFormMessage}</div> : null}
        {projects.length === 0 ? <div className="inline-alert">{t("projects.empty")}</div> : null}
        <div className="project-grid">
          {projects.map((project, index) => {
            const count = tasks.filter((task) => task.projectId === project.id).length;
            const color = index % 3 === 0 ? "indigo" : index % 3 === 1 ? "green" : "red";
            return (
              <article className={`project-card ${activeProject?.id === project.id ? "active" : ""}`} key={project.id}>
                <button className="project-card-button" type="button" onClick={() => setActiveProject(project.id)}>
                  <div className={`project-swatch ${color}`} />
                  <h3>{project.name}</h3>
                  <p>{project.description || t("projects.noDescription")}</p>
                  <div className="task-meta">
                    <span>{t("projects.linkedTasks", { count })}</span>
                    {activeProject?.id === project.id ? <span>{t("projects.activeProject")}</span> : null}
                  </div>
                </button>
              </article>
            );
          })}
        </div>
        {activeProject ? (
          <>
            <div className="project-view-tabs segmented">
              <button className={projectMode === "list" ? "active" : ""} type="button" onClick={() => setProjectMode("list")}>
                <ListChecks size={16} />
                {t("board.listView")}
              </button>
              <button className={projectMode === "board" ? "active" : ""} type="button" onClick={() => setProjectMode("board")}>
                <Columns3 size={16} />
                {t("board.boardView")}
              </button>
            </div>
            {projectMode === "board" ? (
              <BoardView projectId={activeProject.id} />
            ) : (
              <div className="task-list project-list-view">
                {projectTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    subtasks={subtasksByTaskId[task.id] ?? []}
                    reminders={remindersByTaskId[task.id] ?? []}
                  />
                ))}
                {projectTasks.length === 0 ? <div className="inline-alert">{t("today.noTasks")}</div> : null}
              </div>
            )}
          </>
        ) : null}
      </section>
      <aside className="page-side">
        <Panel>
          <PanelTitle icon={<Pencil size={18} />} title={activeProject ? activeProject.name : t("projects.noActiveProject")} />
          {activeProject ? (
            <>
              <form className="task-create-form" onSubmit={submitProjectEdit}>
                <input
                  value={projectEditDraft.name}
                  onChange={(event) => setProjectEditDraft({ ...projectEditDraft, name: event.target.value })}
                  placeholder={t("projects.namePlaceholder")}
                />
                <textarea
                  value={projectEditDraft.description}
                  onChange={(event) => setProjectEditDraft({ ...projectEditDraft, description: event.target.value })}
                  placeholder={t("projects.descriptionPlaceholder")}
                />
                <div className="toolbar">
                  <Button type="submit">
                    <Pencil size={16} />
                    {t("common.save")}
                  </Button>
                  <Button type="button" variant="danger" onClick={removeProject}>
                    <Trash2 size={16} />
                    {t("common.delete")}
                  </Button>
                </div>
              </form>
              <form className="task-create-form" onSubmit={submitTask}>
                <input
                  value={taskDraft.title}
                  onChange={(event) => setTaskDraft({ ...taskDraft, title: event.target.value })}
                  placeholder={t("projects.taskTitlePlaceholder")}
                />
                <textarea
                  value={taskDraft.description}
                  onChange={(event) => setTaskDraft({ ...taskDraft, description: event.target.value })}
                  placeholder={t("projects.taskDescriptionPlaceholder")}
                />
                <Button type="submit">
                  <Plus size={16} />
                  {t("projects.addTask")}
                </Button>
              </form>
              {taskFormMessage ? <div className="form-message">{taskFormMessage}</div> : null}
              <div className="compact-list project-task-list">
                {projectTasks.map((task) => (
                  <button className="compact-row compact-button" key={task.id} type="button" onClick={() => selectTask(task.id)}>
                    <span>{task.title}</span>
                    <strong>{task.completed ? t("common.done") : task.priority?.toUpperCase() || t("today.open")}</strong>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="muted-copy">{t("projects.selectOrCreate")}</p>
          )}
        </Panel>
      </aside>
    </div>
  );
}

function BoardPreview({ projectId }: { projectId: string | null }) {
  const { t } = useI18n();
  const selectTask = useAppStore((state) => state.selectTask);
  const columns = [
    t("projects.columns.ideas"),
    t("projects.columns.backlog"),
    t("projects.columns.todo"),
    t("projects.columns.inProgress"),
    t("projects.columns.testing"),
    t("projects.columns.done")
  ];
  const tasks = useAppStore((state) => state.tasks).filter((task) => (projectId ? task.projectId === projectId : true));

  return (
    <div className="board-strip">
      {columns.map((column, index) => (
        <section className="kanban-column" key={column}>
          <h3>{column}</h3>
          {tasks.slice(index, index + 2).map((task) => (
            <button className="kanban-card kanban-button" key={`${column}-${task.id}`} type="button" onClick={() => selectTask(task.id)}>
              <span>{task.title}</span>
              <Badge>{dynamicLabel(t, `taskTypes.${task.type}`, task.type)}</Badge>
            </button>
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
        <AccountPanel />
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

function AuthScreen() {
  const { t } = useI18n();
  const login = useAppStore((state) => state.login);
  const register = useAppStore((state) => state.register);
  const forgotPassword = useAppStore((state) => state.forgotPassword);
  const resetPassword = useAppStore((state) => state.resetPassword);
  const authError = useAppStore((state) => state.authError);
  const [mode, setMode] = useState<"login" | "register" | "forgot" | "reset">("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function selectMode(nextMode: typeof mode) {
    setMode(nextMode);
    setMessage("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const normalizedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setMessage(t("auth.invalidEmail"));
      return;
    }
    if (mode !== "forgot" && !password) {
      setMessage(t("auth.passwordRequired"));
      return;
    }

    setIsSubmitting(true);
    setMessage("");
    try {
      if (mode === "login") {
        await login({ email: normalizedEmail, password });
        return;
      }

      if (mode === "register") {
        await register({ email: normalizedEmail, password, name });
        return;
      }

      if (mode === "forgot") {
        const token = await forgotPassword(normalizedEmail);
        if (token) {
          setResetToken(token);
          setMode("reset");
          setMessage(t("auth.resetTokenReady"));
        } else {
          setMessage(t("auth.resetEmailSent"));
        }
        return;
      }

      await resetPassword({ email: normalizedEmail, resetToken, password });
      setMode("login");
      setPassword("");
      setResetToken("");
      setMessage(t("auth.passwordResetDone"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("settings.authFailed"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-shell">
      <section className="auth-card">
        <div className="brand-row">
          <div className="brand-mark">Z</div>
          <div>
            <div className="brand-name">{t("common.appName")}</div>
            <div className="brand-meta">{t("auth.sessionRequired")}</div>
          </div>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <div className="segmented auth-segmented">
            <button type="button" className={mode === "login" ? "active" : ""} onClick={() => selectMode("login")}>
              {t("settings.login")}
            </button>
            <button type="button" className={mode === "register" ? "active" : ""} onClick={() => selectMode("register")}>
              {t("settings.register")}
            </button>
            <button type="button" className={mode === "forgot" || mode === "reset" ? "active" : ""} onClick={() => selectMode("forgot")}>
              {t("auth.recovery")}
            </button>
          </div>
          <h1>
            {mode === "register"
              ? t("auth.createAccount")
              : mode === "forgot"
                ? t("auth.recoverPassword")
                : mode === "reset"
                  ? t("auth.resetPassword")
                  : t("auth.loginTitle")}
          </h1>
          {mode === "register" ? (
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder={t("settings.name")} />
          ) : null}
          <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t("settings.email")} type="email" />
          {mode === "reset" ? (
            <input value={resetToken} onChange={(event) => setResetToken(event.target.value)} placeholder={t("auth.resetToken")} />
          ) : null}
          {mode !== "forgot" ? (
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t("settings.password")}
              type="password"
            />
          ) : null}
          <Button type="submit" disabled={isSubmitting}>
            <KeyRound size={16} />
            {isSubmitting
              ? t("common.loading")
              : mode === "register"
              ? t("settings.register")
              : mode === "forgot"
                ? t("auth.sendReset")
                : mode === "reset"
                  ? t("auth.resetPassword")
                  : t("settings.login")}
          </Button>
          {resetToken && mode === "reset" ? (
            <span className="form-message">
              {t("auth.devResetToken")}: <code>{resetToken}</code>
            </span>
          ) : null}
          {message || authError ? <span className="form-message">{message || authError}</span> : null}
        </form>
      </section>
    </div>
  );
}

function AccountPanel() {
  const { t } = useI18n();
  const currentUser = useAppStore((state) => state.currentUser);
  const logout = useAppStore((state) => state.logout);

  return (
    <Panel>
      <PanelTitle icon={<User size={18} />} title={t("settings.account")} />
      <div className="settings-row profile-row">
        <div>
          <strong>{currentUser?.name || currentUser?.email || t("settings.notSignedIn")}</strong>
          <span>{currentUser?.email ?? t("settings.notSignedIn")}</span>
        </div>
        <Badge tone="success">{currentUser?.role ?? "user"}</Badge>
      </div>
      <div className="toolbar">
        <Button type="button" variant="secondary" onClick={logout}>
          <LogOut size={16} />
          {t("settings.logout")}
        </Button>
      </div>
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

function TaskDetailModal() {
  const { t } = useI18n();
  const selectedTaskId = useAppStore((state) => state.selectedTaskId);
  const task = useAppStore((state) => state.tasks.find((candidate) => candidate.id === selectedTaskId));
  const projects = useAppStore((state) => state.projects);
  const selectTask = useAppStore((state) => state.selectTask);
  const updateTask = useAppStore((state) => state.updateTask);
  const deleteTask = useAppStore((state) => state.deleteTask);
  const completeTask = useAppStore((state) => state.completeTask);
  const uncompleteTask = useAppStore((state) => state.uncompleteTask);
  const loadTaskDetail = useAppStore((state) => state.loadTaskDetail);
  const subtasks = useAppStore((state) => (selectedTaskId ? (state.subtasksByTaskId[selectedTaskId] ?? []) : []));
  const reminders = useAppStore((state) => (selectedTaskId ? (state.remindersByTaskId[selectedTaskId] ?? []) : []));
  const tags = useAppStore((state) => state.tags);
  const createSubtask = useAppStore((state) => state.createSubtask);
  const updateSubtask = useAppStore((state) => state.updateSubtask);
  const deleteSubtask = useAppStore((state) => state.deleteSubtask);
  const createReminder = useAppStore((state) => state.createReminder);
  const deleteReminder = useAppStore((state) => state.deleteReminder);
  const createTag = useAppStore((state) => state.createTag);
  const assignTaskTag = useAppStore((state) => state.assignTaskTag);
  const removeTaskTag = useAppStore((state) => state.removeTaskTag);
  const [draft, setDraft] = useState({
    title: "",
    description: "",
    projectId: "",
    type: "feature",
    priority: "",
    dueDate: "",
    time: "",
    repeat: "",
    estimatedMinutes: "",
    gameArea: "",
    severity: "",
    buildVersion: "",
    stepsToReproduce: "",
    expectedResult: "",
    actualResult: "",
    tags: ""
  });
  const [subtaskDraft, setSubtaskDraft] = useState("");
  const [reminderDraft, setReminderDraft] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [detailMessage, setDetailMessage] = useState("");

  useEffect(() => {
    if (!task) {
      return;
    }

    setDraft({
      title: task.title,
      description: task.description ?? "",
      projectId: task.projectId ?? "",
      type: task.type,
      priority: task.priority ?? "",
      dueDate: task.dueDate ?? "",
      time: task.time ?? "",
      repeat: task.repeat ?? "",
      estimatedMinutes: task.estimatedMinutes ? String(task.estimatedMinutes) : "",
      gameArea: task.gameArea ?? "",
      severity: task.severity ?? "",
      buildVersion: task.buildVersion ?? "",
      stepsToReproduce: task.stepsToReproduce ?? "",
      expectedResult: task.expectedResult ?? "",
      actualResult: task.actualResult ?? "",
      tags: task.tags.join(", ")
    });
  }, [task]);

  useEffect(() => {
    if (selectedTaskId) {
      loadTaskDetail(selectedTaskId);
    }
  }, [loadTaskDetail, selectedTaskId]);

  if (!task) {
    return null;
  }

  const activeTask = task;

  async function saveTask() {
    if (!draft.title.trim()) {
      setDetailMessage(t("taskDetail.titleRequired"));
      return;
    }

    await updateTask(activeTask.id, {
      title: draft.title,
      description: draft.description,
      projectId: draft.projectId || null,
      type: draft.type,
      priority: draft.priority || null,
      dueDate: draft.dueDate || null,
      time: draft.time || null,
      repeat: draft.repeat || null,
      estimatedMinutes: draft.estimatedMinutes ? Number(draft.estimatedMinutes) : null,
      gameArea: draft.gameArea || null,
      severity: draft.severity || null,
      buildVersion: draft.buildVersion || null,
      stepsToReproduce: draft.stepsToReproduce || null,
      expectedResult: draft.expectedResult || null,
      actualResult: draft.actualResult || null,
      tags: draft.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    });
    setDetailMessage("");
  }

  async function remove() {
    if (!window.confirm(t("taskDetail.confirmDelete"))) {
      return;
    }

    await deleteTask(activeTask.id);
  }

  async function removeSubtask(id: string) {
    if (window.confirm(t("common.confirmDelete"))) {
      await deleteSubtask(id);
    }
  }

  async function removeReminder(id: string) {
    if (window.confirm(t("common.confirmDelete"))) {
      await deleteReminder(id);
    }
  }

  async function submitSubtask(event: FormEvent) {
    event.preventDefault();
    if (!subtaskDraft.trim()) {
      return;
    }
    await createSubtask(activeTask.id, subtaskDraft);
    setSubtaskDraft("");
  }

  async function submitReminder(event: FormEvent) {
    event.preventDefault();
    if (!reminderDraft) {
      setDetailMessage(t("taskDetail.reminderRequired"));
      return;
    }
    await createReminder(activeTask.id, new Date(reminderDraft).toISOString());
    setReminderDraft("");
    setDetailMessage("");
  }

  async function submitTag(event: FormEvent) {
    event.preventDefault();
    if (!tagDraft.trim()) {
      return;
    }
    const tag = await createTag({ name: tagDraft });
    if (tag) {
      await assignTaskTag(activeTask.id, tag.id);
    }
    setTagDraft("");
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t("taskDetail.title")}>
      <section className="task-detail-modal">
        <div className="modal-head">
          <div>
            <h2>{t("taskDetail.title")}</h2>
            <span>{activeTask.updatedAt.slice(0, 10)}</span>
          </div>
          <button className="icon-button small" type="button" title={t("common.close")} onClick={() => selectTask(null)}>
            <X size={16} />
          </button>
        </div>
        <label>
          <span>{t("taskDetail.taskTitle")}</span>
          <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
        </label>
        {detailMessage ? <div className="form-message">{detailMessage}</div> : null}
        <section className="detail-section">
          <PanelTitle icon={<FileText size={18} />} title={t("taskDetail.descriptionSection")} />
          <label>
            <span>{t("taskDetail.description")}</span>
            <textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
          </label>
        </section>
        <div className="form-grid">
          <label>
            <span>{t("taskDetail.project")}</span>
            <select value={draft.projectId} onChange={(event) => setDraft({ ...draft, projectId: event.target.value })}>
              <option value="">{t("taskDetail.noProject")}</option>
              {projects.map((project) => (
                <option value={project.id} key={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("taskDetail.type")}</span>
            <select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })}>
              {["feature", "bug", "design", "code", "testing", "build"].map((type) => (
                <option value={type} key={type}>
                  {dynamicLabel(t, `taskTypes.${type}`, type)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("taskDetail.priority")}</span>
            <select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value })}>
              <option value="">{t("taskDetail.noPriority")}</option>
              {["p1", "p2", "p3"].map((priority) => (
                <option value={priority} key={priority}>
                  {priority.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("taskDetail.dueDate")}</span>
            <input type="date" value={draft.dueDate} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })} />
          </label>
          <label>
            <span>{t("taskDetail.dueTime")}</span>
            <input type="time" value={draft.time} onChange={(event) => setDraft({ ...draft, time: event.target.value })} />
          </label>
          <label>
            <span>{t("taskDetail.estimatedMinutes")}</span>
            <input
              min="0"
              type="number"
              value={draft.estimatedMinutes}
              onChange={(event) => setDraft({ ...draft, estimatedMinutes: event.target.value })}
            />
          </label>
          <label>
            <span>{t("taskDetail.gameArea")}</span>
            <input value={draft.gameArea} onChange={(event) => setDraft({ ...draft, gameArea: event.target.value })} />
          </label>
          <label>
            <span>{t("taskDetail.severity")}</span>
            <input value={draft.severity} onChange={(event) => setDraft({ ...draft, severity: event.target.value })} />
          </label>
        </div>
        <section className="detail-section">
          <PanelTitle icon={<ListChecks size={18} />} title={t("taskDetail.subtasks")} />
          {subtasks.length > 0 ? (
            <div className="detail-list">
              {subtasks.map((subtask) => (
                <div className={`detail-list-row ${subtask.completed ? "done" : ""}`} key={subtask.id}>
                  <label className="inline-check">
                    <input
                      type="checkbox"
                      checked={subtask.completed}
                      onChange={(event) => updateSubtask(subtask.id, { completed: event.target.checked })}
                    />
                    <span>{subtask.title}</span>
                  </label>
                  <button className="icon-button small" type="button" title={t("common.delete")} onClick={() => removeSubtask(subtask.id)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="inline-alert">{t("taskDetail.emptySubtasks")}</div>
          )}
          <form className="inline-form" onSubmit={submitSubtask}>
            <input
              value={subtaskDraft}
              onChange={(event) => setSubtaskDraft(event.target.value)}
              placeholder={t("taskDetail.subtaskPlaceholder")}
            />
            <Button type="submit">
              <Plus size={16} />
              {t("common.add")}
            </Button>
          </form>
        </section>

        <section className="detail-section">
          <PanelTitle icon={<Bell size={18} />} title={t("taskDetail.reminders")} />
          {reminders.length > 0 ? (
            <div className="detail-list">
              {reminders.map((reminder) => (
                <div className="detail-list-row" key={reminder.id}>
                  <span>{new Date(reminder.remindAt).toLocaleString()}</span>
                  <button className="icon-button small" type="button" title={t("common.delete")} onClick={() => removeReminder(reminder.id)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="inline-alert">{t("taskDetail.emptyReminders")}</div>
          )}
          <form className="inline-form" onSubmit={submitReminder}>
            <input
              type="datetime-local"
              value={reminderDraft}
              onChange={(event) => setReminderDraft(event.target.value)}
              aria-label={t("taskDetail.reminderAt")}
            />
            <Button type="submit">
              <Clock size={16} />
              {t("common.add")}
            </Button>
          </form>
        </section>

        <section className="detail-section">
          <PanelTitle icon={<Repeat2 size={18} />} title={t("taskDetail.repeat")} />
          <select value={draft.repeat} onChange={(event) => setDraft({ ...draft, repeat: event.target.value })}>
            <option value="">{t("taskDetail.repeatNone")}</option>
            <option value="daily">{t("taskDetail.repeatDaily")}</option>
            <option value="weekly">{t("taskDetail.repeatWeekly")}</option>
            <option value="monthly">{t("taskDetail.repeatMonthly")}</option>
            <option value="yearly">{t("taskDetail.repeatYearly")}</option>
            <option value="weekdays">{t("taskDetail.repeatWeekdays")}</option>
          </select>
          {draft.repeat ? <span className="form-message">{t("taskDetail.repeatCompletionNote")}</span> : null}
        </section>

        <section className="detail-section">
          <PanelTitle icon={<Tag size={18} />} title={t("taskDetail.tags")} />
          <div className="tag-pool">
            {tags.map((tag) => {
              const active = activeTask.tags.includes(tag.name);
              return (
                <button
                  key={tag.id}
                  className={active ? "active" : ""}
                  type="button"
                  onClick={() => (active ? removeTaskTag(activeTask.id, tag.id) : assignTaskTag(activeTask.id, tag.id))}
                >
                  #{tag.name}
                </button>
              );
            })}
          </div>
          {tags.length === 0 ? <div className="inline-alert">{t("taskDetail.emptyTags")}</div> : null}
          <form className="inline-form" onSubmit={submitTag}>
            <input value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} placeholder={t("taskDetail.tagPlaceholder")} />
            <Button type="submit">
              <Plus size={16} />
              {t("taskDetail.addTag")}
            </Button>
          </form>
          <label>
            <span>{t("taskDetail.tags")}</span>
            <input value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} />
          </label>
        </section>

        <section className="detail-section">
          <PanelTitle icon={<MoreHorizontal size={18} />} title={t("taskDetail.additional")} />
          <label>
            <span>{t("taskDetail.buildVersion")}</span>
            <input value={draft.buildVersion} onChange={(event) => setDraft({ ...draft, buildVersion: event.target.value })} />
          </label>
          <label>
            <span>{t("taskDetail.stepsToReproduce")}</span>
            <textarea
              value={draft.stepsToReproduce}
              onChange={(event) => setDraft({ ...draft, stepsToReproduce: event.target.value })}
            />
          </label>
          <label>
            <span>{t("taskDetail.expectedResult")}</span>
            <textarea value={draft.expectedResult} onChange={(event) => setDraft({ ...draft, expectedResult: event.target.value })} />
          </label>
          <label>
            <span>{t("taskDetail.actualResult")}</span>
            <textarea value={draft.actualResult} onChange={(event) => setDraft({ ...draft, actualResult: event.target.value })} />
          </label>
        </section>
        <div className="toolbar modal-actions">
          <Button type="button" onClick={saveTask}>
            <Pencil size={16} />
            {t("common.save")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => (activeTask.completed ? uncompleteTask(activeTask.id) : completeTask(activeTask.id))}
          >
            <Check size={16} />
            {activeTask.completed ? t("taskDetail.reopen") : t("taskDetail.complete")}
          </Button>
          <Button type="button" variant="danger" onClick={remove}>
            <Trash2 size={16} />
            {t("common.delete")}
          </Button>
        </div>
      </section>
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

function filterTasks(tasks: LocalTask[], searchQuery: string, filters: ReturnType<typeof useAppStore.getState>["taskFilters"]) {
  const query = searchQuery.trim().toLowerCase();
  return tasks.filter((task) => {
    if (filters.projectId && task.projectId !== filters.projectId) {
      return false;
    }
    if (filters.status === "todo" && task.completed) {
      return false;
    }
    if (filters.status === "done" && !task.completed) {
      return false;
    }
    if (filters.priority && task.priority !== filters.priority) {
      return false;
    }
    if (filters.type && task.type !== filters.type) {
      return false;
    }
    if (filters.tag && !task.tags.includes(filters.tag)) {
      return false;
    }
    if (!query) {
      return true;
    }

    return [task.title, task.description, task.gameArea, task.buildVersion, ...task.tags]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
}

function groupTodayTasks(tasks: LocalTask[]) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    overdue: tasks.filter((task) => !task.completed && task.dueDate && task.dueDate < today),
    today: tasks.filter((task) => task.dueDate === today),
    noDate: tasks.filter((task) => !task.dueDate)
  };
}

function groupUpcomingTasks(tasks: LocalTask[]) {
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const end = new Date(today);
  end.setDate(today.getDate() + 7);
  const endKey = end.toISOString().slice(0, 10);
  const dated = tasks.filter((task) => !task.completed && task.dueDate && task.dueDate > todayKey);
  return {
    nextSeven: dated.filter((task) => task.dueDate && task.dueDate <= endKey),
    later: dated.filter((task) => task.dueDate && task.dueDate > endKey)
  };
}

function repeatLabel(t: TFunction, repeat: string) {
  const keyByRepeat: Record<string, TranslationKey> = {
    daily: "taskDetail.repeatDaily",
    weekly: "taskDetail.repeatWeekly",
    monthly: "taskDetail.repeatMonthly",
    yearly: "taskDetail.repeatYearly",
    weekdays: "taskDetail.repeatWeekdays"
  };
  return t(keyByRepeat[repeat] ?? "taskDetail.repeat");
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
