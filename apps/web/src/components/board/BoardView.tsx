import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent, type UniqueIdentifier } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { Bell, CheckSquare, GripVertical, Plus, Repeat2, Trash2 } from "lucide-react";
import { Badge, Button } from "@zada/ui";
import { effectiveTaskColumnId, inferBoardColumnKind } from "@zada/shared";
import type { LocalBoardColumn, LocalReminder, LocalSubtask, LocalTask } from "../../lib/db";
import { useI18n, type TranslationKey } from "../../i18n";
import { useAppStore } from "../../store/appStore";

const noColumnKey = "__none";

export function BoardView({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const tasks = useAppStore((state) => state.tasks);
  const columns = useAppStore((state) => state.columnsByProjectId[projectId] ?? []);
  const subtasksByTaskId = useAppStore((state) => state.subtasksByTaskId);
  const remindersByTaskId = useAppStore((state) => state.remindersByTaskId);
  const loadProjectColumns = useAppStore((state) => state.loadProjectColumns);
  const createColumn = useAppStore((state) => state.createColumn);
  const updateColumn = useAppStore((state) => state.updateColumn);
  const deleteColumn = useAppStore((state) => state.deleteColumn);
  const reorderColumns = useAppStore((state) => state.reorderColumns);
  const moveTask = useAppStore((state) => state.moveTask);
  const createTask = useAppStore((state) => state.createTask);
  const selectTask = useAppStore((state) => state.selectTask);
  const [columnDraft, setColumnDraft] = useState("");
  const projectTasks = useMemo(
    () => tasks.filter((task) => task.projectId === projectId && !task.deletedAt),
    [projectId, tasks]
  );
  const tasksByColumn = useMemo(() => groupTasksByColumn(projectTasks, columns), [columns, projectTasks]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    loadProjectColumns(projectId);
  }, [loadProjectColumns, projectId]);

  async function submitColumn(event: FormEvent) {
    event.preventDefault();
    const created = await createColumn(projectId, { name: columnDraft });
    if (created) {
      setColumnDraft("");
    }
  }

  async function addTask(column: LocalBoardColumn, title: string) {
    const columnTasks = tasksByColumn[column.id] ?? [];
    await createTask({
      title,
      description: null,
      projectId,
      columnId: column.id,
      position: columnTasks.length,
      tags: []
    });
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const activeItem = parseDragId(active.id);
    const overItem = parseDragId(over.id);

    if (activeItem?.type === "column" && overItem?.type === "column") {
      const oldIndex = columns.findIndex((column) => column.id === activeItem.id);
      const newIndex = columns.findIndex((column) => column.id === overItem.id);
      if (oldIndex >= 0 && newIndex >= 0) {
        await reorderColumns(projectId, arrayMove(columns, oldIndex, newIndex).map((column) => column.id));
      }
      return;
    }

    if (activeItem?.type !== "task" || !overItem) {
      return;
    }

    let targetColumnId: string | null = null;
    let targetPosition = 0;

    if (overItem.type === "column") {
      targetColumnId = overItem.id;
      targetPosition = tasksByColumn[targetColumnId]?.length ?? 0;
    } else {
      const overTask = projectTasks.find((task) => task.id === overItem.id);
      if (!overTask) {
        return;
      }
      targetColumnId = effectiveTaskColumnId(overTask, columns);
      const targetTasks = tasksByColumn[columnKey(targetColumnId)] ?? [];
      const overIndex = targetTasks.findIndex((task) => task.id === overTask.id);
      targetPosition = overIndex >= 0 ? overIndex : targetTasks.length;
    }

    await moveTask(activeItem.id, targetColumnId, targetPosition);
  }

  return (
    <div className="board-view">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={columns.map((column) => columnDragId(column.id))} strategy={horizontalListSortingStrategy}>
          <div className="board-columns">
            {columns.map((column) => (
              <BoardColumn
                key={column.id}
                column={column}
                tasks={tasksByColumn[column.id] ?? []}
                subtasksByTaskId={subtasksByTaskId}
                remindersByTaskId={remindersByTaskId}
                onAddTask={addTask}
                onDeleteColumn={deleteColumn}
                onOpenTask={selectTask}
                onUpdateColumn={updateColumn}
              />
            ))}
            <form className="board-add-column" onSubmit={submitColumn}>
              <input
                aria-label={t("board.columnName")}
                value={columnDraft}
                onChange={(event) => setColumnDraft(event.target.value)}
                placeholder={t("board.columnPlaceholder")}
              />
              <Button type="submit">
                <Plus size={16} />
                {t("board.addColumn")}
              </Button>
            </form>
          </div>
        </SortableContext>
      </DndContext>
      {columns.length === 0 && projectTasks.length > 0 ? <div className="empty-state">{t("board.noTasks")}</div> : null}
    </div>
  );
}

