"use strict";

const STORAGE_KEY = "codex.taskbook.v1";
const DB_NAME = "codex-taskbook-db";
const DB_VERSION = 1;
const DB_STORES = ["tasks", "lists", "tags", "filters", "habits", "people", "countdowns", "history", "meta"];
const DAY_MS = 24 * 60 * 60 * 1000;
const API_BASE = localStorage.getItem("taskbook.apiBase") || (location.protocol === "file:" ? "http://localhost:3000/api" : "/api");
const USER_ID = localStorage.getItem("taskbook.userId") || "local-user";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const els = {
  app: $("#app"),
  content: $("#content"),
  viewTitle: $("#viewTitle"),
  viewSubtitle: $("#viewSubtitle"),
  listsNav: $("#listsNav"),
  tagsNav: $("#tagsNav"),
  filtersNav: $("#filtersNav"),
  searchInput: $("#searchInput"),
  quickAdd: $("#quickAdd"),
  quickAddInput: $("#quickAddInput"),
  quickAddSubmit: $("#quickAddSubmit"),
  quickAddBtn: $("#quickAddBtn"),
  detailPanel: $("#detailPanel"),
  contextMenu: $("#contextMenu"),
  modalRoot: $("#modalRoot"),
  toast: $("#toast"),
  taskTemplate: $("#taskCardTemplate"),
};

let state = createSeedState();
let selectedTaskId = null;
let activeMenuTaskId = null;
let draggedTaskId = null;
let focusTimer = null;
let toastTimer = null;
let saveTimer = null;
let reminderTimer = null;
let serverSyncTimer = null;
let miniDB = null;
let storageStatus = "Инициализация";
let apiStatus = "offline";
let pushPublicKey = "";
let serviceWorkerRegistration = null;

boot();

async function boot() {
  state = await loadState();
  init();
}

function init() {
  const narrowViewport = window.matchMedia("(max-width: 820px)").matches;
  if (narrowViewport && !state.ui.sidebarManual) {
    state.ui.sidebarCollapsed = true;
    saveState();
  }
  if (!narrowViewport && !state.ui.sidebarManual && state.ui.sidebarCollapsed) {
    state.ui.sidebarCollapsed = false;
    saveState();
  }
  applyTheme();
  bindEvents();
  render();
  restoreHashSelection();
  tickFocusTimer();
  startReminderWatcher();
  registerAppShell();
  setupDesktopBridge();
  connectBackend();
}

function bindEvents() {
  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("contextmenu", handleContextMenu);
  document.addEventListener("keydown", handleKeys);

  els.searchInput.addEventListener("input", () => {
    state.ui.search = els.searchInput.value;
    saveState();
    renderContent();
  });

  els.quickAddSubmit.addEventListener("click", submitQuickAdd);
  els.quickAddInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") submitQuickAdd();
  });

  els.content.addEventListener("dragstart", handleDragStart);
  els.content.addEventListener("dragend", handleDragEnd);
  els.content.addEventListener("dragover", handleDragOver);
  els.content.addEventListener("dragleave", handleDragLeave);
  els.content.addEventListener("drop", handleDrop);

  els.detailPanel.addEventListener("input", handleDetailInput);
  els.detailPanel.addEventListener("change", handleDetailChange);
  els.detailPanel.addEventListener("click", handleDetailClick);

  window.addEventListener("hashchange", restoreHashSelection);
  window.addEventListener("beforeunload", saveState);
}

async function loadState() {
  const localState = readLocalBackup();
  if (!("indexedDB" in window)) {
    storageStatus = "localStorage";
    return normalizeState(localState || createSeedState());
  }

  try {
    miniDB = await openMiniDB();
    const saved = await readStateFromDB();
    if (saved?.tasks?.length || saved?.lists?.length) {
      storageStatus = "IndexedDB";
      return normalizeState(saved);
    }

    const initial = normalizeState(localState || createSeedState());
    await persistStateNow(initial);
    storageStatus = "IndexedDB";
    return initial;
  } catch (error) {
    console.warn("IndexedDB is not available, falling back to localStorage", error);
    storageStatus = "localStorage";
    return normalizeState(localState || createSeedState());
  }
}

function readLocalBackup() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn("Cannot read saved state", error);
    return null;
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("Cannot write local backup", error);
  }

  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    persistStateNow().catch((error) => {
      storageStatus = "localStorage";
      console.warn("Cannot write IndexedDB state", error);
    });
  }, 180);

  scheduleServerSync();
}

async function persistStateNow(snapshot = state) {
  if (!miniDB) return;
  const tx = miniDB.transaction(DB_STORES, "readwrite");
  const writes = [];
  for (const storeName of DB_STORES) {
    const store = tx.objectStore(storeName);
    writes.push(idbRequest(store.clear()));
    if (storeName === "meta") continue;
    const rows = Array.isArray(snapshot[storeName]) ? snapshot[storeName] : [];
    rows.forEach((row) => writes.push(idbRequest(store.put(structuredClone(row)))));
  }
  const meta = tx.objectStore("meta");
  [
    ["version", snapshot.version || 1],
    ["settings", snapshot.settings],
    ["focus", snapshot.focus],
    ["ui", snapshot.ui],
  ].forEach(([key, value]) => writes.push(idbRequest(meta.put({ key, value: structuredClone(value) }))));
  await Promise.all(writes);
  await idbTxDone(tx);
}

function openMiniDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      DB_STORES.forEach((storeName) => {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: storeName === "meta" ? "key" : "id" });
        }
      });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readStateFromDB() {
  const tx = miniDB.transaction(DB_STORES, "readonly");
  const reads = Object.fromEntries(DB_STORES.map((storeName) => [storeName, idbRequest(tx.objectStore(storeName).getAll())]));
  const result = {};
  for (const storeName of DB_STORES) result[storeName] = await reads[storeName];
  await idbTxDone(tx);
  const meta = Object.fromEntries((result.meta || []).map((item) => [item.key, item.value]));
  return {
    version: meta.version || 1,
    lists: result.lists || [],
    tags: result.tags || [],
    tasks: result.tasks || [],
    filters: result.filters || [],
    habits: result.habits || [],
    people: result.people || [],
    countdowns: result.countdowns || [],
    history: result.history || [],
    settings: meta.settings,
    focus: meta.focus,
    ui: meta.ui,
  };
}

function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbTxDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function connectBackend() {
  try {
    const bootstrap = await apiFetch("/bootstrap");
    apiStatus = "online";
    pushPublicKey = bootstrap.pushPublicKey || "";
    const serverState = bootstrap.state ? normalizeState(bootstrap.state) : null;
    const serverTime = bootstrap.updatedAt ? new Date(bootstrap.updatedAt).getTime() : 0;
    const localTime = state.settings.lastServerSyncAt ? new Date(state.settings.lastServerSyncAt).getTime() : 0;

    if (serverState && serverTime > localTime) {
      state = serverState;
      state.settings.lastServerSyncAt = bootstrap.updatedAt;
      await persistStateNow();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      render();
      toast("Данные загружены с сервера");
    } else {
      await syncStateToServer();
    }
    renderTopbar();
  } catch (error) {
    apiStatus = "offline";
    renderTopbar();
  }
}

function scheduleServerSync() {
  clearTimeout(serverSyncTimer);
  serverSyncTimer = setTimeout(() => {
    syncStateToServer().catch(() => {
      apiStatus = "offline";
    });
  }, 900);
}

async function syncStateToServer() {
  if (!navigator.onLine && location.protocol !== "file:") return;
  const result = await apiFetch("/snapshot", {
    method: "PUT",
    body: JSON.stringify({ state }),
  });
  apiStatus = "online";
  state.settings.lastServerSyncAt = result.updatedAt || new Date().toISOString();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // IndexedDB remains the primary local store.
  }
}

async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      "x-user-id": USER_ID,
      ...(options.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`API ${response.status}`);
  return response.json();
}

function normalizeState(source) {
  const seed = createSeedState();
  const next = {
    ...seed,
    ...source,
    ui: { ...seed.ui, ...(source.ui || {}) },
    settings: { ...seed.settings, ...(source.settings || {}) },
    focus: { ...seed.focus, ...(source.focus || {}) },
  };
  next.lists = Array.isArray(source.lists) ? source.lists : seed.lists;
  next.tasks = Array.isArray(source.tasks) ? source.tasks : seed.tasks;
  next.tags = Array.isArray(source.tags) ? source.tags : seed.tags;
  next.filters = Array.isArray(source.filters) ? source.filters : seed.filters;
  next.habits = Array.isArray(source.habits) ? source.habits : seed.habits;
  next.people = Array.isArray(source.people) ? source.people : seed.people;
  next.countdowns = Array.isArray(source.countdowns) ? source.countdowns : seed.countdowns;
  next.history = Array.isArray(source.history) ? source.history : seed.history;
  next.tasks.forEach((task, index) => {
    task.id ||= uid("task");
    task.order ??= index;
    task.tags ||= [];
    task.subtasks ||= [];
    task.comments ||= [];
    task.attachments ||= [];
    task.priority ??= 4;
    task.repeat ||= "none";
    task.reminder ||= "";
    task.reminders ||= task.reminder ? [task.reminder] : [];
    task.constantReminder ??= false;
    task.emailReminder ??= false;
    task.location ||= "";
    task.startTime ||= "";
    task.dueTime ||= "";
    task.assigneeId ||= "";
    task.estimate ||= 25;
    task.duration ||= task.estimate || 25;
    task.type ||= "task";
    task.listId ||= "inbox";
    task.sectionId ||= firstSectionId(task.listId, next);
  });
  return next;
}

