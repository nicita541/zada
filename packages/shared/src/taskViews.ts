export interface TaskViewProjectLike {
  id: string;
  name: string;
}

export interface TaskViewTaskLike {
  id: string;
  title: string;
  description?: string | null;
  projectId?: string | null;
  completed?: boolean;
  priority?: string | null;
  type?: string | null;
  tags?: string[];
  dueDate?: string | null;
  gameArea?: string | null;
  buildVersion?: string | null;
}

export interface TaskViewFilters {
  projectId?: string | null;
  status?: "all" | "todo" | "done";
  priority?: string | null;
  type?: string | null;
  tag?: string | null;
  noDate?: boolean;
}

export function filterTasksForView<TTask extends TaskViewTaskLike>(
  tasks: TTask[],
  projects: TaskViewProjectLike[],
  searchQuery: string,
  filters: TaskViewFilters
): TTask[] {
  const query = searchQuery.trim().toLowerCase();
  const projectById = new Map(projects.map((project) => [project.id, project]));

  return tasks.filter((task) => {
    if (filters.projectId && task.projectId !== filters.projectId) {
      return false;
    }
    if ((filters.status ?? "todo") === "todo" && task.completed) {
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
    if (filters.tag && !(task.tags ?? []).includes(filters.tag)) {
      return false;
    }
    if (filters.noDate && task.dueDate) {
      return false;
    }
    if (!query) {
      return true;
    }

    return [
      task.title,
      task.description,
      projectById.get(task.projectId ?? "")?.name,
      task.gameArea,
      task.buildVersion,
      ...(task.tags ?? [])
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
}

export function groupTodayTasksByDueDate<TTask extends TaskViewTaskLike>(tasks: TTask[], today = dateKey(new Date())) {
  return {
    overdue: tasks.filter((task) => !task.completed && task.dueDate && task.dueDate < today),
    today: tasks.filter((task) => task.dueDate === today),
    noDate: tasks.filter((task) => !task.dueDate)
  };
}

export function groupUpcomingTasksByDueDate<TTask extends TaskViewTaskLike>(tasks: TTask[], todayDate = new Date()) {
  const today = dateKey(todayDate);
  const end = new Date(todayDate);
  end.setDate(todayDate.getDate() + 7);
  const endKey = dateKey(end);
  const dated = tasks.filter((task) => !task.completed && task.dueDate && task.dueDate > today);

  return {
    nextSeven: dated.filter((task) => task.dueDate && task.dueDate <= endKey),
    later: dated.filter((task) => task.dueDate && task.dueDate > endKey)
  };
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
