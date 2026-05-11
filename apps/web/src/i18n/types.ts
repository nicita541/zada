export type Locale = "ru" | "en";

export const DEFAULT_LOCALE: Locale = "ru";

export interface TranslationDictionary {
  common: {
    appName: string;
    add: string;
    active: string;
    cancel: string;
    close: string;
    confirm: string;
    copyCode: string;
    create: string;
    delete: string;
    done: string;
    enabled: string;
    error: string;
    exportJson: string;
    clear: string;
    clearSearch: string;
    confirmDelete: string;
    loading: string;
    local: string;
    more: string;
    no: string;
    open: string;
    pro: string;
    reset: string;
    save: string;
    searchPlaceholder: string;
    start: string;
    sync: string;
    syncNow: string;
    yes: string;
    upgrade: string;
  };
  nav: {
    today: string;
    inbox: string;
    projects: string;
    calendar: string;
    habits: string;
    notes: string;
    import: string;
    gameDev: string;
    focus: string;
    stats: string;
    settings: string;
    subscription: string;
  };
  shell: {
    personalWorkspace: string;
    mainNavigation: string;
    mobileNavigation: string;
    later: string;
    notifications: string;
    toggleTheme: string;
    addTask: string;
  };
  auth: {
    loadingSession: string;
    sessionRequired: string;
    invalidEmail: string;
    passwordRequired: string;
    loginTitle: string;
    createAccount: string;
    recoverPassword: string;
    recovery: string;
    resetPassword: string;
    resetToken: string;
    sendReset: string;
    resetTokenReady: string;
    resetEmailSent: string;
    passwordResetDone: string;
    devResetToken: string;
  };
  today: {
    metaOpenTasks: string;
    quickAddPlaceholder: string;
    toggleComplete: string;
    openTask: string;
    dailyLoad: string;
    open: string;
    upcoming: string;
    overdue: string;
    todayGroup: string;
    noDate: string;
    nextSevenDays: string;
    later: string;
    filters: string;
    allProjects: string;
    allStatuses: string;
    activeOnly: string;
    completedOnly: string;
    allPriorities: string;
    allTypes: string;
    allTags: string;
    filterAll: string;
    filterNoDate: string;
    searchResults: string;
    previewDue: string;
    noTasks: string;
    noTasksDescription: string;
    nothingFound: string;
    nothingFoundDescription: string;
    noUpcoming: string;
    inboxEmpty: string;
    inboxEmptyDescription: string;
    dueReminders: string;
    dismissReminder: string;
  };
  projects: {
    meta: string;
    inbox: string;
    gameProject: string;
    bugTracker: string;
    linkedTasks: string;
    nameRequired: string;
    confirmDelete: string;
    taskTitleRequired: string;
    namePlaceholder: string;
    descriptionPlaceholder: string;
    createProject: string;
    empty: string;
    noDescription: string;
    activeProject: string;
    noActiveProject: string;
    selectOrCreate: string;
    taskTitlePlaceholder: string;
    taskDescriptionPlaceholder: string;
    addTask: string;
    projectNoTasks: string;
    projectNoTasksDescription: string;
    noMatchingTasks: string;
    columns: {
      ideas: string;
      backlog: string;
      todo: string;
      inProgress: string;
      review: string;
      testing: string;
      done: string;
    };
  };
  board: {
    listView: string;
    boardView: string;
    addColumn: string;
    columnName: string;
    columnPlaceholder: string;
    taskPlaceholder: string;
    emptyColumn: string;
    deleteColumn: string;
    confirmDeleteColumn: string;
    dragColumn: string;
    dragTask: string;
    subtasks: string;
    reminders: string;
    repeat: string;
    noTasks: string;
    taskCount: string;
  };
  calendar: {
    meta: string;
    agenda: string;
    importPreview: string;
    focusBlock: string;
  };
  habits: {
    meta: string;
    dailyPlanning: string;
    prototypeReview: string;
    writeDesignNotes: string;
    streak: string;
  };
  notes: {
    syncEnabled: string;
    localOnly: string;
    newTitle: string;
    titlePlaceholder: string;
    tagsPlaceholder: string;
    contentPlaceholder: string;
    internalLinks: string;
    statusLocalOnly: string;
    statusPending: string;
    statusSynced: string;
    statusError: string;
  };
  import: {
    title: string;
    outlineParser: string;
    preview: string;
    tasks: string;
    warnings: string;
    errors: string;
    project: string;
  };
  gameDev: {
    workspaceEnabled: string;
    premiumGated: string;
    projectTemplate: string;
    starterTasks: string;
    premiumFeatureAlert: string;
    snippets: string;
    milestones: string;
    templateGroups: {
      coreMechanics: string;
      player: string;
      enemies: string;
      uiUx: string;
      bugs: string;
      milestones: string;
    };
    milestonesList: {
      prototype: string;
      verticalSlice: string;
      alpha: string;
      beta: string;
      release: string;
    };
  };
  focus: {
    meta: string;
  };
  stats: {
    meta: string;
    weekdays: {
      mon: string;
      tue: string;
      wed: string;
      thu: string;
      fri: string;
    };
  };
  settings: {
    meta: string;
    account: string;
    interface: string;
    language: string;
    russian: string;
    english: string;
    signedInLocally: string;
    notSignedIn: string;
    signedInAs: string;
    signedOutLocally: string;
    authFailed: string;
    invalidCredentials: string;
    login: string;
    logout: string;
    register: string;
    name: string;
    email: string;
    password: string;
    roleUser: string;
    roleAdmin: string;
  };
  taskDetail: {
    title: string;
    taskTitle: string;
    titleRequired: string;
    confirmDelete: string;
    description: string;
    project: string;
    noProject: string;
    type: string;
    priority: string;
    noPriority: string;
    dueDate: string;
    dueTime: string;
    estimatedMinutes: string;
    gameArea: string;
    severity: string;
    buildVersion: string;
    tags: string;
    emptyTags: string;
    tagPlaceholder: string;
    addTag: string;
    descriptionSection: string;
    subtasks: string;
    subtaskPlaceholder: string;
    emptySubtasks: string;
    emptySubtasksDescription: string;
    subtasksProgress: string;
    moreSubtasks: string;
    reminders: string;
    reminderAt: string;
    reminderRequired: string;
    emptyReminders: string;
    emptyRemindersDescription: string;
    repeat: string;
    repeatCompletionNote: string;
    noRepeat: string;
    repeatNone: string;
    repeatDaily: string;
    repeatWeekly: string;
    repeatMonthly: string;
    repeatYearly: string;
    repeatWeekdays: string;
    additional: string;
    stepsToReproduce: string;
    expectedResult: string;
    actualResult: string;
    complete: string;
    reopen: string;
  };
  subscription: {
    plan: string;
    premiumGates: string;
    purchaseUnavailable: string;
    featureEnabled: string;
    free: string;
    pro: string;
    lifetimeDev: string;
    admin: string;
    inactive: string;
    active: string;
    pastDue: string;
    canceled: string;
    manual: string;
    features: Record<string, string>;
  };
  noteSync: {
    title: string;
    description: string;
    enabledDescription: string;
    disabledDescription: string;
    localOnlyExport: string;
  };
  taskTypes: Record<string, string>;
  linkKinds: Record<string, string>;
  syncState: {
    offline: string;
    idle: string;
    syncing: string;
    error: string;
  };
}

type Join<Prefix extends string, Key extends string> = `${Prefix}.${Key}`;

export type TranslationKey<T = TranslationDictionary> = {
  [K in keyof T & string]: T[K] extends string
    ? K
    : T[K] extends Record<string, string>
      ? Join<K, keyof T[K] & string>
      : Join<K, TranslationKey<T[K]>>;
}[keyof T & string];