function createSeedState() {
  const today = isoToday();
  const lists = [
    {
      id: "idea",
      name: "Основная идея игры",
      color: "#6b6efb",
      sections: [{ id: "idea-main", name: "Идеи" }],
    },
    {
      id: "game",
      name: "Игра",
      color: "#ff9f1a",
      sections: [
        { id: "players", name: "Игроки" },
        { id: "monsters", name: "Монстры" },
        { id: "locations", name: "Локации" },
        { id: "menu", name: "Меню" },
        { id: "talents", name: "Таланты" },
        { id: "items", name: "Вещи" },
      ],
    },
    {
      id: "inbox",
      name: "Входящие",
      color: "#7c8794",
      sections: [{ id: "inbox-main", name: "Входящие" }],
    },
  ];

  const tags = [
    { id: "dev", name: "dev", color: "#3867ff" },
    { id: "баланс", name: "баланс", color: "#22a06b" },
    { id: "ui", name: "ui", color: "#f59f00" },
    { id: "релиз", name: "релиз", color: "#e03131" },
  ];

  let order = 0;
  const make = (title, sectionId, options = {}) => ({
    id: uid("task"),
    title,
    listId: options.listId || "game",
    sectionId,
    done: Boolean(options.done),
    trashed: false,
    pinned: Boolean(options.pinned),
    wontDo: false,
    priority: options.priority || 4,
    due: typeof options.dueOffset === "number" ? isoAdd(today, options.dueOffset) : "",
    start: typeof options.startOffset === "number" ? isoAdd(today, options.startOffset) : "",
    repeat: options.repeat || "none",
    reminder: options.reminder || "",
    reminders: options.reminders || (options.reminder ? [options.reminder] : []),
    constantReminder: Boolean(options.constantReminder),
    emailReminder: Boolean(options.emailReminder),
    location: options.location || "",
    startTime: options.startTime || "",
    dueTime: options.dueTime || "",
    tags: options.tags || [],
    subtasks: options.subtasks || [],
    comments: options.comments || [],
    attachments: options.attachments || [],
    notes: options.notes || "",
    estimate: options.estimate || 25,
    duration: options.duration || options.estimate || 25,
    type: options.type || "task",
    parentId: options.parentId || "",
    assigneeId: options.assigneeId || "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: options.done ? new Date(Date.now() - (options.completedDays || 0) * DAY_MS).toISOString() : "",
    order: order++,
  });

  const playerTasks = [
    "Создать Player",
    "Сделать передвижение игрока",
    "Сделать поворот игрока в сторону движения или мышки",
    "Добавить здоровье игрока",
    "Добавить получение урона",
    "Добавить смерть игрока",
    "Добавить базовую атаку",
    "Добавить скорость атаки",
    "Добавить рывок",
    "Добавить опыт",
    "Добавить уровень игрока",
    "Сделать выбор улучшения при повышении уровня",
    "Добавить базовые статы игрока: урон, здоровье, броня, скорость",
    "Добавить дополнительные статы: крит, вампиризм, уклонение, удача",
    "Сделать сброс временных эффектов",
    "Добавить анимации игрока",
    "Добавить звуки урона и атаки",
    "Сделать сохранение прогресса игрока",
  ];

  const monsterTasks = [
    "Создать Slime",
    "Добавить движение монстра к игроку",
    "Добавить здоровье монстра",
    "Добавить получение урона монстром",
    "Добавить смерть монстра",
    "Добавить выпадение опыта",
    "Добавить выпадение золота",
    "Добавить урон игроку при касании",
    "Добавить быстрых врагов",
    "Добавить толстых врагов",
    "Добавить врагов-дальников",
    "Добавить ядовитых врагов",
    "Добавить огненных врагов",
    "Добавить взрывающихся врагов",
    "Добавить элитных врагов",
    "Добавить босса уровня",
    "Добавить волны монстров",
    "Сделать таблицу характеристик монстров",
  ];

  const locationTasks = [
    "Создать стартовую локацию",
    "Создать стартовый берег",
    "Создать лес",
    "Создать болото",
    "Создать пещеры",
    "Создать руины",
    "Создать кладбище",
    "Создать вулкан",
    "Создать замок",
    "Создать финальную арену",
    "Сделать переход между локациями",
    "Добавить комнаты или зоны внутри локации",
    "Добавить случайное появление монстров",
    "Добавить сундуки на локациях",
    "Добавить секретные комнаты",
    "Добавить ловушки",
    "Добавить мини-карту",
    "Сделать генерацию маршрута забега",
  ];

  const menuTasks = [
    "Сделать кнопку “Выход”",
    "Сделать меню паузы",
    "Сделать экран выбора класса",
    "Сделать экран выбора улучшения при уровне",
    "Сделать инвентарь",
    "Сделать меню талантов",
    "Сделать меню постоянных улучшений",
    "Сделать экран смерти",
    "Сделать экран результатов забега",
    "Сделать экран победы",
    "Сделать отображение здоровья",
    "Сделать отображение опыта",
    "Сделать отображение уровня",
    "Сделать отображение золота",
    "Сделать отображение активных эффектов",
    "Сделать журнал заданий",
    "Сделать настройки звука",
    "Сделать настройки управления",
    "Сделать экран сохранений",
  ];

  const tasks = [];
  playerTasks.forEach((title, index) => {
    tasks.push(
      make(title, "players", {
        dueOffset: index % 4 === 0 ? 0 : index % 5 === 0 ? 1 : "",
        priority: index < 4 ? 2 : index % 7 === 0 ? 1 : 4,
        tags: index % 3 === 0 ? ["dev"] : [],
        pinned: index === 0,
      })
    );
  });
  monsterTasks.forEach((title, index) => {
    tasks.push(
      make(title, "monsters", {
        dueOffset: index % 6 === 0 ? 2 : "",
        priority: index % 5 === 0 ? 3 : 4,
        tags: index % 4 === 0 ? ["баланс"] : [],
      })
    );
  });
  locationTasks.forEach((title, index) => {
    tasks.push(
      make(title, "locations", {
        dueOffset: index % 5 === 0 ? 5 : "",
        priority: index < 3 ? 2 : 4,
      })
    );
  });
  menuTasks.forEach((title, index) => {
    tasks.push(
      make(title, "menu", {
        dueOffset: index % 4 === 0 ? 3 : "",
        priority: index < 5 ? 2 : 4,
        tags: index % 3 === 0 ? ["ui"] : [],
      })
    );
  });

  tasks.push(
    make("Определить основной игровой цикл", "idea-main", {
      listId: "idea",
      priority: 1,
      dueOffset: 0,
      tags: ["релиз"],
      subtasks: [
        { id: uid("sub"), title: "Описать цель забега", done: true },
        { id: uid("sub"), title: "Описать награды", done: false },
      ],
      notes: "Короткий забег, прогресс между попытками, быстрые решения при повышении уровня.",
    }),
    make("Внести идеи после плейтеста", "inbox-main", {
      listId: "inbox",
      priority: 3,
      dueOffset: 1,
    }),
    make("Закрытая задача для проверки статистики", "players", {
      done: true,
      completedDays: 1,
      priority: 4,
      tags: ["dev"],
    }),
    make("Старый вариант интерфейса", "menu", {
      done: true,
      completedDays: 3,
      priority: 4,
      tags: ["ui"],
    })
  );

  return {
    version: 1,
    lists,
    tags,
    tasks,
    filters: [
      { id: "high", name: "Высокий приоритет", mode: "priority", value: 1 },
      { id: "overdue", name: "Просрочено", mode: "overdue", value: true },
      { id: "notes", name: "Заметки", mode: "type", value: "note" },
    ],
    habits: [
      { id: "habit-design", name: "Планирование", color: "#3867ff", records: { [today]: true } },
      { id: "habit-build", name: "Сборка проекта", color: "#22a06b", records: {} },
      { id: "habit-playtest", name: "Плейтест", color: "#f59f00", records: {} },
    ],
    people: [
      { id: "person-owner", name: "Вы", color: "#3f6df6" },
      { id: "person-design", name: "Дизайн", color: "#f59f00" },
      { id: "person-code", name: "Разработка", color: "#22a06b" },
    ],
    countdowns: [
      { id: "countdown-release", title: "Вертикальный срез", date: isoAdd(today, 21), color: "#3f6df6" },
      { id: "countdown-playtest", title: "Плейтест", date: isoAdd(today, 7), color: "#22a06b" },
    ],
    history: [],
    settings: {
      theme: "light",
      sort: "manual",
      compact: false,
      lastServerSyncAt: "",
    },
    focus: {
      phase: "focus",
      remaining: 25 * 60,
      running: false,
      selectedTaskId: "",
      sessions: [],
    },
    ui: {
      activeFilter: "list:game",
      activeView: "board",
      search: "",
      sidebarCollapsed: false,
      sidebarManual: false,
      calendarMonth: today.slice(0, 7),
      calendarMode: "month",
      notifiedReminders: [],
    },
  };
}

function handleDocumentClick(event) {
  const target = event.target;
  const navItem = target.closest(".nav-item");
  const segment = target.closest(".seg");
  const railBtn = target.closest(".rail-btn");
  const taskCard = target.closest(".task-card, .list-row[data-task-id], .mini-task, .calendar-task, .timeline-item, .picker-row, .note-card, .countdown-card[data-task-id]");
  const taskMenu = target.closest(".task-menu");
  const check = target.closest(".check");
  const action = target.closest("[data-action]");

  if (!target.closest("#contextMenu")) closeContextMenu();

  if (navItem) {
    setActiveFilter(navItem.dataset.filter);
    return;
  }

  if (action) {
    handleAction(action.dataset.action, action, event);
    return;
  }

  if (segment?.dataset.view) {
    setView(segment.dataset.view);
    return;
  }

  if (railBtn?.dataset.nav) {
    const nav = railBtn.dataset.nav;
    setView(nav === "tasks" ? "board" : nav);
    return;
  }

  if (check && taskCard?.dataset.taskId) {
    toggleDone(taskCard.dataset.taskId);
    event.stopPropagation();
    return;
  }

  if (taskMenu && taskCard?.dataset.taskId) {
    event.stopPropagation();
    showTaskMenu(taskCard.dataset.taskId, taskMenu);
    return;
  }

  if (taskCard?.dataset.taskId) {
    openTask(taskCard.dataset.taskId);
  }
}

function handleContextMenu(event) {
  const card = event.target.closest(".task-card, .list-row[data-task-id], .mini-task, .calendar-task, .timeline-item, .note-card, .countdown-card[data-task-id]");
  if (!card?.dataset.taskId) return;
  event.preventDefault();
  showTaskMenu(card.dataset.taskId, { getBoundingClientRect: () => ({ left: event.clientX, bottom: event.clientY, right: event.clientX, top: event.clientY }) }, true);
}

function handleKeys(event) {
  const editable = event.target.matches("input, textarea, select") || event.target.isContentEditable;
  if (event.key === "Escape") {
    if (els.contextMenu.classList.contains("open")) closeContextMenu();
    else if (els.modalRoot.classList.contains("open")) closeModal();
    else if (els.detailPanel.classList.contains("open")) closeDetail();
    else els.quickAdd.classList.remove("open");
    return;
  }
  if (editable) return;
  if (event.key.toLowerCase() === "n") {
    openQuickAdd();
  } else if (event.key === "/") {
    event.preventDefault();
    els.searchInput.focus();
  } else if (event.key === "?") {
    openHelp();
  }
}

function handleAction(action, element, event) {
  const taskId = element.dataset.taskId || activeMenuTaskId || selectedTaskId;
  switch (action) {
    case "toggle-sidebar":
      state.ui.sidebarCollapsed = !state.ui.sidebarCollapsed;
      state.ui.sidebarManual = true;
      saveState();
      renderShell();
      break;
    case "quick-add":
      openQuickAdd();
      break;
    case "add-list":
      promptText("Создать список", "Название списка", "", (value) => addList(value));
      break;
    case "add-tag":
      promptText("Создать метку", "Название метки", "", (value) => addTag(value));
      break;
    case "add-filter":
      promptFilter();
      break;
    case "add-task":
      promptText("Новая задача", "Что нужно сделать", "", (value) => {
        createTaskFromText(value, {
          listId: element.dataset.listId,
          sectionId: element.dataset.sectionId,
        });
      });
      break;
    case "add-column":
      addColumn();
      break;
    case "rename-column":
      renameColumn(element.dataset.sectionId);
      break;
    case "delete-column":
      deleteColumn(element.dataset.sectionId);
      break;
    case "month-prev":
      shiftMonth(state.ui.calendarMode === "year" ? -12 : -1);
      break;
    case "month-next":
      shiftMonth(state.ui.calendarMode === "year" ? 12 : 1);
      break;
    case "today-month":
      state.ui.calendarMonth = isoToday().slice(0, 7);
      saveState();
      renderContent();
      break;
    case "set-calendar-mode":
      state.ui.calendarMode = element.dataset.value;
      saveState();
      renderContent();
      break;
    case "set-calendar-month":
      state.ui.calendarMonth = element.dataset.value;
      state.ui.calendarMode = "month";
      saveState();
      renderContent();
      break;
    case "set-date":
      setTaskDate(taskId, element.dataset.value);
      break;
    case "set-priority":
      updateTask(taskId, { priority: Number(element.dataset.value) });
      closeContextMenu();
      break;
    case "add-subtask":
      addSubtaskFromMenu(taskId);
      break;
    case "link-parent":
      promptParent(taskId);
      break;
    case "pin":
      togglePin(taskId);
      break;
    case "wont-do":
      markWontDo(taskId);
      break;
    case "move-task":
      promptMoveTask(taskId);
      break;
    case "labels":
      promptTaskTags(taskId);
      break;
    case "focus-task":
      state.focus.selectedTaskId = taskId;
      state.ui.activeView = "focus";
      saveState();
      closeContextMenu();
      render();
      break;
    case "duplicate":
      duplicateTask(taskId);
      break;
    case "copy-link":
      copyTaskLink(taskId);
      break;
    case "open-note":
      openTask(taskId);
      setTimeout(() => $("#detailNotes")?.focus(), 0);
      closeContextMenu();
      break;
    case "convert-note":
      toggleNote(taskId);
      break;
    case "delete-task":
      trashTask(taskId);
      break;
    case "restore-task":
      updateTask(taskId, { trashed: false });
      break;
    case "hard-delete":
      hardDeleteTask(taskId);
      break;
    case "sort":
      openSortMenu(element);
      break;
    case "more":
      openMoreMenu(element);
      break;
    case "sync":
      saveState();
      toast("Сохранено локально");
      break;
    case "settings":
      openSettings();
      break;
    case "templates":
      openTemplates();
      break;
    case "enable-notifications":
      enableNotifications();
      break;
    case "help":
      openHelp();
      break;
    case "focus-start":
      startFocus();
      break;
    case "focus-pause":
      pauseFocus();
      break;
    case "focus-reset":
      resetFocus();
      break;
    case "focus-complete":
      completeFocusSession();
      break;
    case "select-focus-task":
      state.focus.selectedTaskId = element.dataset.taskId;
      saveState();
      renderContent();
      break;
    case "toggle-habit":
      toggleHabit(element.dataset.habitId, element.dataset.date);
      break;
    case "add-habit":
      promptText("Новая привычка", "Название привычки", "", (value) => {
        state.habits.push({ id: uid("habit"), name: value, color: randomColor(), records: {} });
        saveState();
        renderContent();
      });
      break;
    case "add-countdown":
      promptCountdown();
      break;
    case "delete-countdown":
      state.countdowns = state.countdowns.filter((item) => item.id !== element.dataset.countdownId);
      saveState();
      renderContent();
      break;
    case "create-note":
      createNote();
      break;
    case "theme":
      state.settings.theme = state.settings.theme === "dark" ? "light" : "dark";
      saveState();
      applyTheme();
      break;
    case "export":
      exportState();
      break;
    case "import":
      importStateFromModal();
      break;
    case "reset-demo":
      resetDemo();
      break;
    default:
      break;
  }
}

function render() {
  renderShell();
  renderNav();
  renderTopbar();
  renderContent();
  renderDetail();
}

function renderShell() {
  els.app.classList.toggle("sidebar-collapsed", state.ui.sidebarCollapsed);
  els.searchInput.value = state.ui.search || "";
  $$(".rail-btn[data-nav]").forEach((btn) => {
    const view = state.ui.activeView;
    const nav = btn.dataset.nav;
    btn.classList.toggle("active", nav === view || (nav === "tasks" && ["board", "list", "timeline"].includes(view)));
  });
}

function renderNav() {
  const counts = getCounts();
  $$("[data-count]").forEach((out) => {
    out.value = counts[out.dataset.count] || 0;
    out.textContent = counts[out.dataset.count] || 0;
  });

  $$(".nav-item").forEach((btn) => {
    if (!btn.closest("#listsNav, #tagsNav, #filtersNav")) {
      btn.classList.toggle("active", normalizeFilter(btn.dataset.filter) === state.ui.activeFilter);
    }
  });

  els.listsNav.innerHTML = state.lists
    .filter((list) => list.id !== "inbox")
    .map((list) => {
      const count = state.tasks.filter((task) => !task.trashed && !task.done && task.listId === list.id).length;
      return `
        <button class="nav-item ${state.ui.activeFilter === `list:${list.id}` ? "active" : ""}" type="button" data-filter="list:${list.id}">
          <span class="list-dot" style="background:${escapeAttr(list.color)}"></span>
          <span>${escapeHtml(list.name)}</span>
          <output>${count}</output>
        </button>
      `;
    })
    .join("");

  els.tagsNav.innerHTML = state.tags
    .map((tag) => {
      const count = state.tasks.filter((task) => !task.trashed && !task.done && task.tags.includes(tag.id)).length;
      return `
        <button class="nav-item ${state.ui.activeFilter === `tag:${tag.id}` ? "active" : ""}" type="button" data-filter="tag:${tag.id}">
          <span class="tag-chip" style="color:${escapeAttr(tag.color)}">#</span>
          <span>${escapeHtml(tag.name)}</span>
          <output>${count}</output>
        </button>
      `;
    })
    .join("");

  els.filtersNav.innerHTML = state.filters
    .map((filter) => {
      const count = getFilteredTasks(`filter:${filter.id}`).length;
      return `
        <button class="nav-item ${state.ui.activeFilter === `filter:${filter.id}` ? "active" : ""}" type="button" data-filter="filter:${filter.id}">
          <span class="icon icon-target"></span>
          <span>${escapeHtml(filter.name)}</span>
          <output>${count}</output>
        </button>
      `;
    })
    .join("");
}