function BoardColumn({
  column,
  tasks,
  subtasksByTaskId,
  remindersByTaskId,
  onAddTask,
  onDeleteColumn,
  onOpenTask,
  onUpdateColumn
}: {
  column: LocalBoardColumn;
  tasks: LocalTask[];
  subtasksByTaskId: Record<string, LocalSubtask[]>;
  remindersByTaskId: Record<string, LocalReminder[]>;
  onAddTask: (column: LocalBoardColumn, title: string) => Promise<void>;
  onDeleteColumn: (columnId: string) => Promise<void>;
  onOpenTask: (taskId: string) => void;
  onUpdateColumn: (columnId: string, input: Partial<Pick<LocalBoardColumn, "name" | "kind" | "color" | "position">>) => Promise<void>;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(column.name);
  const [taskDraft, setTaskDraft] = useState("");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: columnDragId(column.id),
    data: { type: "column", columnId: column.id }
  });
  const style: CSSProperties = {
    transform: dndTransform(transform),
    transition
  };

  useEffect(() => {
    setName(localizedColumnName(t, column));
  }, [column.kind, column.name, t]);

  async function submitTask(event: FormEvent) {
    event.preventDefault();
    const title = taskDraft.trim();
    if (!title) {
      return;
    }
    await onAddTask(column, title);
    setTaskDraft("");
  }

  async function commitName() {
    const trimmed = name.trim();
    const displayName = localizedColumnName(t, column);
    if (trimmed && trimmed !== column.name && trimmed !== displayName) {
      await onUpdateColumn(column.id, { name: trimmed });
    } else {
      setName(displayName);
    }
  }

  async function removeColumn() {
    if (window.confirm(t("board.confirmDeleteColumn"))) {
      await onDeleteColumn(column.id);
    }
  }

  return (
    <section ref={setNodeRef} style={style} className={`board-column ${isDragging ? "dragging" : ""}`}>
      <div className="board-column-head">
        <button className="icon-button small board-drag-handle" type="button" title={t("board.dragColumn")} {...attributes} {...listeners}>
          <GripVertical size={15} />
        </button>
        <span className="board-column-color" style={{ backgroundColor: column.color ?? "var(--primary)" }} />
        <input
          aria-label={t("board.columnName")}
          value={name}
          onBlur={commitName}
          onChange={(event) => setName(event.target.value)}
        />
        <Badge>{t("board.taskCount", { count: tasks.length })}</Badge>
        <button className="icon-button small" type="button" title={t("board.deleteColumn")} onClick={removeColumn}>
          <Trash2 size={15} />
        </button>
      </div>

      <SortableContext items={tasks.map((task) => taskDragId(task.id))} strategy={verticalListSortingStrategy}>
        <div className="board-card-list">
          {tasks.map((task) => (
            <BoardTaskCard
              key={task.id}
              task={task}
              subtasks={subtasksByTaskId[task.id] ?? []}
              reminders={remindersByTaskId[task.id] ?? []}
              onOpenTask={onOpenTask}
            />
          ))}
          {tasks.length === 0 ? <div className="board-column-empty">{t("board.emptyColumn")}</div> : null}
        </div>
      </SortableContext>

      <form className="board-add-task" onSubmit={submitTask}>
        <input value={taskDraft} onChange={(event) => setTaskDraft(event.target.value)} placeholder={t("board.taskPlaceholder")} />
        <Button type="submit" variant="secondary" title={t("projects.addTask")}>
          <Plus size={16} />
        </Button>
      </form>
    </section>
  );
}

