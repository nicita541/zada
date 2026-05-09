import type { TranslationDictionary } from "./types";

export const ru = {
  common: {
    appName: "Zada",
    add: "Добавить",
    active: "активно",
    cancel: "Отмена",
    confirm: "Подтвердить",
    copyCode: "Скопировать код",
    create: "Создать",
    done: "Готово",
    enabled: "включено",
    error: "Ошибка",
    exportJson: "Экспорт JSON",
    loading: "Загрузка",
    local: "Локально",
    more: "Ещё",
    no: "Нет",
    open: "Открыть",
    pro: "Pro",
    reset: "Сбросить",
    save: "Сохранить",
    searchPlaceholder: "Поиск задач, заметок, сниппетов",
    start: "Старт",
    sync: "Синхронизация",
    syncNow: "Синхронизировать",
    upgrade: "Улучшить",
    yes: "Да"
  },
  nav: {
    today: "Сегодня",
    projects: "Проекты",
    calendar: "Календарь",
    habits: "Привычки",
    notes: "Заметки",
    import: "Импорт",
    gameDev: "Геймдев",
    focus: "Фокус",
    stats: "Статистика",
    settings: "Настройки",
    subscription: "Подписка"
  },
  shell: {
    personalWorkspace: "Личное пространство",
    mainNavigation: "Главная навигация",
    mobileNavigation: "Мобильная навигация",
    notifications: "Уведомления",
    toggleTheme: "Переключить тему",
    addTask: "Добавить задачу"
  },
  today: {
    metaOpenTasks: "{count} открытых задач",
    quickAddPlaceholder: "Добавить задачу #тег p1 due:2026-05-10 [bug]",
    toggleComplete: "Отметить выполнение",
    openTask: "Открыть задачу",
    dailyLoad: "Нагрузка дня",
    open: "Открыто",
    upcoming: "Ближайшие"
  },
  projects: {
    meta: "Обзор рабочего пространства",
    inbox: "Входящие",
    gameProject: "Игровой проект",
    bugTracker: "Трекер багов",
    linkedTasks: "{count} связанных задач",
    columns: {
      ideas: "Идеи",
      backlog: "Бэклог",
      todo: "К выполнению",
      inProgress: "В работе",
      testing: "Тестирование",
      done: "Готово"
    }
  },
  calendar: {
    meta: "Основа месяца, недели и повестки",
    agenda: "Повестка",
    importPreview: "Предпросмотр импорта",
    focusBlock: "Фокус-блок"
  },
  habits: {
    meta: "Простое отслеживание серий",
    dailyPlanning: "Ежедневное планирование",
    prototypeReview: "Обзор прототипа",
    writeDesignNotes: "Писать дизайн-заметки",
    streak: "{count} дней подряд"
  },
  notes: {
    syncEnabled: "Синхронизация включена",
    localOnly: "Только локально",
    newTitle: "Новая заметка",
    titlePlaceholder: "Название заметки",
    tagsPlaceholder: "теги",
    contentPlaceholder: "Текст заметки",
    internalLinks: "Внутренние ссылки",
    statusLocalOnly: "только локально",
    statusPending: "ожидает",
    statusSynced: "синхронизировано",
    statusError: "ошибка"
  },
  import: {
    title: "Импорт задач",
    outlineParser: "Парсер структуры",
    preview: "Предпросмотр",
    tasks: "Задачи",
    warnings: "Предупреждения",
    errors: "Ошибки",
    project: "Проект"
  },
  gameDev: {
    workspaceEnabled: "Рабочее пространство доступно",
    premiumGated: "Требуется Pro",
    projectTemplate: "Шаблон проекта",
    starterTasks: "{count} стартовых задач",
    premiumFeatureAlert: "Геймдев-пространство доступно в Pro.",
    snippets: "Сниппеты",
    milestones: "Вехи",
    templateGroups: {
      coreMechanics: "Ключевые механики",
      player: "Игрок",
      enemies: "Враги",
      uiUx: "UI/UX",
      bugs: "Баги",
      milestones: "Вехи"
    },
    milestonesList: {
      prototype: "Прототип",
      verticalSlice: "Вертикальный срез",
      alpha: "Альфа",
      beta: "Бета",
      release: "Релиз"
    }
  },
  focus: {
    meta: "Pomodoro-сессия"
  },
  stats: {
    meta: "Тренды задач и фокуса",
    weekdays: {
      mon: "Пн",
      tue: "Вт",
      wed: "Ср",
      thu: "Чт",
      fri: "Пт"
    }
  },
  settings: {
    meta: "Настройки рабочего пространства",
    account: "Аккаунт",
    interface: "Интерфейс",
    language: "Язык интерфейса",
    russian: "Русский",
    english: "Английский",
    signedInLocally: "Вход сохранён локально",
    notSignedIn: "Вы не вошли",
    signedInAs: "Вы вошли как {email}",
    signedOutLocally: "Вы вышли локально",
    authFailed: "Не удалось войти",
    invalidCredentials: "Неверный email или пароль",
    login: "Войти",
    logout: "Выйти",
    register: "Регистрация",
    name: "Имя",
    email: "Email",
    password: "Пароль"
  },
  subscription: {
    plan: "План: {plan}",
    premiumGates: "Pro-функции",
    purchaseUnavailable: "Покупка подписки пока недоступна.",
    featureEnabled: "включено",
    free: "Бесплатный",
    pro: "Pro",
    lifetimeDev: "Lifetime Dev",
    admin: "Admin",
    inactive: "Неактивна",
    active: "Активна",
    pastDue: "Просрочена",
    canceled: "Отменена",
    manual: "Вручную",
    features: {
      unlimited_projects: "Неограниченные проекты",
      advanced_stats: "Расширенная статистика",
      saved_filters: "Сохранённые фильтры",
      advanced_reminders: "Расширенные напоминания",
      custom_themes: "Пользовательские темы",
      csv_export: "Экспорт CSV",
      advanced_import: "Расширенный импорт",
      game_dev_workspace: "Геймдев-пространство",
      gdd_documents: "GDD-документы",
      game_concept_documents: "Игровые концепты",
      code_snippets: "Сниппеты кода",
      local_file_references: "Ссылки на локальные файлы",
      game_dev_dashboard: "Геймдев-дашборд",
      bug_tracker_advanced: "Расширенный трекер багов",
      milestones_advanced: "Расширенные вехи"
    }
  },
  noteSync: {
    title: "Синхронизация заметок",
    description: "Синхронизация заметок",
    enabledDescription: "Новые изменения будут добавлены в очередь синхронизации.",
    disabledDescription: "Новые изменения останутся только на этом устройстве.",
    localOnlyExport: "Локальные заметки включаются в JSON-экспорт."
  },
  taskTypes: {
    feature: "функция",
    bug: "баг",
    polish: "полировка",
    balance: "баланс",
    art: "арт",
    audio: "аудио",
    ui: "интерфейс",
    code: "код",
    design: "дизайн",
    research: "исследование",
    testing: "тест",
    build: "сборка",
    release: "релиз",
    milestone: "веха"
  },
  linkKinds: {
    Task: "Задача",
    Note: "Заметка",
    Concept: "Концепт",
    File: "Файл",
    GDD: "GDD",
    Snippet: "Сниппет",
    Bug: "Баг",
    Milestone: "Веха"
  },
  syncState: {
    offline: "Офлайн",
    idle: "Ожидание",
    syncing: "Синхронизация",
    error: "Ошибка"
  }
} satisfies TranslationDictionary;