function renderTopbar() {
  const meta = getActiveMeta();
  els.viewTitle.textContent = meta.title;
  els.viewSubtitle.textContent = meta.subtitle;
  $$(".seg").forEach((btn) => btn.classList.toggle("active", btn.dataset.view === state.ui.activeView));
}

function renderContent() {
  const view = state.ui.activeView;
  if (view === "board") renderBoard();
  else if (view === "list") renderListView();
  else if (view === "calendar") renderCalendarView();
  else if (view === "timeline") renderTimelineView();
  else if (view === "matrix") renderMatrixView();
  else if (view === "focus") renderFocusView();
  else if (view === "habits") renderHabitsView();
  else if (view === "countdown") renderCountdownView();
  else if (view === "notes") renderNotesView();
  else if (view === "stats") renderStatsView();
}

function renderBoard() {
  const { columns, smart } = getBoardColumns();
  const visible = getVisibleTasks();
  els.content.innerHTML = `<div class="board" id="board"></div>`;
  const board = $("#board");

  columns.forEach((column) => {
    const tasks = sortTasks(
      visible.filter((task) => {
        if (smart) return column.match(task);
        return task.sectionId === column.id && task.listId === column.listId;
      })
    );

    const columnNode = document.createElement("section");
    columnNode.className = "board-column";
    columnNode.innerHTML = `
      <div class="column-head">
        <div class="column-title">
          <span>${escapeHtml(column.name)}</span>
          <output>${tasks.length}</output>
        </div>
        ${
          column.listId
            ? `<button class="tiny-btn" type="button" data-action="add-task" data-list-id="${escapeAttr(column.listId)}" data-section-id="${escapeAttr(column.id)}" title="Добавить задачу" aria-label="Добавить задачу">+</button>`
            : ""
        }
        ${
          column.listId
            ? `<button class="tiny-btn" type="button" data-action="rename-column" data-section-id="${escapeAttr(column.id)}" title="Переименовать колонку" aria-label="Переименовать колонку">...</button>`
            : ""
        }
      </div>
      <div class="column-body" data-section-id="${escapeAttr(column.id)}" data-list-id="${escapeAttr(column.listId || "")}" data-smart="${smart ? column.id : ""}"></div>
    `;
    const body = $(".column-body", columnNode);
    if (tasks.length === 0) {
      body.innerHTML = `<div class="empty-column"></div>`;
    } else {
      tasks.forEach((task) => body.appendChild(createTaskCard(task)));
    }
    board.appendChild(columnNode);
  });

  const activeList = getActiveList();
  if (activeList) {
    const add = document.createElement("section");
    add.className = "board-column";
    add.innerHTML = `
      <div class="column-head">
        <button class="secondary-btn" type="button" data-action="add-column">
          <span class="icon icon-plus"></span>
          <span>Колонка</span>
        </button>
      </div>
    `;
    board.appendChild(add);
  }
}