function BoardTaskCard({
  task,
  subtasks,
  reminders,
  onOpenTask
}: {
  task: LocalTask;
  subtasks: LocalSubtask[];
  reminders: LocalReminder[];
  onOpenTask: (taskId: string) => void;
}) {
  const { t } = useI18n();
  const activeReminders = reminders.filter((reminder) => !reminder.dismissedAt).length;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: taskDragId(task.id),
    data: { type: "task", taskId: task.id }
  });
  const style: CSSProperties = {
    transform: dndTransform(transform),
    transition
  };

  return (
    <button
      ref={setNodeRef}
      style={style}
      className={`board-task-card ${task.completed ? "done" : ""} ${isDragging ? "dragging" : ""}`}
      type="button"
      onClick={() => onOpenTask(task.id)}
      title={t("today.openTask")}
      {...attributes}
      {...listeners}
    >
      <strong>{task.title}</strong>
      <BoardSubtaskPreview subtasks={subtasks} />
      <div className="task-meta board-task-meta">
        {task.priority ? <span className={`priority-chip priority-${task.priority}`}>{task.priority.toUpperCase()}</span> : null}
        {task.dueDate ? <span>{task.dueDate}</span> : null}
        {task.tags.slice(0, 3).map((tag) => (
          <span key={tag}>#{tag}</span>
        ))}
        {activeReminders > 0 ? (
          <span title={t("board.reminders")}>
            <Bell size={12} />
            {activeReminders}
          </span>
        ) : null}
        {task.repeat ? (
          <span title={t("board.repeat")}>
            <Repeat2 size={12} />
          </span>
        ) : null}
      </div>
    </button>
  );
}

function BoardSubtaskPreview({ subtasks }: { subtasks: LocalSubtask[] }) {
  const { t } = useI18n();
  if (subtasks.length === 0) {
    return null;
  }

  const orderedSubtasks = [...subtasks].sort((left, right) => left.position - right.position);
  const visibleSubtasks = orderedSubtasks.slice(0, 2);
  const completedSubtasks = orderedSubtasks.filter((subtask) => subtask.completed).length;
  const hiddenCount = orderedSubtasks.length - visibleSubtasks.length;

  return (
    <div className="subtask-preview board-subtask-preview" aria-label={t("board.subtasks")}>
      <div className="subtask-preview-head">
        <CheckSquare size={12} />
        <span>{completedSubtasks}/{orderedSubtasks.length}</span>
      </div>
      <div className="subtask-preview-list">
        {visibleSubtasks.map((subtask) => (
          <span className={subtask.completed ? "done" : ""} key={subtask.id}>
            {subtask.title}
          </span>
        ))}
        {hiddenCount > 0 ? <span className="subtask-more">+{hiddenCount} {t("taskDetail.moreSubtasks")}</span> : null}
      </div>
    </div>
  );
}

function groupTasksByColumn(tasks: LocalTask[], columns: LocalBoardColumn[]) {
  const groups = columns.reduce<Record<string, LocalTask[]>>((result, column) => {
    result[column.id] = [];
    return result;
  }, {});

  for (const task of tasks) {
    const key = columnKey(effectiveTaskColumnId(task, columns));
    groups[key] = [...(groups[key] ?? []), task];
  }

  for (const key of Object.keys(groups)) {
    const group = groups[key] ?? [];
    groups[key] = [...group].sort((left, right) => (left.position ?? 0) - (right.position ?? 0) || left.updatedAt.localeCompare(right.updatedAt));
  }

  return groups;
}

function parseDragId(value: UniqueIdentifier) {
  const raw = String(value);
  const delimiter = raw.indexOf(":");
  if (delimiter < 0) {
    return null;
  }

  const type = raw.slice(0, delimiter);
  const id = raw.slice(delimiter + 1);
  return id && (type === "column" || type === "task") ? { type, id } : null;
}

function columnDragId(id: string) {
  return `column:${id}`;
}

function taskDragId(id: string) {
  return `task:${id}`;
}

function columnKey(columnId: string | null) {
  return columnId ?? noColumnKey;
}

function dndTransform(transform: { x: number; y: number } | null) {
  return transform ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)` : undefined;
}

function localizedColumnName(t: (key: TranslationKey) => string, column: LocalBoardColumn): string {
  const kind = inferBoardColumnKind(column.name, column.kind);
  const keyByKind: Partial<Record<string, TranslationKey>> = {
    backlog: "projects.columns.backlog",
    todo: "projects.columns.todo",
    in_progress: "projects.columns.inProgress",
    review: "projects.columns.review",
    done: "projects.columns.done"
  };
  const keyByName: Record<string, TranslationKey> = {
    ideas: "projects.columns.ideas",
    testing: "projects.columns.testing"
  };
  const key = keyByKind[kind] ?? keyByName[column.name.trim().toLowerCase()];
  return key ? t(key) : column.name;
}
