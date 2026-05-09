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

const navItems: Array<{ id: ViewId; label: string; icon: ReactNode }> = [
  { id: "today", label: "Today", icon: <ClipboardList size={18} /> },
  { id: "projects", label: "Projects", icon: <Columns3 size={18} /> },
  { id: "calendar", label: "Calendar", icon: <CalendarDays size={18} /> },
  { id: "habits", label: "Habits", icon: <Flame size={18} /> },
  { id: "notes", label: "Notes", icon: <NotebookText size={18} /> },
  { id: "import", label: "Import", icon: <Import size={18} /> },
  { id: "game-dev", label: "Game Dev", icon: <FileCode2 size={18} /> },
  { id: "focus", label: "Focus", icon: <Timer size={18} /> },
  { id: "stats", label: "Stats", icon: <Gauge size={18} /> },
  { id: "settings", label: "Settings", icon: <Settings size={18} /> }
];

export default function App() {
  const hydrate = useAppStore((state) => state.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <div className="app-root">
      <AppShell />
    </div>
  );
}

function AppShell() {
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
            <div className="brand-name">Zada</div>
            <div className="brand-meta">Personal workspace</div>
          </div>
        </div>
        <nav className="sidebar-nav" aria-label="Main">
          {navItems.map((item) => (
            <button
              className={`nav-button ${activeView === item.id ? "active" : ""}`}
              key={item.id}
              onClick={() => setActiveView(item.id)}
              title={item.label}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="search-box">
            <Search size={18} />
            <input placeholder="Search tasks, notes, snippets" />
          </div>
          <div className="topbar-actions">
            <SyncIndicator state={syncState} />
            <button className="icon-button" title="Sync now" onClick={manualSync}>
              <RefreshCw size={18} />
            </button>
            <button className="icon-button" title="Notifications">
              <Bell size={18} />
            </button>
            <button className="icon-button" title="Subscription" onClick={() => setActiveView("subscription")}>
              <Sparkles size={18} />
            </button>
            <button className="icon-button" title="Toggle theme" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>
          </div>
        </header>

        <div className="content-scroll">
          <ViewRenderer view={activeView} />
        </div>
      </main>

      <MobileNav activeView={activeView} setActiveView={setActiveView} />
      <button className="fab" title="Add task" onClick={() => setActiveView("today")}>
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
  const tasks = useAppStore((state) => state.tasks);
  const toggleTask = useAppStore((state) => state.toggleTask);
  const completedCount = tasks.filter((task) => task.completed).length;
  const openTasks = tasks.filter((task) => !task.completed);

  return (
    <div className="page-grid">
      <section className="page-main">
        <PageHeader title="Today" meta={`${openTasks.length} open tasks`} />
        <QuickAdd />
        <div className="task-list">
          {tasks.map((task) => (
            <article className={`task-row ${task.completed ? "done" : ""}`} key={task.id}>
              <button className="check-button" title="Toggle complete" onClick={() => toggleTask(task.id)}>
                {task.completed ? <Check size={15} /> : null}
              </button>
              <div className="task-body">
                <div className="task-title-row">
                  <h3>{task.title}</h3>
                  <Badge tone={task.type === "bug" ? "danger" : task.type === "design" ? "info" : "neutral"}>{task.type}</Badge>
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
              <button className="icon-button small" title="Open task">
                <ChevronRight size={16} />
              </button>
            </article>
          ))}
        </div>
      </section>

      <aside className="page-side">
        <Panel>
          <PanelTitle icon={<Gauge size={18} />} title="Daily Load" />
          <div className="metric-grid">
            <Metric label="Open" value={openTasks.length} />
            <Metric label="Done" value={completedCount} />
            <Metric label="Focus" value="50m" />
            <Metric label="Sync" value="Local" />
          </div>
        </Panel>
        <Panel>
          <PanelTitle icon={<CalendarDays size={18} />} title="Upcoming" />
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
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Add task #tag p1 due:2026-05-10 [bug]"
      />
      <Button title="Add task" type="submit">
        <Zap size={16} />
        Add
      </Button>
    </form>
  );
}

function ProjectsView() {
  const tasks = useAppStore((state) => state.tasks);
  const groups = useMemo(
    () => [
      { title: "Inbox", count: tasks.length, color: "indigo" },
      { title: "Game Development Project", count: tasks.filter((task) => task.tags.includes("gdd")).length, color: "green" },
      { title: "Bug Tracker", count: tasks.filter((task) => task.type === "bug").length, color: "red" }
    ],
    [tasks]
  );

  return (
    <section>
      <PageHeader title="Projects" meta="Workspace overview" />
      <div className="project-grid">
        {groups.map((project) => (
          <article className="project-card" key={project.title}>
            <div className={`project-swatch ${project.color}`} />
            <h3>{project.title}</h3>
            <p>{project.count} linked tasks</p>
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
  const columns = ["Ideas", "Backlog", "Todo", "In Progress", "Testing", "Done"];
  const tasks = useAppStore((state) => state.tasks);

  return (
    <div className="board-strip">
      {columns.map((column, index) => (
        <section className="kanban-column" key={column}>
          <h3>{column}</h3>
          {tasks.slice(index, index + 2).map((task) => (
            <article className="kanban-card" key={`${column}-${task.id}`}>
              <span>{task.title}</span>
              <Badge>{task.type}</Badge>
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}

function CalendarView() {
  const tasks = useAppStore((state) => state.tasks).filter((task) => task.dueDate);
  return (
    <section>
      <PageHeader title="Calendar" meta="Month, week, and agenda foundation" />
      <div className="calendar-layout">
        <Panel>
          <PanelTitle icon={<CalendarDays size={18} />} title="Agenda" />
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
              {index === 8 ? <small>Import preview</small> : null}
              {index === 13 ? <small>Focus block</small> : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HabitsView() {
  const habits = [
    { title: "Daily planning", streak: 9, tone: "success" as const },
    { title: "Prototype review", streak: 4, tone: "warning" as const },
    { title: "Write design notes", streak: 12, tone: "info" as const }
  ];

  return (
    <section>
      <PageHeader title="Habits" meta="Simple streak tracking" />
      <div className="habit-grid">
        {habits.map((habit) => (
          <article className="habit-card" key={habit.title}>
            <div>
              <h3>{habit.title}</h3>
              <p>{habit.streak} day streak</p>
            </div>
            <Badge tone={habit.tone}>active</Badge>
          </article>
        ))}
      </div>
    </section>
  );
}

function NotesView() {
  const notes = useAppStore((state) => state.notes);
  const saveNote = useAppStore((state) => state.saveNote);
  const noteSettings = useAppStore((state) => state.noteSettings);
  const [draft, setDraft] = useState({ title: "New Note", content: "", tags: "ideas" });

  async function submit(event: FormEvent) {
    event.preventDefault();
    await saveNote({
      title: draft.title,
      content: draft.content,
      tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean)
    });
    setDraft({ title: "New Note", content: "", tags: "ideas" });
  }

  return (
    <div className="page-grid">
      <section className="page-main">
        <PageHeader title="Notes" meta={noteSettings.notesEnabled ? "Sync enabled" : "Local-only"} />
        <form className="note-editor" onSubmit={submit}>
          <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          <input value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} />
          <textarea value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} />
          <Button type="submit">
            <FileText size={16} />
            Save
          </Button>
        </form>
        <div className="note-list">
          {notes.map((note) => (
            <article className="note-card" key={note.id}>
              <div className="note-head">
                <h3>{note.title}</h3>
                <Badge tone={note.syncStatus === "local_only" ? "warning" : note.syncStatus === "error" ? "danger" : "success"}>
                  {note.syncStatus.replace("_", " ")}
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
          <PanelTitle icon={<Link2 size={18} />} title="Internal Links" />
          <div className="compact-list">
            {notes.flatMap((note) => parseInternalLinks(note.content)).map((link) => (
              <div className="compact-row" key={`${link.kind}-${link.target}`}>
                <span>{link.kind}</span>
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
  const source = useAppStore((state) => state.importSource);
  const preview = useAppStore((state) => state.importPreview);
  const setImportSource = useAppStore((state) => state.setImportSource);
  const confirmImport = useAppStore((state) => state.confirmImport);

  return (
    <div className="page-grid">
      <section className="page-main">
        <PageHeader title="Task Import" meta={preview.projectName ?? "Outline parser"} />
        <textarea className="import-editor" value={source} onChange={(event) => setImportSource(event.target.value)} />
        <div className="toolbar">
          <Button onClick={confirmImport} disabled={preview.errors.length > 0}>
            <Upload size={16} />
            Confirm
          </Button>
          <Button variant="secondary">
            <Download size={16} />
            Export JSON
          </Button>
        </div>
      </section>
      <aside className="page-side">
        <Panel>
          <PanelTitle icon={<Import size={18} />} title="Preview" />
          <div className="metric-grid">
            <Metric label="Tasks" value={preview.items.length} />
            <Metric label="Warnings" value={preview.warnings.length} />
            <Metric label="Errors" value={preview.errors.length} />
            <Metric label="Project" value={preview.projectName ? "Yes" : "No"} />
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
  const createGameDevWorkspace = useAppStore((state) => state.createGameDevWorkspace);
  const setActiveView = useAppStore((state) => state.setActiveView);
  const subscription = useAppStore((state) => state.subscription);
  const access = canUseFeatureOffline("game_dev_workspace", subscription);

  return (
    <section>
      <PageHeader title="Game Dev" meta={access.allowed ? "Workspace enabled" : "Premium gated"} />
      <div className="game-layout">
        <Panel>
          <PanelTitle icon={<FileCode2 size={18} />} title="Project Template" />
          <div className="template-grid">
            {gameDevTemplate.defaultTaskGroups.map((group) => (
              <article className="template-item" key={group.title}>
                <Badge>{group.type}</Badge>
                <h3>{group.title}</h3>
                <p>{group.tasks.length} starter tasks</p>
              </article>
            ))}
          </div>
          {!access.allowed ? <div className="inline-alert">Game Dev Workspace is a premium feature.</div> : null}
          <Button onClick={access.allowed ? createGameDevWorkspace : () => setActiveView("subscription")} disabled={!access.allowed}>
            <Plus size={16} />
            {access.allowed ? "Create" : "Upgrade"}
          </Button>
        </Panel>
        <Panel>
          <PanelTitle icon={<Code2 size={18} />} title="Snippets" />
          <CodePreview />
        </Panel>
        <Panel>
          <PanelTitle icon={<Archive size={18} />} title="Milestones" />
          <div className="milestone-list">
            {["Prototype", "Vertical Slice", "Alpha", "Beta", "Release"].map((milestone, index) => (
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
  return (
    <section>
      <PageHeader title="Focus" meta="Pomodoro session" />
      <div className="focus-shell">
        <div className="focus-timer">25:00</div>
        <div className="toolbar">
          <Button>
            <Play size={16} />
            Start
          </Button>
          <Button variant="secondary">
            <RefreshCw size={16} />
            Reset
          </Button>
        </div>
      </div>
    </section>
  );
}

function StatsView() {
  const tasks = useAppStore((state) => state.tasks);
  const data = [
    { label: "Mon", tasks: 3 },
    { label: "Tue", tasks: 6 },
    { label: "Wed", tasks: 4 },
    { label: "Thu", tasks: tasks.length },
    { label: "Fri", tasks: 5 }
  ];

  return (
    <section>
      <PageHeader title="Stats" meta="Task and focus trends" />
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
  return (
    <div className="page-grid">
      <section className="page-main">
        <PageHeader title="Settings" meta="Workspace preferences" />
        <AuthPanel />
        <NoteSyncPanel />
      </section>
      <aside className="page-side">
        <SubscriptionView compact />
      </aside>
    </div>
  );
}

function AuthPanel() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("demo@zada.local");
  const [name, setName] = useState("Demo User");
  const [password, setPassword] = useState("password123");
  const [message, setMessage] = useState(localStorage.getItem("zada.accessToken") ? "Signed in locally" : "Not signed in");

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const response =
        mode === "login"
          ? await api.login({ email, password })
          : await api.register({ email, password, name });
      localStorage.setItem("zada.accessToken", response.accessToken);
      localStorage.setItem("zada.refreshToken", response.refreshToken);
      setMessage(`Signed in as ${response.user.email}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Authentication failed");
    }
  }

  return (
    <Panel>
      <PanelTitle icon={<Settings size={18} />} title="Account" />
      <form className="auth-form" onSubmit={submit}>
        <div className="segmented">
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>
            Login
          </button>
          <button type="button" className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>
            Register
          </button>
        </div>
        {mode === "register" ? <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Name" /> : null}
        <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" type="email" />
        <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" type="password" />
        <div className="toolbar">
          <Button type="submit">{mode === "login" ? "Login" : "Register"}</Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              localStorage.removeItem("zada.accessToken");
              localStorage.removeItem("zada.refreshToken");
              setMessage("Signed out locally");
            }}
          >
            Logout
          </Button>
        </div>
        <span className="form-message">{message}</span>
      </form>
    </Panel>
  );
}

function SubscriptionView({ compact = false }: { compact?: boolean }) {
  const subscription = useAppStore((state) => state.subscription);
  const features = Object.entries(premiumFeatures).slice(0, compact ? 6 : 15);
  const [message, setMessage] = useState("");

  return (
    <section>
      {!compact ? <PageHeader title="Subscription" meta={`Plan: ${subscription.plan}`} /> : null}
      <Panel>
        <PanelTitle icon={<Sparkles size={18} />} title="Premium Gates" />
        <div className="subscription-head">
          <div>
            <strong>{subscription.plan}</strong>
            <span>{subscription.status}</span>
          </div>
          <Button
            onClick={() => setMessage("Subscription purchase is not available yet.")}
            title="Upgrade"
          >
            <Sparkles size={16} />
            Upgrade
          </Button>
        </div>
        {message ? <div className="inline-alert">{message}</div> : null}
        <div className="feature-list">
          {features.map(([key, feature]) => {
            const access = canUseFeatureOffline(key as keyof typeof premiumFeatures, subscription);
            return (
              <div className="feature-row" key={key}>
                <span>{feature.label}</span>
                <Badge tone={access.allowed ? "success" : "neutral"}>{access.allowed ? "enabled" : "pro"}</Badge>
              </div>
            );
          })}
        </div>
      </Panel>
    </section>
  );
}

function NoteSyncPanel() {
  const settings = useAppStore((state) => state.noteSettings);
  const toggleNotesSync = useAppStore((state) => state.toggleNotesSync);

  return (
    <Panel>
      <PanelTitle icon={<RefreshCw size={18} />} title="Notes Sync" />
      <div className="settings-row">
        <div>
          <strong>Notes synchronization</strong>
          <span>{settings.notesEnabled ? "New changes enter the sync queue." : "New changes stay on this device."}</span>
        </div>
        <label className="switch">
          <input type="checkbox" checked={settings.notesEnabled} onChange={(event) => toggleNotesSync(event.target.checked)} />
          <span />
        </label>
      </div>
      {!settings.notesEnabled ? <div className="inline-alert">Local-only notes are included in JSON export.</div> : null}
    </Panel>
  );
}

function MarkdownPreview({ markdown }: { markdown: string }) {
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
            <button className="icon-button small" title="Copy code">
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
              {link.kind}: {link.target}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CodePreview() {
  const code = `public class PlayerAttack : MonoBehaviour\n{\n    public void Attack()\n    {\n        hitbox.EnableFor(0.18f);\n    }\n}`;

  return (
    <div className="code-block">
      <div className="code-head">
        <span>csharp</span>
        <button className="icon-button small" title="Copy code">
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
  const mobileItems = navItems.filter((item) => ["today", "projects", "calendar", "habits"].includes(item.id));

  return (
    <nav className="mobile-nav" aria-label="Mobile">
      {mobileItems.map((item) => (
        <button className={activeView === item.id ? "active" : ""} key={item.id} onClick={() => setActiveView(item.id)}>
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
      <button className={activeView === "settings" ? "active" : ""} onClick={() => setActiveView("settings")}>
        <MoreHorizontal size={18} />
        <span>More</span>
      </button>
    </nav>
  );
}

function SyncIndicator({ state }: { state: string }) {
  return (
    <div className={`sync-indicator ${state}`}>
      <span />
      {state}
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