function renderListView() {
  const tasks = sortTasks(getVisibleTasks());
  if (tasks.length === 0) {
    renderEmpty("Нет задач", "Создайте задачу или измените фильтр.");
    return;
  }
  els.content.innerHTML = `
    <div class="list-view">
      <div class="list-table">
        <div class="list-row header">
          <span></span>
          <span>Задача</span>
          <span>Дата</span>
          <span>Приоритет</span>
          <span>Список</span>
          <span></span>
        </div>
        ${tasks
          .map(
            (task) => `
            <div class="list-row ${task.done ? "done" : ""}" data-task-id="${escapeAttr(task.id)}">
              <button class="check" type="button" aria-label="Выполнить задачу"></button>
              <span class="cell-title">${escapeHtml(task.title)}</span>
              <span>${escapeHtml(formatDue(task.due))}</span>
              <span>${priorityLabel(task.priority)}</span>
              <span>${escapeHtml(getList(task.listId)?.name || "Без списка")}</span>
              <button class="task-menu" type="button" aria-label="Действия"><span class="icon icon-more"></span></button>
            </div>
          `
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderCalendarView() {
  const mode = state.ui.calendarMode || "month";
  if (mode === "week") return renderCalendarWeekView();
  if (mode === "agenda") return renderCalendarAgendaView();
  if (mode === "year") return renderCalendarYearView();

  const month = parseMonth(state.ui.calendarMonth || isoToday().slice(0, 7));
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = startOfWeek(first);
  const cells = Array.from({ length: 42 }, (_, index) => addDays(start, index));
  const names = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const tasks = getFilteredTasks(state.ui.activeFilter).filter((task) => !task.trashed && task.due);

  els.content.innerHTML = `
    <div class="calendar-view">
      <div class="calendar-head">
        <div>
          <h2>${month.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}</h2>
          ${calendarModeTabs()}
        </div>
        <div class="actions">
          <button class="secondary-btn" type="button" data-action="month-prev">Назад</button>
          <button class="secondary-btn" type="button" data-action="today-month">Сегодня</button>
          <button class="secondary-btn" type="button" data-action="month-next">Вперёд</button>
        </div>
      </div>
      <div class="calendar-grid">
        ${names.map((name) => `<div class="day-name">${name}</div>`).join("")}
        ${cells
          .map((date) => {
            const iso = toISO(date);
            const dayTasks = sortTasks(tasks.filter((task) => task.due === iso));
            return `
              <div class="day-cell ${date.getMonth() !== month.getMonth() ? "outside" : ""} ${iso === isoToday() ? "today" : ""}">
                <div class="day-num">${date.getDate()}</div>
                ${dayTasks.map((task) => `<button class="calendar-task" type="button" data-task-id="${escapeAttr(task.id)}">${escapeHtml(task.title)}</button>`).join("")}
              </div>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

function calendarModeTabs() {
  const mode = state.ui.calendarMode || "month";
  const modes = [
    ["month", "Месяц"],
    ["week", "Неделя"],
    ["agenda", "Повестка"],
    ["year", "Год"],
  ];
  return `
    <div class="inline-tabs">
      ${modes.map(([value, label]) => `<button class="seg ${mode === value ? "active" : ""}" type="button" data-action="set-calendar-mode" data-value="${value}">${label}</button>`).join("")}
    </div>
  `;
}

function renderCalendarWeekView() {
  const base = parseISO(isoToday());
  const start = startOfWeek(base);
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  const tasks = getFilteredTasks(state.ui.activeFilter).filter((task) => !task.trashed && task.due);
  els.content.innerHTML = `
    <div class="calendar-view">
      <div class="calendar-head">
        <div>
          <h2>Неделя ${formatDateShort(toISO(days[0]))} - ${formatDateShort(toISO(days[6]))}</h2>
          ${calendarModeTabs()}
        </div>
        <div class="actions">
          <button class="secondary-btn" type="button" data-action="today-month">Сегодня</button>
        </div>
      </div>
      <div class="week-grid">
        ${days
          .map((date) => {
            const iso = toISO(date);
            const dayTasks = sortTasks(tasks.filter((task) => task.due === iso));
            return `
              <section class="week-day ${iso === isoToday() ? "today" : ""}">
                <div class="week-day-head">
                  <strong>${date.toLocaleDateString("ru-RU", { weekday: "short" })}</strong>
                  <span>${date.getDate()}</span>
                </div>
                <div class="week-items">
                  ${
                    dayTasks.length
                      ? dayTasks.map((task) => `<button class="calendar-task" type="button" data-task-id="${escapeAttr(task.id)}">${escapeHtml(task.dueTime ? `${task.dueTime} ${task.title}` : task.title)}</button>`).join("")
                      : `<span class="muted">Нет задач</span>`
                  }
                </div>
              </section>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

function renderCalendarAgendaView() {
  const start = parseISO(isoToday());
  const days = Array.from({ length: 30 }, (_, index) => addDays(start, index));
  const tasks = getFilteredTasks(state.ui.activeFilter).filter((task) => !task.trashed && task.due);
  els.content.innerHTML = `
    <div class="calendar-view">
      <div class="calendar-head">
        <div>
          <h2>Повестка</h2>
          ${calendarModeTabs()}
        </div>
      </div>
      <div class="agenda-list">
        ${days
          .map((date) => {
            const iso = toISO(date);
            const dayTasks = sortTasks(tasks.filter((task) => task.due === iso));
            if (!dayTasks.length) return "";
            return `
              <section class="agenda-day">
                <div class="agenda-date">${formatDateShort(iso)}</div>
                <div class="agenda-tasks">
                  ${dayTasks.map((task) => `<button class="mini-task" type="button" data-task-id="${escapeAttr(task.id)}"><span class="priority-dot p${task.priority}"></span><span>${escapeHtml(task.title)}</span></button>`).join("")}
                </div>
              </section>
            `;
          })
          .join("") || `<div class="empty-small">На ближайшие 30 дней задач нет.</div>`}
      </div>
    </div>
  `;
}

function renderCalendarYearView() {
  const year = parseMonth(state.ui.calendarMonth || isoToday().slice(0, 7)).getFullYear();
  const tasks = getFilteredTasks(state.ui.activeFilter).filter((task) => !task.trashed && task.due?.startsWith(String(year)));
  els.content.innerHTML = `
    <div class="calendar-view">
      <div class="calendar-head">
        <div>
          <h2>${year}</h2>
          ${calendarModeTabs()}
        </div>
        <div class="actions">
          <button class="secondary-btn" type="button" data-action="month-prev">Назад</button>
          <button class="secondary-btn" type="button" data-action="today-month">Сегодня</button>
          <button class="secondary-btn" type="button" data-action="month-next">Вперёд</button>
        </div>
      </div>
      <div class="year-grid">
        ${Array.from({ length: 12 }, (_, monthIndex) => {
          const date = new Date(year, monthIndex, 1);
          const prefix = `${year}-${pad(monthIndex + 1)}`;
          const count = tasks.filter((task) => task.due.startsWith(prefix)).length;
          return `<button class="year-month" type="button" data-action="set-calendar-month" data-value="${prefix}"><strong>${date.toLocaleDateString("ru-RU", { month: "long" })}</strong><span>${count} задач</span></button>`;
        }).join("")}
      </div>
    </div>
  `;
}

function renderTimelineView() {
  const start = parseISO(isoToday());
  const days = Array.from({ length: 14 }, (_, index) => addDays(start, index));
  const tasks = getVisibleTasks().filter((task) => task.due);
  els.content.innerHTML = `
    <div class="timeline-view">
      <div class="timeline-lanes">
        ${days
          .map((date) => {
            const iso = toISO(date);
            const dayTasks = sortTasks(tasks.filter((task) => task.due === iso));
            return `
              <section class="timeline-day">
                <div class="timeline-label">${formatDateShort(iso)}</div>
                <div class="timeline-items">
                  ${
                    dayTasks.length
                      ? dayTasks.map((task) => `<button class="timeline-item" type="button" data-task-id="${escapeAttr(task.id)}">${escapeHtml(task.title)}</button>`).join("")
                      : `<span class="muted">Нет задач</span>`
                  }
                </div>
              </section>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

function renderMatrixView() {
  const tasks = getVisibleTasks().filter((task) => !task.done && !task.trashed);
  const tomorrow = isoAdd(isoToday(), 1);
  const quadrants = [
    {
      id: "do",
      name: "Важно и срочно",
      hint: "Сделать",
      tasks: tasks.filter((task) => task.priority <= 2 && task.due && task.due <= tomorrow),
    },
    {
      id: "plan",
      name: "Важно, не срочно",
      hint: "Запланировать",
      tasks: tasks.filter((task) => task.priority <= 2 && (!task.due || task.due > tomorrow)),
    },
    {
      id: "delegate",
      name: "Срочно, не важно",
      hint: "Делегировать",
      tasks: tasks.filter((task) => task.priority > 2 && task.due && task.due <= tomorrow),
    },
    {
      id: "drop",
      name: "Не срочно и не важно",
      hint: "Отложить",
      tasks: tasks.filter((task) => task.priority > 2 && (!task.due || task.due > tomorrow)),
    },
  ];

  els.content.innerHTML = `
    <div class="matrix-view">
      <div class="matrix-grid">
        ${quadrants
          .map(
            (box) => `
          <section class="matrix-box">
            <div class="matrix-title">
              <span>${box.name}</span>
              <span>${box.hint}</span>
            </div>
            <div class="matrix-body">
              ${
                box.tasks.length
                  ? box.tasks
                      .map(
                        (task) => `
                    <button class="mini-task" type="button" data-task-id="${escapeAttr(task.id)}">
                      <span class="priority-dot p${task.priority}"></span>
                      <span>${escapeHtml(task.title)}</span>
                    </button>
                  `
                      )
                      .join("")
                  : `<div class="empty-small">Пусто</div>`
              }
            </div>
          </section>
        `
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderFocusView() {
  const focus = state.focus;
  const openTasks = sortTasks(state.tasks.filter((task) => !task.done && !task.trashed)).slice(0, 12);
  const selected = getTask(focus.selectedTaskId);
  els.content.innerHTML = `
    <div class="focus-view">
      <div class="focus-layout">
        <section class="focus-card">
          <div class="section-label">Фокус-сессия</div>
          <div class="timer" id="timerDisplay">${formatSeconds(focus.remaining)}</div>
          <div class="focus-actions">
            <button class="primary-btn" type="button" data-action="focus-start">Старт</button>
            <button class="secondary-btn" type="button" data-action="focus-pause">Пауза</button>
            <button class="secondary-btn" type="button" data-action="focus-reset">Сброс</button>
          </div>
          <div class="field" style="margin-top:16px">
            <label>Текущая задача</label>
            <div>${selected ? escapeHtml(selected.title) : "Не выбрана"}</div>
          </div>
          <button class="secondary-btn" type="button" data-action="focus-complete">Завершить сессию</button>
        </section>
        <section class="focus-card">
          <div class="section-label">Выберите задачу</div>
          <div class="task-picker">
            ${openTasks
              .map(
                (task) => `
              <button class="picker-row ${task.id === focus.selectedTaskId ? "active" : ""}" type="button" data-action="select-focus-task" data-task-id="${escapeAttr(task.id)}">
                <span class="priority-dot p${task.priority}"></span>
                <span class="cell-title">${escapeHtml(task.title)}</span>
              </button>
            `
              )
              .join("")}
          </div>
        </section>
      </div>
    </div>
  `;
}

function renderHabitsView() {
  const today = parseISO(isoToday());
  const days = Array.from({ length: 7 }, (_, index) => addDays(today, index - 6));
  els.content.innerHTML = `
    <div class="habits-view">
      <div class="actions" style="justify-content:flex-start;margin-bottom:12px">
        <button class="secondary-btn" type="button" data-action="add-habit">Новая привычка</button>
      </div>
      <div class="habits-grid">
        ${state.habits
          .map(
            (habit) => `
          <article class="habit-card">
            <div class="habit-head">
              <div>
                <div class="habit-name">${escapeHtml(habit.name)}</div>
                <div class="muted">Серия: ${habitStreak(habit)} дн.</div>
              </div>
              <span class="list-dot" style="background:${escapeAttr(habit.color)}"></span>
            </div>
            <div class="habit-days">
              ${days
                .map((date) => {
                  const iso = toISO(date);
                  return `
                    <button class="habit-day ${habit.records[iso] ? "done" : ""}" type="button" data-action="toggle-habit" data-habit-id="${escapeAttr(habit.id)}" data-date="${iso}" title="${formatDateShort(iso)}">
                      ${date.getDate()}
                    </button>
                  `;
                })
                .join("")}
            </div>
          </article>
        `
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderCountdownView() {
  const taskDeadlines = state.tasks
    .filter((task) => !task.trashed && !task.done && task.due)
    .map((task) => ({
      id: `task-${task.id}`,
      taskId: task.id,
      title: task.title,
      date: task.due,
      color: priorityColor(task.priority),
    }));
  const items = [...state.countdowns, ...taskDeadlines].sort((a, b) => a.date.localeCompare(b.date));

  els.content.innerHTML = `
    <div class="countdown-view">
      <div class="actions" style="justify-content:flex-start;margin-bottom:12px">
        <button class="primary-btn" type="button" data-action="add-countdown"><span class="icon icon-plus"></span><span>Событие</span></button>
      </div>
      <div class="countdown-grid">
        ${
          items.length
            ? items
                .map((item) => {
                  const days = daysUntil(item.date);
                  return `
                    <article class="countdown-card" ${item.taskId ? `data-task-id="${escapeAttr(item.taskId)}"` : ""}>
                      <div class="countdown-top">
                        <span class="list-dot" style="background:${escapeAttr(item.color)}"></span>
                        ${
                          item.taskId
                            ? `<span class="pill">Задача</span>`
                            : `<button class="tiny-btn" type="button" data-action="delete-countdown" data-countdown-id="${escapeAttr(item.id)}" aria-label="Удалить">x</button>`
                        }
                      </div>
                      <h3>${escapeHtml(item.title)}</h3>
                      <div class="countdown-days">${days >= 0 ? days : Math.abs(days)}</div>
                      <div class="muted">${days >= 0 ? "дней осталось" : "дней просрочено"} · ${formatDateShort(item.date)}</div>
                    </article>
                  `;
                })
                .join("")
            : `<div class="empty-small">Добавьте важные даты или сроки задач.</div>`
        }
      </div>
    </div>
  `;
}

function renderNotesView() {
  const notes = sortTasks(state.tasks.filter((task) => !task.trashed && task.type === "note" && matchesSearch(task)));
  els.content.innerHTML = `
    <div class="notes-view">
      <div class="actions" style="justify-content:flex-start;margin-bottom:12px">
        <button class="primary-btn" type="button" data-action="create-note"><span class="icon icon-plus"></span><span>Заметка</span></button>
      </div>
      <div class="notes-grid">
        ${
          notes.length
            ? notes
                .map(
                  (note) => `
                <article class="note-card" data-task-id="${escapeAttr(note.id)}">
                  <div class="note-head">
                    <h3>${escapeHtml(note.title)}</h3>
                    <button class="task-menu" type="button" aria-label="Действия"><span class="icon icon-more"></span></button>
                  </div>
                  <div class="note-text">${renderMarkdownPreview(note.notes || "Пустая заметка")}</div>
                  <div class="task-meta">${buildMeta(note)}</div>
                </article>
              `
                )
                .join("")
            : `<div class="empty"><h2>Заметок пока нет</h2><p>Создайте заметку или преобразуйте любую задачу в заметку.</p></div>`
        }
      </div>
    </div>
  `;
}

function renderStatsView() {
  const all = state.tasks.filter((task) => !task.trashed);
  const open = all.filter((task) => !task.done);
  const done = all.filter((task) => task.done);
  const todayDone = done.filter((task) => task.completedAt?.slice(0, 10) === isoToday());
  const focusMinutes = state.focus.sessions.reduce((sum, session) => sum + session.minutes, 0);
  const habitsToday = state.habits.filter((habit) => habit.records[isoToday()]).length;
  const attachments = state.tasks.reduce((sum, task) => sum + (task.attachments?.length || 0), 0);
  const days = Array.from({ length: 7 }, (_, index) => isoAdd(isoToday(), index - 6));
  const max = Math.max(
    1,
    ...days.map((day) => done.filter((task) => task.completedAt?.slice(0, 10) === day).length)
  );

  els.content.innerHTML = `
    <div class="stats-view">
      <div class="stats-grid">
        ${statCard("Открыто", open.length)}
        ${statCard("Выполнено", done.length)}
        ${statCard("Сегодня закрыто", todayDone.length)}
        ${statCard("Фокус, мин", focusMinutes)}
        ${statCard("Привычки сегодня", `${habitsToday}/${state.habits.length}`)}
        ${statCard("Вложения", attachments)}
        ${statCard("Хранение", storageStatus)}
      </div>
      <div class="bar-chart">
        ${days
          .map((day) => {
            const value = done.filter((task) => task.completedAt?.slice(0, 10) === day).length;
            return `<div class="bar" style="height:${Math.max(12, (value / max) * 100)}%" title="${formatDateShort(day)}">${value}</div>`;
          })
          .join("")}
      </div>
    </div>
  `;
}

function statCard(label, value) {
  return `<article class="stat-card"><div class="section-label">${label}</div><div class="stat-value">${value}</div></article>`;
}

function renderEmpty(title, subtitle) {
  els.content.innerHTML = `
    <div class="empty">
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(subtitle)}</p>
      <button class="primary-btn" type="button" data-action="quick-add"><span class="icon icon-plus"></span><span>Добавить задачу</span></button>
    </div>
  `;
}

function renderDetail() {
  const task = getTask(selectedTaskId);
  if (!task) {
    els.detailPanel.classList.remove("open");
    els.detailPanel.setAttribute("aria-hidden", "true");
    els.detailPanel.innerHTML = "";
    return;
  }

  const list = getList(task.listId);
  const sectionOptions = (list?.sections || [])
    .map((section) => `<option value="${escapeAttr(section.id)}" ${section.id === task.sectionId ? "selected" : ""}>${escapeHtml(section.name)}</option>`)
    .join("");

  els.detailPanel.classList.add("open");
  els.detailPanel.setAttribute("aria-hidden", "false");
  els.detailPanel.innerHTML = `
    <div class="detail-head">
      <button class="check ${task.done ? "done" : ""}" type="button" data-detail-action="toggle-done" aria-label="Выполнить задачу"></button>
      <input type="text" data-field="title" value="${escapeAttr(task.title)}" aria-label="Название задачи" />
      <button class="icon-btn" type="button" data-detail-action="close" aria-label="Закрыть"><span class="icon icon-more"></span></button>
    </div>
    <div class="detail-body">
      <div class="field-row">
        <div class="field">
          <label>Список</label>
          <select data-field="listId">
            ${state.lists.map((item) => `<option value="${escapeAttr(item.id)}" ${item.id === task.listId ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>Колонка</label>
          <select data-field="sectionId">${sectionOptions}</select>
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Начало</label>
          <input type="date" data-field="start" value="${escapeAttr(task.start || "")}" />
        </div>
        <div class="field">
          <label>Срок</label>
          <input type="date" data-field="due" value="${escapeAttr(task.due || "")}" />
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Время начала</label>
          <input type="time" data-field="startTime" value="${escapeAttr(task.startTime || "")}" />
        </div>
        <div class="field">
          <label>Время срока</label>
          <input type="time" data-field="dueTime" value="${escapeAttr(task.dueTime || "")}" />
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Приоритет</label>
          <select data-field="priority">
            <option value="1" ${task.priority === 1 ? "selected" : ""}>Высокий</option>
            <option value="2" ${task.priority === 2 ? "selected" : ""}>Средний</option>
            <option value="3" ${task.priority === 3 ? "selected" : ""}>Низкий</option>
            <option value="4" ${task.priority === 4 ? "selected" : ""}>Нет</option>
          </select>
        </div>
        <div class="field">
          <label>Длительность, мин</label>
          <input type="number" min="5" step="5" data-field="duration" value="${escapeAttr(task.duration || task.estimate)}" />
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Повтор</label>
          <select data-field="repeat">
            <option value="none" ${task.repeat === "none" ? "selected" : ""}>Нет</option>
            <option value="daily" ${task.repeat === "daily" ? "selected" : ""}>Каждый день</option>
            <option value="weekly" ${task.repeat === "weekly" ? "selected" : ""}>Каждую неделю</option>
            <option value="monthly" ${task.repeat === "monthly" ? "selected" : ""}>Каждый месяц</option>
          </select>
        </div>
        <div class="field">
          <label>Ответственный</label>
          <select data-field="assigneeId">
            <option value="">Не назначено</option>
            ${state.people.map((person) => `<option value="${escapeAttr(person.id)}" ${person.id === task.assigneeId ? "selected" : ""}>${escapeHtml(person.name)}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="field">
        <label>Напоминания через запятую</label>
        <input type="text" data-field="remindersText" value="${escapeAttr((task.reminders || []).join(", "))}" placeholder="09:00, 2026-05-10 18:30" />
      </div>
      <div class="field-row">
        <label class="toggle-row"><input type="checkbox" data-field="constantReminder" ${task.constantReminder ? "checked" : ""} /> Постоянное напоминание</label>
        <label class="toggle-row"><input type="checkbox" data-field="emailReminder" ${task.emailReminder ? "checked" : ""} /> Email-напоминание</label>
      </div>
      <div class="field">
        <label>Локация</label>
        <input type="text" data-field="location" value="${escapeAttr(task.location || "")}" placeholder="Например: офис, дом, магазин" />
      </div>
      <div class="field">
        <label>Метки через запятую</label>
        <input type="text" data-field="tagsText" value="${escapeAttr(task.tags.map((tagId) => getTag(tagId)?.name || tagId).join(", "))}" />
      </div>
      <div class="field">
        <div class="section-label">Подзадачи</div>
        <div class="subtasks">
          ${task.subtasks
            .map(
              (subtask) => `
            <div class="subtask-row">
              <input type="checkbox" data-subtask-id="${escapeAttr(subtask.id)}" ${subtask.done ? "checked" : ""} aria-label="Выполнить подзадачу" />
              <input type="text" data-subtask-title="${escapeAttr(subtask.id)}" value="${escapeAttr(subtask.title)}" />
              <button class="tiny-btn" type="button" data-detail-action="delete-subtask" data-subtask-id="${escapeAttr(subtask.id)}" aria-label="Удалить подзадачу">x</button>
            </div>
          `
            )
            .join("")}
        </div>
        <button class="secondary-btn" type="button" data-detail-action="add-subtask"><span class="icon icon-plus"></span><span>Подзадача</span></button>
      </div>
      <div class="field">
        <label>Заметка</label>
        <textarea id="detailNotes" data-field="notes" placeholder="Описание, чеклист, ссылка или заметка">${escapeHtml(task.notes || "")}</textarea>
      </div>
      <div class="field">
        <div class="section-label">Вложения</div>
        <div class="attachments">
          ${(task.attachments || [])
            .map(
              (file) => `
            <div class="attachment-row">
              <a href="${escapeAttr(file.data)}" download="${escapeAttr(file.name)}">${escapeHtml(file.name)}</a>
              <span>${formatBytes(file.size || 0)}</span>
              <button class="tiny-btn" type="button" data-detail-action="delete-attachment" data-attachment-id="${escapeAttr(file.id)}" aria-label="Удалить вложение">x</button>
            </div>
          `
            )
            .join("") || `<div class="muted">Файлов нет</div>`}
        </div>
        <input type="file" multiple data-detail-action="attach-files" aria-label="Добавить вложение" />
      </div>
      <div class="field">
        <div class="section-label">Комментарии</div>
        <div class="comments">
          ${(task.comments || [])
            .map((comment) => `<div class="comment"><strong>${escapeHtml(comment.author || "Вы")}</strong><span>${formatDateTime(comment.at)}</span><p>${escapeHtml(comment.text)}</p></div>`)
            .join("") || `<div class="muted">Комментариев нет</div>`}
        </div>
        <div class="comment-input">
          <input type="text" id="commentInput" placeholder="Добавить комментарий" />
          <button class="secondary-btn" type="button" data-detail-action="add-comment">Добавить</button>
        </div>
      </div>
      <div class="field">
        <div class="section-label">История</div>
        <div class="activity-list">
          ${state.history
            .filter((item) => item.taskId === task.id)
            .slice(0, 8)
            .map((item) => `<div class="activity-row"><span>${escapeHtml(item.message)}</span><time>${formatDateTime(item.at)}</time></div>`)
            .join("") || `<div class="muted">Истории пока нет</div>`}
        </div>
      </div>
    </div>
    <div class="detail-footer">
      <button class="danger-btn" type="button" data-detail-action="delete">Удалить</button>
      <div class="actions">
        <button class="secondary-btn" type="button" data-detail-action="duplicate">Дублировать</button>
        <button class="primary-btn" type="button" data-detail-action="close">Готово</button>
      </div>
    </div>
  `;
}

function createTaskCard(task) {
  const node = els.taskTemplate.content.firstElementChild.cloneNode(true);
  node.dataset.taskId = task.id;
  node.classList.toggle("done", task.done);
  node.classList.toggle("pinned", task.pinned);
  node.classList.toggle("selected", selectedTaskId === task.id);
  $(".task-title", node).textContent = task.title;
  const meta = $(".task-meta", node);
  meta.innerHTML = buildMeta(task);
  return node;
}

function buildMeta(task) {
  const meta = [];
  if (task.priority < 4) meta.push(`<span class="pill priority-${task.priority}">${priorityLabel(task.priority)}</span>`);
  if (task.due) meta.push(`<span class="pill">${escapeHtml(formatDue(task.due))}</span>`);
  if (task.repeat !== "none") meta.push(`<span class="pill">${repeatLabel(task.repeat)}</span>`);
  if (task.reminders?.length) meta.push(`<span class="pill">Нап. ${task.reminders.length}</span>`);
  if (task.assigneeId) meta.push(`<span class="pill">${escapeHtml(getPerson(task.assigneeId)?.name || "Назначено")}</span>`);
  if (task.attachments?.length) meta.push(`<span class="pill">Файлы ${task.attachments.length}</span>`);
  if (task.location) meta.push(`<span class="pill">${escapeHtml(task.location)}</span>`);
  if (task.subtasks.length) {
    const done = task.subtasks.filter((item) => item.done).length;
    meta.push(`<span class="pill">${done}/${task.subtasks.length}</span>`);
  }
  if (task.type === "note") meta.push(`<span class="pill">Заметка</span>`);
  task.tags.slice(0, 2).forEach((tagId) => {
    const tag = getTag(tagId);
    if (tag) meta.push(`<span class="pill" style="color:${escapeAttr(tag.color)}">#${escapeHtml(tag.name)}</span>`);
  });
  return meta.join("");
}

function getBoardColumns() {
  const activeList = getActiveList();
  if (activeList) {
    return {
      smart: false,
      columns: activeList.sections.map((section) => ({ ...section, listId: activeList.id })),
    };
  }
  const today = isoToday();
  const tomorrow = isoAdd(today, 1);
  return {
    smart: true,
    columns: [
      { id: "overdue", name: "Просрочено", match: (task) => task.due && task.due < today },
      { id: "today", name: "Сегодня", match: (task) => task.due === today },
      { id: "soon", name: "Ближайшие", match: (task) => task.due && task.due > today && task.due <= isoAdd(today, 7) },
      { id: "later", name: "Позже", match: (task) => task.due && task.due > isoAdd(today, 7) },
      { id: "none", name: "Без даты", match: (task) => !task.due && !task.done },
      { id: "done", name: "Выполнено", match: (task) => task.done },
    ],
  };
}

function getActiveMeta() {
  if (state.ui.activeView === "focus") return { title: "Фокус", subtitle: "Таймер, выбранная задача и история сессий" };
  if (state.ui.activeView === "habits") return { title: "Привычки", subtitle: "Ежедневные отметки и серии" };
  if (state.ui.activeView === "countdown") return { title: "Обратный отсчёт", subtitle: "Важные даты, дедлайны и релизы" };
  if (state.ui.activeView === "notes") return { title: "Заметки", subtitle: "Задачи-заметки, Markdown и прикреплённые материалы" };
  if (state.ui.activeView === "stats") return { title: "Статистика", subtitle: "Задачи, фокус и привычки" };
  if (state.ui.activeView === "calendar") return { title: "Календарь", subtitle: "Задачи по датам" };
  if (state.ui.activeView === "matrix") return { title: "Матрица", subtitle: "Важно, срочно, планировать и отложить" };
  if (state.ui.activeView === "timeline") return { title: "Таймлайн", subtitle: "План на ближайшие дни" };

  const filter = state.ui.activeFilter;
  if (filter.startsWith("list:")) {
    const list = getList(filter.slice(5));
    const count = list ? state.tasks.filter((task) => !task.trashed && !task.done && task.listId === list.id).length : 0;
    return { title: list?.name || "Список", subtitle: `${count} открытых задач · ${syncLabel()}` };
  }
  if (filter.startsWith("tag:")) {
    const tag = getTag(filter.slice(4));
    return { title: `#${tag?.name || "метка"}`, subtitle: "Задачи с выбранной меткой" };
  }
  if (filter.startsWith("filter:")) {
    const custom = state.filters.find((item) => item.id === filter.slice(7));
    return { title: custom?.name || "Фильтр", subtitle: "Пользовательский фильтр" };
  }
  const names = {
    "smart:today": ["Сегодня", "Просроченные и сегодняшние задачи"],
    "smart:next7": ["Следующие 7 дней", "Ближайшие задачи"],
    "smart:inbox": ["Входящие", "Задачи без сортировки"],
    "smart:all": ["Все задачи", "Все открытые задачи"],
    "smart:completed": ["Выполнено", "Закрытые задачи"],
    "smart:trash": ["Корзина", "Удалённые задачи"],
  };
  const item = names[filter] || names["smart:all"];
  return { title: item[0], subtitle: item[1] };
}

function syncLabel() {
  return apiStatus === "online" ? `сервер: ${storageStatus}` : `офлайн: ${storageStatus}`;
}

function getVisibleTasks() {
  return sortTasks(getFilteredTasks(state.ui.activeFilter).filter((task) => matchesSearch(task)));
}

function getFilteredTasks(filterValue) {
  const filter = normalizeFilter(filterValue || state.ui.activeFilter);
  const today = isoToday();
  const next7 = isoAdd(today, 7);
  return state.tasks.filter((task) => {
    if (filter === "smart:trash") return task.trashed;
    if (task.trashed) return false;
    if (filter === "smart:completed") return task.done;
    if (filter !== "smart:completed" && task.done) return false;
    if (filter === "smart:today") return task.due && task.due <= today;
    if (filter === "smart:next7") return task.due && task.due >= today && task.due <= next7;
    if (filter === "smart:inbox") return task.listId === "inbox";
    if (filter === "smart:all") return true;
    if (filter.startsWith("list:")) return task.listId === filter.slice(5);
    if (filter.startsWith("tag:")) return task.tags.includes(filter.slice(4));
    if (filter.startsWith("filter:")) return matchesCustomFilter(task, filter.slice(7));
    return true;
  });
}

function matchesCustomFilter(task, filterId) {
  const custom = state.filters.find((item) => item.id === filterId);
  if (!custom) return false;
  if (custom.mode === "priority") return task.priority === Number(custom.value);
  if (custom.mode === "overdue") return task.due && task.due < isoToday() && !task.done;
  if (custom.mode === "type") return task.type === custom.value;
  if (custom.mode === "tag") return task.tags.includes(custom.value);
  return false;
}

function matchesSearch(task) {
  const query = (state.ui.search || "").trim().toLowerCase();
  if (!query) return true;
  const listName = getList(task.listId)?.name || "";
  const tagNames = task.tags.map((tagId) => getTag(tagId)?.name || tagId).join(" ");
  return [task.title, task.notes, listName, tagNames].join(" ").toLowerCase().includes(query);
}

function sortTasks(tasks) {
  const copy = [...tasks];
  const mode = state.settings.sort;
  copy.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (mode === "priority" && a.priority !== b.priority) return a.priority - b.priority;
    if (mode === "due" && a.due !== b.due) return (a.due || "9999-12-31").localeCompare(b.due || "9999-12-31");
    if (mode === "title") return a.title.localeCompare(b.title, "ru");
    return (a.order || 0) - (b.order || 0);
  });
  return copy;
}

function getCounts() {
  const today = isoToday();
  const next7 = isoAdd(today, 7);
  return {
    today: state.tasks.filter((task) => !task.trashed && !task.done && task.due && task.due <= today).length,
    next7: state.tasks.filter((task) => !task.trashed && !task.done && task.due && task.due >= today && task.due <= next7).length,
    inbox: state.tasks.filter((task) => !task.trashed && !task.done && task.listId === "inbox").length,
    all: state.tasks.filter((task) => !task.trashed && !task.done).length,
    completed: state.tasks.filter((task) => !task.trashed && task.done).length,
    trash: state.tasks.filter((task) => task.trashed).length,
  };
}

function normalizeFilter(value) {
  if (!value) return "smart:all";
  if (value.includes(":")) return value;
  const map = {
    today: "smart:today",
    next7: "smart:next7",
    inbox: "smart:inbox",
    all: "smart:all",
    completed: "smart:completed",
    trash: "smart:trash",
  };
  return map[value] || value;
}

function setActiveFilter(value) {
  state.ui.activeFilter = normalizeFilter(value);
  if (["focus", "habits", "countdown", "notes", "stats", "calendar", "matrix"].includes(state.ui.activeView)) {
    state.ui.activeView = "board";
  }
  saveState();
  render();
}

function setView(view) {
  state.ui.activeView = view;
  saveState();
  render();
}

function openQuickAdd() {
  els.quickAdd.classList.add("open");
  els.quickAddInput.focus();
}

function submitQuickAdd() {
  const value = els.quickAddInput.value.trim();
  if (!value) return;
  createTaskFromText(value);
  els.quickAddInput.value = "";
  els.quickAdd.classList.remove("open");
}

function createTaskFromText(text, options = {}) {
  const parsed = parseQuickText(text);
  const activeList = getActiveList();
  const listId = options.listId || parsed.listId || activeList?.id || "inbox";
  const sectionId = options.sectionId || firstSectionId(listId) || "inbox-main";
  const task = {
    id: uid("task"),
    title: parsed.title || "Новая задача",
    listId,
    sectionId,
    done: false,
    trashed: false,
    pinned: false,
    wontDo: false,
    priority: parsed.priority,
    due: parsed.due,
    start: "",
    startTime: "",
    dueTime: "",
    repeat: parsed.repeat,
    reminder: "",
    reminders: [],
    constantReminder: false,
    emailReminder: false,
    location: "",
    tags: parsed.tags,
    subtasks: [],
    comments: [],
    attachments: [],
    notes: "",
    estimate: 25,
    duration: 25,
    type: "task",
    parentId: "",
    assigneeId: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: "",
    order: nextOrder(),
  };
  state.tasks.push(task);
  logActivity(task.id, "create", "Задача создана");
  saveState();
  render();
  openTask(task.id);
  toast("Задача добавлена");
}

function parseQuickText(text) {
  let title = text.trim();
  let due = "";
  let priority = 4;
  let repeat = "none";
  const tags = [];
  const today = isoToday();

  const priorityMatch = title.match(/\bp([1-4])\b/i);
  if (priorityMatch) {
    priority = Number(priorityMatch[1]);
    title = title.replace(priorityMatch[0], "");
  }

  if (/кажд(ый|ую)\s+день/i.test(title)) {
    repeat = "daily";
    title = title.replace(/кажд(ый|ую)\s+день/gi, "");
  } else if (/кажд(ую|ая)\s+недел/i.test(title)) {
    repeat = "weekly";
    title = title.replace(/кажд(ую|ая)\s+недел[юя]/gi, "");
  }

  const isoMatch = title.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (isoMatch) {
    due = isoMatch[1];
    title = title.replace(isoMatch[0], "");
  } else if (/послезавтра/i.test(title)) {
    due = isoAdd(today, 2);
    title = title.replace(/послезавтра/gi, "");
  } else if (/завтра/i.test(title)) {
    due = isoAdd(today, 1);
    title = title.replace(/завтра/gi, "");
  } else if (/сегодня/i.test(title)) {
    due = today;
    title = title.replace(/сегодня/gi, "");
  }

  title = title.replace(/#([A-Za-zА-Яа-я0-9_-]+)/g, (_, name) => {
    const tag = ensureTag(name);
    tags.push(tag.id);
    return "";
  });

  let listId = "";
  title = title.replace(/@([A-Za-zА-Яа-я0-9_-]+)/g, (_, name) => {
    const list = state.lists.find((item) => normalizeName(item.name) === normalizeName(name));
    if (list) listId = list.id;
    return "";
  });

  return {
    title: title.replace(/\s+/g, " ").trim(),
    due,
    priority,
    repeat,
    tags: unique(tags),
    listId,
  };
}

function openTask(id) {
  const task = getTask(id);
  if (!task) return;
  selectedTaskId = id;
  location.hash = `task=${encodeURIComponent(id)}`;
  renderDetail();
  highlightSelectedCards();
}

function closeDetail() {
  selectedTaskId = null;
  if (location.hash.startsWith("#task=")) history.replaceState(null, "", location.pathname + location.search);
  renderDetail();
  highlightSelectedCards();
}

function restoreHashSelection() {
  const match = location.hash.match(/^#task=(.+)$/);
  if (match) {
    const id = decodeURIComponent(match[1]);
    if (getTask(id)) {
      selectedTaskId = id;
      renderDetail();
      highlightSelectedCards();
    }
  }
}

function highlightSelectedCards() {
  $$(".task-card, .mini-task, .calendar-task, .timeline-item").forEach((node) => {
    node.classList.toggle("selected", node.dataset.taskId === selectedTaskId);
  });
}

function toggleDone(id) {
  const task = getTask(id);
  if (!task) return;
  if (!task.done && task.repeat !== "none") {
    task.completedAt = new Date().toISOString();
    task.due = nextRepeatDate(task);
    task.subtasks.forEach((subtask) => (subtask.done = false));
    task.updatedAt = new Date().toISOString();
    logActivity(task.id, "repeat", "Повтор перенесён");
    toast("Повтор перенесён на следующую дату");
  } else {
    task.done = !task.done;
    task.completedAt = task.done ? new Date().toISOString() : "";
    task.updatedAt = new Date().toISOString();
    logActivity(task.id, "done", task.done ? "Задача выполнена" : "Задача снова открыта");
  }
  saveState();
  render();
}

function updateTask(id, patch, rerender = true) {
  const task = getTask(id);
  if (!task) return;
  Object.assign(task, patch, { updatedAt: new Date().toISOString() });
  saveState();
  if (rerender) render();
}

function trashTask(id) {
  updateTask(id, { trashed: true }, false);
  logActivity(id, "trash", "Задача перемещена в корзину");
  saveState();
  closeContextMenu();
  if (selectedTaskId === id) closeDetail();
  render();
  toast("Задача перемещена в корзину");
}

function hardDeleteTask(id) {
  state.tasks = state.tasks.filter((task) => task.id !== id);
  if (selectedTaskId === id) selectedTaskId = null;
  saveState();
  closeContextMenu();
  render();
  toast("Задача удалена");
}

function duplicateTask(id) {
  const task = getTask(id);
  if (!task) return;
  const clone = {
    ...structuredClone(task),
    id: uid("task"),
    title: `${task.title} - копия`,
    done: false,
    completedAt: "",
    trashed: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    order: nextOrder(),
  };
  clone.subtasks = clone.subtasks.map((subtask) => ({ ...subtask, id: uid("sub") }));
  state.tasks.push(clone);
  logActivity(clone.id, "duplicate", "Задача создана дублированием");
  saveState();
  closeContextMenu();
  render();
  openTask(clone.id);
  toast("Задача дублирована");
}

function togglePin(id) {
  const task = getTask(id);
  if (!task) return;
  updateTask(id, { pinned: !task.pinned });
  closeContextMenu();
}

function markWontDo(id) {
  const task = getTask(id);
  if (!task) return;
  updateTask(id, { wontDo: true, done: true, completedAt: new Date().toISOString() });
  closeContextMenu();
}

function toggleNote(id) {
  const task = getTask(id);
  if (!task) return;
  updateTask(id, { type: task.type === "note" ? "task" : "note" });
  closeContextMenu();
}

function setTaskDate(id, value) {
  const today = isoToday();
  const map = {
    today,
    tomorrow: isoAdd(today, 1),
    week: isoAdd(today, 7),
    none: "",
  };
  updateTask(id, { due: map[value] ?? value });
  closeContextMenu();
}

function copyTaskLink(id) {
  const link = `${location.href.split("#")[0]}#task=${encodeURIComponent(id)}`;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(link).then(() => toast("Ссылка скопирована")).catch(() => prompt("Ссылка на задачу", link));
  } else {
    prompt("Ссылка на задачу", link);
  }
  closeContextMenu();
}

function showTaskMenu(taskId, anchor, usePoint = false) {
  const task = getTask(taskId);
  if (!task) return;
  activeMenuTaskId = taskId;
  const rect = anchor.getBoundingClientRect();
  els.contextMenu.innerHTML = `
    <div class="menu-label">Дата</div>
    <div class="menu-row">
      <button class="menu-icon-btn" type="button" data-action="set-date" data-task-id="${escapeAttr(taskId)}" data-value="today" title="Сегодня">С</button>
      <button class="menu-icon-btn" type="button" data-action="set-date" data-task-id="${escapeAttr(taskId)}" data-value="tomorrow" title="Завтра">З</button>
      <button class="menu-icon-btn" type="button" data-action="set-date" data-task-id="${escapeAttr(taskId)}" data-value="week" title="Через неделю">7</button>
      <button class="menu-icon-btn ${!task.due ? "active" : ""}" type="button" data-action="set-date" data-task-id="${escapeAttr(taskId)}" data-value="none" title="Без даты">-</button>
    </div>
    <div class="menu-label">Приоритет</div>
    <div class="menu-row">
      <button class="menu-swatch" type="button" data-action="set-priority" data-task-id="${escapeAttr(taskId)}" data-value="1" title="Высокий"><span class="flag p1"></span></button>
      <button class="menu-swatch" type="button" data-action="set-priority" data-task-id="${escapeAttr(taskId)}" data-value="2" title="Средний"><span class="flag p2"></span></button>
      <button class="menu-swatch" type="button" data-action="set-priority" data-task-id="${escapeAttr(taskId)}" data-value="3" title="Низкий"><span class="flag p3"></span></button>
      <button class="menu-swatch" type="button" data-action="set-priority" data-task-id="${escapeAttr(taskId)}" data-value="4" title="Нет"><span class="flag p4"></span></button>
    </div>
    ${menuItem("add-subtask", "Добавить подзадачу", "icon-list", taskId)}
    ${menuItem("link-parent", "Связать родительскую задачу", "icon-target", taskId)}
    ${menuItem("pin", task.pinned ? "Открепить" : "Закрепить", "icon-sync", taskId)}
    ${menuItem("wont-do", "Не буду делать", "icon-done", taskId)}
    ${menuItem("move-task", "Переместить в", "icon-inbox", taskId)}
    ${menuItem("labels", "Метки", "icon-search", taskId)}
    <div class="menu-sep"></div>
    ${menuItem("focus-task", "Сфокусируйся", "icon-target", taskId)}
    <div class="menu-sep"></div>
    ${menuItem("duplicate", "Дублировать", "icon-repeat", taskId)}
    ${menuItem("copy-link", "Копировать ссылку", "icon-sync", taskId)}
    ${menuItem("open-note", "Открыть как заметку на экране", "icon-list", taskId)}
    ${menuItem("convert-note", task.type === "note" ? "Преобразовать в задачу" : "Преобразовать в заметку", "icon-list", taskId)}
    <div class="menu-sep"></div>
    ${
      task.trashed
        ? `${menuItem("restore-task", "Восстановить", "icon-sync", taskId)}${menuItem("hard-delete", "Удалить навсегда", "icon-trash", taskId, true)}`
        : menuItem("delete-task", "Удалить", "icon-trash", taskId, true)
    }
  `;
  positionContextMenu(rect, usePoint);
}

function menuItem(action, label, icon, taskId, danger = false) {
  return `
    <button class="menu-item ${danger ? "danger" : ""}" type="button" data-action="${action}" data-task-id="${escapeAttr(taskId)}">
      <span class="icon ${icon}"></span>
      <span>${escapeHtml(label)}</span>
      <span></span>
    </button>
  `;
}

function positionContextMenu(rect, usePoint) {
  els.contextMenu.classList.add("open");
  els.contextMenu.setAttribute("aria-hidden", "false");
  const menuRect = els.contextMenu.getBoundingClientRect();
  const x = usePoint ? rect.left : rect.right - menuRect.width;
  const y = usePoint ? rect.bottom : rect.bottom + 6;
  const left = Math.max(8, Math.min(window.innerWidth - menuRect.width - 8, x));
  const top = Math.max(8, Math.min(window.innerHeight - menuRect.height - 8, y));
  els.contextMenu.style.left = `${left}px`;
  els.contextMenu.style.top = `${top}px`;
}

function closeContextMenu() {
  activeMenuTaskId = null;
  els.contextMenu.onclick = null;
  els.contextMenu.classList.remove("open");
  els.contextMenu.setAttribute("aria-hidden", "true");
}

function openSortMenu(anchor) {
  activeMenuTaskId = null;
  const rect = anchor.getBoundingClientRect();
  els.contextMenu.innerHTML = `
    <div class="menu-label">Сортировка</div>
    ${["manual", "due", "priority", "title"]
      .map((mode) => {
        const labels = { manual: "Вручную", due: "По дате", priority: "По приоритету", title: "По названию" };
        return `<button class="menu-item" type="button" data-sort-mode="${mode}"><span></span><span>${labels[mode]}</span><span>${state.settings.sort === mode ? "✓" : ""}</span></button>`;
      })
      .join("")}
  `;
  els.contextMenu.onclick = (event) => {
    const btn = event.target.closest("[data-sort-mode]");
    if (!btn) return;
    state.settings.sort = btn.dataset.sortMode;
    saveState();
    closeContextMenu();
    els.contextMenu.onclick = null;
    render();
  };
  positionContextMenu(rect);
}

function openMoreMenu(anchor) {
  const rect = anchor.getBoundingClientRect();
  els.contextMenu.innerHTML = `
    <div class="menu-label">Действия</div>
    <button class="menu-item" type="button" data-action="add-column"><span class="icon icon-plus"></span><span>Добавить колонку</span><span></span></button>
    <button class="menu-item" type="button" data-action="templates"><span class="icon icon-list"></span><span>Шаблоны задач</span><span></span></button>
    <button class="menu-item" type="button" data-action="theme"><span class="icon icon-settings"></span><span>Сменить тему</span><span></span></button>
    <button class="menu-item" type="button" data-action="export"><span class="icon icon-sync"></span><span>Экспорт JSON</span><span></span></button>
    <button class="menu-item" type="button" data-action="settings"><span class="icon icon-settings"></span><span>Настройки</span><span></span></button>
  `;
  positionContextMenu(rect);
}

function handleDragStart(event) {
  const card = event.target.closest(".task-card");
  if (!card?.dataset.taskId) return;
  draggedTaskId = card.dataset.taskId;
  card.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", draggedTaskId);
}

function handleDragEnd(event) {
  event.target.closest(".task-card")?.classList.remove("dragging");
  $$(".column-body.drag-over").forEach((node) => node.classList.remove("drag-over"));
  draggedTaskId = null;
}

function handleDragOver(event) {
  const body = event.target.closest(".column-body");
  if (!body || !draggedTaskId) return;
  event.preventDefault();
  body.classList.add("drag-over");
}

function handleDragLeave(event) {
  const body = event.target.closest(".column-body");
  if (body && !body.contains(event.relatedTarget)) body.classList.remove("drag-over");
}

function handleDrop(event) {
  const body = event.target.closest(".column-body");
  if (!body || !draggedTaskId) return;
  event.preventDefault();
  body.classList.remove("drag-over");
  const task = getTask(draggedTaskId);
  if (!task) return;
  if (body.dataset.listId) {
    task.listId = body.dataset.listId;
    task.sectionId = body.dataset.sectionId;
  }
  if (body.dataset.smart) {
    applySmartDrop(task, body.dataset.smart);
  }
  task.order = nextOrder();
  task.updatedAt = new Date().toISOString();
  saveState();
  render();
}

function applySmartDrop(task, section) {
  const today = isoToday();
  if (section === "today") task.due = today;
  if (section === "soon") task.due = isoAdd(today, 2);
  if (section === "later") task.due = isoAdd(today, 10);
  if (section === "none") task.due = "";
  if (section === "done") {
    task.done = true;
    task.completedAt = new Date().toISOString();
  }
}

function handleDetailInput(event) {
  const task = getTask(selectedTaskId);
  if (!task) return;
  const field = event.target.dataset.field;
  const subtaskTitle = event.target.dataset.subtaskTitle;
  if (subtaskTitle) {
    const subtask = task.subtasks.find((item) => item.id === subtaskTitle);
    if (subtask) {
      subtask.title = event.target.value;
      task.updatedAt = new Date().toISOString();
      saveState();
    }
    return;
  }
  if (!field) return;
  if (field === "title" || field === "notes") {
    task[field] = event.target.value;
    task.updatedAt = new Date().toISOString();
    saveState();
    updateVisibleTaskTitle(task);
  }
}

async function handleDetailChange(event) {
  const task = getTask(selectedTaskId);
  if (!task) return;
  if (event.target.dataset.detailAction === "attach-files") {
    await addAttachments(task, event.target.files);
    event.target.value = "";
    return;
  }
  const field = event.target.dataset.field;
  const subtaskId = event.target.dataset.subtaskId;
  if (subtaskId) {
    const subtask = task.subtasks.find((item) => item.id === subtaskId);
    if (subtask) subtask.done = event.target.checked;
    task.updatedAt = new Date().toISOString();
    saveState();
    render();
    return;
  }
  if (!field) return;
  if (field === "listId") {
    task.listId = event.target.value;
    task.sectionId = firstSectionId(task.listId);
  } else if (field === "tagsText") {
    task.tags = parseTagsInput(event.target.value);
  } else if (field === "remindersText") {
    task.reminders = event.target.value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    task.reminder = task.reminders[0] || "";
  } else if (field === "constantReminder" || field === "emailReminder") {
    task[field] = event.target.checked;
  } else if (field === "priority" || field === "estimate" || field === "duration") {
    task[field] = Number(event.target.value);
    if (field === "duration") task.estimate = task.duration;
  } else {
    task[field] = event.target.value;
  }
  task.updatedAt = new Date().toISOString();
  saveState();
  render();
}

function handleDetailClick(event) {
  const btn = event.target.closest("[data-detail-action]");
  if (!btn) return;
  const action = btn.dataset.detailAction;
  const task = getTask(selectedTaskId);
  if (!task && action !== "close") return;
  if (action === "close") closeDetail();
  if (action === "toggle-done") toggleDone(task.id);
  if (action === "add-subtask") {
    task.subtasks.push({ id: uid("sub"), title: "Новая подзадача", done: false });
    task.updatedAt = new Date().toISOString();
    saveState();
    render();
  }
  if (action === "delete-subtask") {
    task.subtasks = task.subtasks.filter((item) => item.id !== btn.dataset.subtaskId);
    task.updatedAt = new Date().toISOString();
    saveState();
    render();
  }
  if (action === "delete-attachment") {
    task.attachments = task.attachments.filter((item) => item.id !== btn.dataset.attachmentId);
    logActivity(task.id, "attachment", "Вложение удалено");
    task.updatedAt = new Date().toISOString();
    saveState();
    render();
  }
  if (action === "add-comment") {
    const input = $("#commentInput", els.detailPanel);
    const text = input?.value.trim();
    if (!text) return;
    task.comments.push({ id: uid("comment"), author: "Вы", text, at: new Date().toISOString() });
    logActivity(task.id, "comment", "Добавлен комментарий");
    task.updatedAt = new Date().toISOString();
    saveState();
    render();
  }
  if (action === "delete") trashTask(task.id);
  if (action === "duplicate") duplicateTask(task.id);
}

function updateVisibleTaskTitle(task) {
  $$(`[data-task-id="${cssEscape(task.id)}"] .task-title, [data-task-id="${cssEscape(task.id)}"] .cell-title`).forEach((node) => {
    node.textContent = task.title;
  });
}

async function addAttachments(task, fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  const maxFileSize = 4 * 1024 * 1024;
  const accepted = files.filter((file) => file.size <= maxFileSize);
  const skipped = files.length - accepted.length;
  const attachments = await Promise.all(
    accepted.map(async (file) => ({
      id: uid("file"),
      name: file.name,
      type: file.type,
      size: file.size,
      data: await readFileDataURL(file),
      createdAt: new Date().toISOString(),
    }))
  );
  task.attachments.push(...attachments);
  logActivity(task.id, "attachment", `Добавлено вложений: ${attachments.length}`);
  task.updatedAt = new Date().toISOString();
  saveState();
  render();
  if (skipped) toast(`Пропущено файлов больше 4 МБ: ${skipped}`);
}

function readFileDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function promptText(title, label, value, onSubmit) {
  openModal(
    title,
    `
      <form id="promptForm" class="field">
        <label>${escapeHtml(label)}</label>
        <input id="promptValue" type="text" value="${escapeAttr(value)}" autocomplete="off" />
      </form>
    `,
    `
      <button class="secondary-btn" type="button" data-modal-close>Отмена</button>
      <button class="primary-btn" type="submit" form="promptForm">Готово</button>
    `
  );
  const input = $("#promptValue");
  input.focus();
  input.select();
  $("#promptForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const next = input.value.trim();
    if (!next) return;
    closeModal();
    onSubmit(next);
  });
}

function promptCountdown() {
  openModal(
    "Новое событие",
    `
      <form id="countdownForm">
        <div class="field">
          <label>Название</label>
          <input id="countdownTitle" type="text" value="Новый дедлайн" />
        </div>
        <div class="field">
          <label>Дата</label>
          <input id="countdownDate" type="date" value="${isoAdd(isoToday(), 7)}" />
        </div>
      </form>
    `,
    `
      <button class="secondary-btn" type="button" data-modal-close>Отмена</button>
      <button class="primary-btn" type="submit" form="countdownForm">Создать</button>
    `
  );
  $("#countdownForm").addEventListener("submit", (event) => {
    event.preventDefault();
    state.countdowns.push({
      id: uid("countdown"),
      title: $("#countdownTitle").value.trim() || "Новый дедлайн",
      date: $("#countdownDate").value || isoToday(),
      color: randomColor(),
    });
    saveState();
    closeModal();
    renderContent();
  });
}

function createNote() {
  const activeList = getActiveList();
  const listId = activeList?.id || "inbox";
  const note = {
    id: uid("task"),
    title: "Новая заметка",
    listId,
    sectionId: firstSectionId(listId) || "inbox-main",
    done: false,
    trashed: false,
    pinned: false,
    wontDo: false,
    priority: 4,
    due: "",
    start: "",
    startTime: "",
    dueTime: "",
    repeat: "none",
    reminder: "",
    reminders: [],
    constantReminder: false,
    emailReminder: false,
    location: "",
    tags: [],
    subtasks: [],
    comments: [],
    attachments: [],
    notes: "## Заметка\n\nПишите здесь текст, ссылки и чеклисты.",
    estimate: 25,
    duration: 25,
    type: "note",
    parentId: "",
    assigneeId: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: "",
    order: nextOrder(),
  };
  state.tasks.push(note);
  logActivity(note.id, "create", "Заметка создана");
  saveState();
  render();
  openTask(note.id);
}

function promptFilter() {
  openModal(
    "Создать фильтр",
    `
      <form id="filterForm">
        <div class="field">
          <label>Название</label>
          <input id="filterName" type="text" value="Новый фильтр" />
        </div>
        <div class="field">
          <label>Условие</label>
          <select id="filterMode">
            <option value="priority">Высокий приоритет</option>
            <option value="overdue">Просрочено</option>
            <option value="type">Заметки</option>
          </select>
        </div>
      </form>
    `,
    `
      <button class="secondary-btn" type="button" data-modal-close>Отмена</button>
      <button class="primary-btn" type="submit" form="filterForm">Создать</button>
    `
  );
  $("#filterForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const mode = $("#filterMode").value;
    state.filters.push({
      id: uid("filter"),
      name: $("#filterName").value.trim() || "Новый фильтр",
      mode,
      value: mode === "priority" ? 1 : mode === "type" ? "note" : true,
    });
    saveState();
    closeModal();
    render();
  });
}

function addList(name) {
  const id = uid("list");
  state.lists.push({
    id,
    name,
    color: randomColor(),
    sections: [{ id: uid("section"), name: "Без раздела" }],
  });
  state.ui.activeFilter = `list:${id}`;
  saveState();
  render();
}

function addTag(name) {
  ensureTag(name);
  saveState();
  render();
}

function addColumn() {
  const list = getActiveList();
  if (!list) {
    toast("Колонки доступны внутри списка");
    return;
  }
  promptText("Новая колонка", "Название колонки", "", (value) => {
    list.sections.push({ id: uid("section"), name: value });
    saveState();
    render();
  });
}

function renameColumn(sectionId) {
  const list = getActiveList();
  const section = list?.sections.find((item) => item.id === sectionId);
  if (!section) return;
  promptText("Переименовать колонку", "Название колонки", section.name, (value) => {
    section.name = value;
    saveState();
    render();
  });
}

function deleteColumn(sectionId) {
  const list = getActiveList();
  if (!list || list.sections.length <= 1) return;
  const section = list.sections.find((item) => item.id === sectionId);
  if (!section) return;
  openModal(
    "Удалить колонку",
    `<p>Задачи из колонки «${escapeHtml(section.name)}» будут перемещены в первую колонку списка.</p>`,
    `
      <button class="secondary-btn" type="button" data-modal-close>Отмена</button>
      <button class="danger-btn" type="button" id="confirmDeleteColumn">Удалить</button>
    `
  );
  $("#confirmDeleteColumn").addEventListener("click", () => {
    const fallback = list.sections.find((item) => item.id !== sectionId);
    state.tasks.forEach((task) => {
      if (task.sectionId === sectionId) task.sectionId = fallback.id;
    });
    list.sections = list.sections.filter((item) => item.id !== sectionId);
    saveState();
    closeModal();
    render();
  });
}

function addSubtaskFromMenu(taskId) {
  const task = getTask(taskId);
  if (!task) return;
  task.subtasks.push({ id: uid("sub"), title: "Новая подзадача", done: false });
  task.updatedAt = new Date().toISOString();
  saveState();
  closeContextMenu();
  render();
  openTask(taskId);
}

function promptParent(taskId) {
  const task = getTask(taskId);
  const candidates = state.tasks.filter((item) => item.id !== taskId && !item.trashed);
  openModal(
    "Связать родительскую задачу",
    `
      <form id="parentForm" class="field">
        <label>Родительская задача</label>
        <select id="parentSelect">
          <option value="">Нет</option>
          ${candidates.map((item) => `<option value="${escapeAttr(item.id)}" ${task.parentId === item.id ? "selected" : ""}>${escapeHtml(item.title)}</option>`).join("")}
        </select>
      </form>
    `,
    `
      <button class="secondary-btn" type="button" data-modal-close>Отмена</button>
      <button class="primary-btn" type="submit" form="parentForm">Сохранить</button>
    `
  );
  $("#parentForm").addEventListener("submit", (event) => {
    event.preventDefault();
    task.parentId = $("#parentSelect").value;
    task.updatedAt = new Date().toISOString();
    saveState();
    closeModal();
    closeContextMenu();
    render();
  });
}

function promptMoveTask(taskId) {
  const task = getTask(taskId);
  openModal(
    "Переместить задачу",
    `
      <form id="moveForm">
        <div class="field">
          <label>Список</label>
          <select id="moveList">
            ${state.lists.map((list) => `<option value="${escapeAttr(list.id)}" ${list.id === task.listId ? "selected" : ""}>${escapeHtml(list.name)}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>Колонка</label>
          <select id="moveSection"></select>
        </div>
      </form>
    `,
    `
      <button class="secondary-btn" type="button" data-modal-close>Отмена</button>
      <button class="primary-btn" type="submit" form="moveForm">Переместить</button>
    `
  );
  const listSelect = $("#moveList");
  const sectionSelect = $("#moveSection");
  const syncSections = () => {
    const list = getList(listSelect.value);
    sectionSelect.innerHTML = (list?.sections || [])
      .map((section) => `<option value="${escapeAttr(section.id)}" ${section.id === task.sectionId ? "selected" : ""}>${escapeHtml(section.name)}</option>`)
      .join("");
  };
  listSelect.addEventListener("change", syncSections);
  syncSections();
  $("#moveForm").addEventListener("submit", (event) => {
    event.preventDefault();
    task.listId = listSelect.value;
    task.sectionId = sectionSelect.value || firstSectionId(task.listId);
    task.updatedAt = new Date().toISOString();
    saveState();
    closeModal();
    closeContextMenu();
    render();
  });
}

function promptTaskTags(taskId) {
  const task = getTask(taskId);
  openModal(
    "Метки задачи",
    `
      <form id="tagsForm" class="field">
        <label>Метки через запятую</label>
        <input id="tagsValue" type="text" value="${escapeAttr(task.tags.map((tagId) => getTag(tagId)?.name || tagId).join(", "))}" />
      </form>
    `,
    `
      <button class="secondary-btn" type="button" data-modal-close>Отмена</button>
      <button class="primary-btn" type="submit" form="tagsForm">Сохранить</button>
    `
  );
  $("#tagsForm").addEventListener("submit", (event) => {
    event.preventDefault();
    task.tags = parseTagsInput($("#tagsValue").value);
    task.updatedAt = new Date().toISOString();
    saveState();
    closeModal();
    closeContextMenu();
    render();
  });
}

function openSettings() {
  closeContextMenu();
  openModal(
    "Настройки",
    `
      <div class="settings-card" style="padding:14px;margin-bottom:12px">
        <div class="field">
          <label>Backend API</label>
          <input id="apiBaseValue" type="text" value="${escapeAttr(API_BASE)}" />
        </div>
        <div class="field">
          <label>User ID</label>
          <input id="userIdValue" type="text" value="${escapeAttr(USER_ID)}" />
        </div>
        <div class="field">
          <label>Статус</label>
          <div>${escapeHtml(syncLabel())}</div>
        </div>
        <div class="field">
          <label>Тема</label>
          <select id="themeSelect">
            <option value="light" ${state.settings.theme === "light" ? "selected" : ""}>Светлая</option>
            <option value="dark" ${state.settings.theme === "dark" ? "selected" : ""}>Тёмная</option>
          </select>
        </div>
        <div class="field">
          <label>Импорт JSON</label>
          <textarea id="importValue" placeholder="Вставьте экспортированный JSON"></textarea>
        </div>
      </div>
    `,
    `
      <button class="secondary-btn" type="button" data-action="export">Экспорт</button>
      <button class="secondary-btn" type="button" data-action="import">Импорт</button>
      <button class="secondary-btn" type="button" id="saveConnectionBtn">Сохранить API</button>
      <button class="secondary-btn" type="button" data-action="enable-notifications">Уведомления</button>
      <button class="danger-btn" type="button" data-action="reset-demo">Сбросить демо</button>
      <button class="primary-btn" type="button" data-modal-close>Закрыть</button>
    `
  );
  $("#themeSelect").addEventListener("change", (event) => {
    state.settings.theme = event.target.value;
    saveState();
    applyTheme();
  });
  $("#saveConnectionBtn").addEventListener("click", () => {
    localStorage.setItem("taskbook.apiBase", $("#apiBaseValue").value.trim() || "/api");
    localStorage.setItem("taskbook.userId", $("#userIdValue").value.trim() || "local-user");
    toast("Настройки API сохранены. Перезагрузите приложение.");
  });
}

function openHelp() {
  openModal(
    "Горячие клавиши",
    `
      <div class="shortcut-list">
        <div class="shortcut-row"><span>Новая задача</span><kbd>N</kbd></div>
        <div class="shortcut-row"><span>Поиск</span><kbd>/</kbd></div>
        <div class="shortcut-row"><span>Закрыть панель или меню</span><kbd>Esc</kbd></div>
        <div class="shortcut-row"><span>Справка</span><kbd>?</kbd></div>
      </div>
    `,
    `<button class="primary-btn" type="button" data-modal-close>Закрыть</button>`
  );
}

function openTemplates() {
  closeContextMenu();
  const templates = [
    {
      id: "daily",
      name: "План дня",
      tasks: ["Разобрать входящие", "Выбрать 3 главные задачи", "Закрыть быстрые дела", "Подвести итог дня"],
    },
    {
      id: "release",
      name: "Релиз",
      tasks: ["Проверить критические сценарии", "Обновить changelog", "Собрать билд", "Проверить установку", "Опубликовать"],
    },
    {
      id: "meeting",
      name: "Встреча",
      tasks: ["Подготовить повестку", "Зафиксировать решения", "Раздать действия", "Отправить итог"],
    },
  ];
  openModal(
    "Шаблоны",
    `
      <div class="template-list">
        ${templates
          .map((tpl) => `<button class="template-card" type="button" data-template-id="${tpl.id}"><strong>${tpl.name}</strong><span>${tpl.tasks.length} задач</span></button>`)
          .join("")}
      </div>
    `,
    `<button class="primary-btn" type="button" data-modal-close>Закрыть</button>`
  );
  $$(".template-card", els.modalRoot).forEach((button) => {
    button.addEventListener("click", () => {
      const tpl = templates.find((item) => item.id === button.dataset.templateId);
      const activeList = getActiveList();
      const listId = activeList?.id || "inbox";
      const sectionId = firstSectionId(listId) || "inbox-main";
      tpl.tasks.forEach((title) => {
        const task = {
          id: uid("task"),
          title,
          listId,
          sectionId,
          done: false,
          trashed: false,
          pinned: false,
          wontDo: false,
          priority: 4,
          due: isoToday(),
          start: "",
          startTime: "",
          dueTime: "",
          repeat: "none",
          reminder: "",
          reminders: [],
          constantReminder: false,
          emailReminder: false,
          location: "",
          tags: [],
          subtasks: [],
          comments: [],
          attachments: [],
          notes: "",
          estimate: 25,
          duration: 25,
          type: "task",
          parentId: "",
          assigneeId: "",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          completedAt: "",
          order: nextOrder(),
        };
        state.tasks.push(task);
        logActivity(task.id, "template", `Создано из шаблона: ${tpl.name}`);
      });
      saveState();
      closeModal();
      render();
      toast(`Шаблон добавлен: ${tpl.name}`);
    });
  });
}

function openModal(title, body, foot) {
  els.modalRoot.classList.add("open");
  els.modalRoot.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="${escapeAttr(title)}">
      <div class="modal-head">
        <h2>${escapeHtml(title)}</h2>
        <button class="icon-btn" type="button" data-modal-close aria-label="Закрыть"><span class="icon icon-more"></span></button>
      </div>
      <div class="modal-body">${body}</div>
      <div class="modal-foot">${foot}</div>
    </div>
  `;
  els.modalRoot.addEventListener("click", handleModalClick);
}

function handleModalClick(event) {
  if (event.target === els.modalRoot || event.target.closest("[data-modal-close]")) {
    closeModal();
  }
}

function closeModal() {
  els.modalRoot.classList.remove("open");
  els.modalRoot.innerHTML = "";
  els.modalRoot.removeEventListener("click", handleModalClick);
}

function exportState() {
  const json = JSON.stringify(state, null, 2);
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(json).then(() => toast("JSON скопирован"));
  } else {
    openModal("Экспорт JSON", `<textarea style="width:100%;min-height:260px">${escapeHtml(json)}</textarea>`, `<button class="primary-btn" type="button" data-modal-close>Закрыть</button>`);
  }
}

function importStateFromModal() {
  const textarea = $("#importValue");
  if (!textarea) return;
  try {
    const imported = JSON.parse(textarea.value);
    state = normalizeState(imported);
    saveState();
    closeModal();
    render();
    toast("Данные импортированы");
  } catch (error) {
    toast("JSON не удалось прочитать");
  }
}

function resetDemo() {
  state = createSeedState();
  selectedTaskId = null;
  saveState();
  closeModal();
  render();
  toast("Демо-данные восстановлены");
}

async function enableNotifications() {
  if (window.taskbookDesktop?.isDesktop) {
    await window.taskbookDesktop.notify({
      title: "Задачник",
      body: "Нативные уведомления Windows включены. Desktop-приложение будет проверять напоминания через backend.",
    });
    toast("Уведомления Windows включены");
    return;
  }

  if (!("Notification" in window)) {
    toast("Браузерные уведомления недоступны");
    return;
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    toast("Уведомления не разрешены");
    return;
  }

  if (!pushPublicKey) {
    try {
      const bootstrap = await apiFetch("/bootstrap");
      pushPublicKey = bootstrap.pushPublicKey || "";
    } catch {
      toast("Сервер уведомлений недоступен");
      return;
    }
  }

  if (!pushPublicKey || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    toast("Push недоступен: настройте VAPID ключи на сервере");
    return;
  }

  const registration = serviceWorkerRegistration || (await navigator.serviceWorker.ready);
  const subscription =
    (await registration.pushManager.getSubscription()) ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(pushPublicKey),
    }));
  await apiFetch("/push/subscribe", {
    method: "POST",
    body: JSON.stringify({ subscription }),
  });
  toast("Push-напоминания включены");
}

async function registerAppShell() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  try {
    serviceWorkerRegistration = await navigator.serviceWorker.register("/sw.js");
  } catch (error) {
    console.warn("Service worker registration failed", error);
  }
}

function setupDesktopBridge() {
  if (!window.taskbookDesktop?.isDesktop) return;
  window.taskbookDesktop.onOpenTask((taskId) => {
    if (taskId) openTask(taskId);
  });
  window.taskbookDesktop.onServerStatus((status) => {
    apiStatus = status?.online ? "online" : "offline";
    renderTopbar();
  });
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function startReminderWatcher() {
  clearInterval(reminderTimer);
  checkReminders();
  reminderTimer = setInterval(checkReminders, 60 * 1000);
}

function checkReminders() {
  const now = new Date();
  const notified = new Set(state.ui.notifiedReminders || []);
  let changed = false;
  state.tasks
    .filter((task) => !task.done && !task.trashed)
    .forEach((task) => {
      (task.reminders || []).forEach((reminder) => {
        const target = reminderToDate(task, reminder);
        if (!target) return;
        const diff = now.getTime() - target.getTime();
        const key = `${task.id}:${reminder}:${toISO(target)}`;
        if (diff >= 0 && diff < 90 * 1000 && !notified.has(key)) {
          notified.add(key);
          changed = true;
          showReminder(task, reminder);
        }
      });
    });
  if (changed) {
    state.ui.notifiedReminders = Array.from(notified).slice(-200);
    saveState();
  }
}

function reminderToDate(task, reminder) {
  const clean = String(reminder).trim();
  if (/^\d{2}:\d{2}$/.test(clean)) {
    const date = parseISO(task.due || isoToday());
    const [hours, minutes] = clean.split(":").map(Number);
    date.setHours(hours, minutes, 0, 0);
    return date;
  }
  const match = clean.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2})$/);
  if (match) {
    const date = parseISO(match[1]);
    date.setHours(Number(match[2]), Number(match[3]), 0, 0);
    return date;
  }
  return null;
}

function showReminder(task, reminder) {
  const message = `${task.title} · ${reminder}`;
  toast(`Напоминание: ${message}`);
  if (window.taskbookDesktop?.isDesktop) {
    window.taskbookDesktop.notify({ title: "Задачник", body: message });
    return;
  }
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("Задачник", { body: message });
  }
}

function startFocus() {
  state.focus.running = true;
  saveState();
  tickFocusTimer();
}

function pauseFocus() {
  state.focus.running = false;
  saveState();
  tickFocusTimer();
  renderContent();
}

function resetFocus() {
  state.focus.running = false;
  state.focus.remaining = state.focus.phase === "break" ? 5 * 60 : 25 * 60;
  saveState();
  tickFocusTimer();
  renderContent();
}

function completeFocusSession() {
  const minutes = Math.max(1, Math.round((25 * 60 - state.focus.remaining) / 60));
  state.focus.sessions.push({
    id: uid("session"),
    taskId: state.focus.selectedTaskId,
    minutes,
    at: new Date().toISOString(),
  });
  state.focus.running = false;
  state.focus.phase = "break";
  state.focus.remaining = 5 * 60;
  saveState();
  render();
  toast("Фокус-сессия сохранена");
}

function tickFocusTimer() {
  clearInterval(focusTimer);
  if (!state.focus.running) return;
  focusTimer = setInterval(() => {
    if (state.focus.remaining > 0) {
      state.focus.remaining -= 1;
      $("#timerDisplay") && ($("#timerDisplay").textContent = formatSeconds(state.focus.remaining));
      if (state.focus.remaining % 30 === 0) saveState();
    } else {
      completeFocusSession();
    }
  }, 1000);
}

function toggleHabit(habitId, date) {
  const habit = state.habits.find((item) => item.id === habitId);
  if (!habit) return;
  if (habit.records[date]) delete habit.records[date];
  else habit.records[date] = true;
  saveState();
  renderContent();
}

function shiftMonth(offset) {
  const date = parseMonth(state.ui.calendarMonth);
  date.setMonth(date.getMonth() + offset);
  state.ui.calendarMonth = `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
  saveState();
  renderContent();
}

function applyTheme() {
  document.body.classList.toggle("dark", state.settings.theme === "dark");
}

function getActiveList() {
  const filter = state.ui.activeFilter;
  if (!filter.startsWith("list:")) return null;
  return getList(filter.slice(5));
}

function getTask(id) {
  return state.tasks.find((task) => task.id === id);
}

function getList(id) {
  return state.lists.find((list) => list.id === id);
}

function getTag(id) {
  return state.tags.find((tag) => tag.id === id);
}

function getPerson(id) {
  return state.people.find((person) => person.id === id);
}

function firstSectionId(listId, targetState = state) {
  return targetState.lists.find((list) => list.id === listId)?.sections?.[0]?.id || "";
}

function ensureTag(name) {
  const clean = name.trim().replace(/^#/, "");
  const existing = state.tags.find((tag) => normalizeName(tag.name) === normalizeName(clean));
  if (existing) return existing;
  const tag = { id: clean || uid("tag"), name: clean || "метка", color: randomColor() };
  state.tags.push(tag);
  return tag;
}

function parseTagsInput(value) {
  return unique(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((name) => ensureTag(name).id)
  );
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function toISO(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseISO(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function parseMonth(value) {
  const [year, month] = (value || isoToday().slice(0, 7)).split("-").map(Number);
  return new Date(year, month - 1, 1);
}

function startOfWeek(date) {
  const day = date.getDay() || 7;
  return addDays(date, 1 - day);
}

function isoToday() {
  return toISO(new Date());
}

function isoAdd(iso, amount) {
  return toISO(addDays(parseISO(iso), amount));
}

function nextRepeatDate(task) {
  const base = task.due || isoToday();
  if (task.repeat === "daily") return isoAdd(base, 1);
  if (task.repeat === "weekly") return isoAdd(base, 7);
  if (task.repeat === "monthly") {
    const date = parseISO(base);
    date.setMonth(date.getMonth() + 1);
    return toISO(date);
  }
  return base;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatDue(iso) {
  if (!iso) return "";
  const today = isoToday();
  if (iso === today) return "Сегодня";
  if (iso === isoAdd(today, 1)) return "Завтра";
  if (iso < today) return `Просрочено ${formatDateShort(iso)}`;
  return formatDateShort(iso);
}

function formatDateShort(iso) {
  return parseISO(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "short" });
}

function formatDateTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function formatBytes(bytes) {
  if (!bytes) return "0 Б";
  const units = ["Б", "КБ", "МБ", "ГБ"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatSeconds(total) {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${pad(minutes)}:${pad(seconds)}`;
}

function priorityLabel(priority) {
  return {
    1: "Высокий",
    2: "Средний",
    3: "Низкий",
    4: "Нет",
  }[priority];
}

function repeatLabel(repeat) {
  return {
    daily: "Ежедневно",
    weekly: "Еженедельно",
    monthly: "Ежемесячно",
    none: "",
  }[repeat];
}

function priorityColor(priority) {
  return {
    1: "#e03131",
    2: "#f59f00",
    3: "#3867ff",
    4: "#8a9099",
  }[priority || 4];
}

function daysUntil(iso) {
  return Math.ceil((parseISO(iso).getTime() - parseISO(isoToday()).getTime()) / DAY_MS);
}

function renderMarkdownPreview(value) {
  return escapeHtml(value)
    .replace(/^### (.*)$/gm, "<h4>$1</h4>")
    .replace(/^## (.*)$/gm, "<h3>$1</h3>")
    .replace(/^# (.*)$/gm, "<h2>$1</h2>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/^- \[x\] (.*)$/gim, "<div class=\"md-check done\">$1</div>")
    .replace(/^- \[ \] (.*)$/gim, "<div class=\"md-check\">$1</div>")
    .replace(/\n/g, "<br />");
}

function logActivity(taskId, type, message) {
  state.history.unshift({
    id: uid("history"),
    taskId,
    type,
    message,
    at: new Date().toISOString(),
  });
  state.history = state.history.slice(0, 500);
}

function habitStreak(habit) {
  let streak = 0;
  let day = isoToday();
  while (habit.records[day]) {
    streak += 1;
    day = isoAdd(day, -1);
  }
  return streak;
}

function unique(items) {
  return [...new Set(items)];
}

function nextOrder() {
  return Math.max(0, ...state.tasks.map((task) => task.order || 0)) + 1;
}

function uid(prefix) {
  if (crypto?.randomUUID) return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function randomColor() {
  const colors = ["#3867ff", "#22a06b", "#f59f00", "#e03131", "#845ef7", "#0ca678", "#d9480f"];
  return colors[Math.floor(Math.random() * colors.length)];
}

function normalizeName(value) {
  return String(value).trim().toLowerCase().replace(/\s+/g, "-");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function cssEscape(value) {
  if (window.CSS?.escape) return CSS.escape(value);
  return String(value).replace(/["\\]/g, "\\$&");
}

function toast(message) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("open");
  toastTimer = setTimeout(() => els.toast.classList.remove("open"), 2200);
}

$("#collapseBtn").dataset.action = "toggle-sidebar";
$("#quickAddBtn").dataset.action = "quick-add";
$("#addListBtn").dataset.action = "add-list";
$("#addTagBtn").dataset.action = "add-tag";
$("#addFilterBtn").dataset.action = "add-filter";
$("#sortBtn").dataset.action = "sort";
$("#moreBtn").dataset.action = "more";
$("#syncBtn").dataset.action = "sync";
$("#settingsBtn").dataset.action = "settings";
$("#helpBtn").dataset.action = "help";
