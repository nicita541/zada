import { ensureUser, withTransaction } from "./db.js";

const DEFAULT_USER_ID = process.env.DEFAULT_USER_ID || "local-user";

export function getUserId(req) {
  return String(req.header("x-user-id") || req.query.userId || DEFAULT_USER_ID);
}

export async function readSnapshot(userId) {
  return withTransaction(async (client) => {
    await ensureUser(client, userId);
    const result = await client.query("SELECT state, updated_at FROM app_snapshots WHERE user_id = $1", [userId]);
    return result.rows[0] ? { state: result.rows[0].state, updatedAt: result.rows[0].updated_at } : null;
  });
}

export async function saveSnapshot(userId, state) {
  return withTransaction(async (client) => {
    await ensureUser(client, userId);
    await client.query(
      `INSERT INTO app_snapshots (user_id, state, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (user_id) DO UPDATE SET state = EXCLUDED.state, updated_at = now()`,
      [userId, state]
    );

    await replaceRows(client, "lists", userId, state.lists || [], (item) => [
      item.id,
      userId,
      item.name || "Список",
      item.color || null,
      item,
    ]);

    await replaceRows(client, "tags", userId, state.tags || [], (item) => [
      item.id,
      userId,
      item.name || item.id,
      item.color || null,
      item,
    ]);

    await replaceTasks(client, userId, state.tasks || []);
    await replaceRows(client, "habits", userId, state.habits || [], (item) => [
      item.id,
      userId,
      item.name || "Привычка",
      item,
    ]);
    await replaceRows(client, "countdowns", userId, state.countdowns || [], (item) => [
      item.id,
      userId,
      item.title || "Событие",
      item.date || null,
      item,
    ]);
    await replaceHistory(client, userId, state.history || []);
    await replaceReminderEvents(client, userId, state.tasks || []);
    return { ok: true, updatedAt: new Date().toISOString() };
  });
}

async function replaceRows(client, table, userId, rows, mapRow) {
  await client.query(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
  for (const row of rows) {
    const values = mapRow(row);
    if (table === "lists") {
      await client.query(
        `INSERT INTO lists (id, user_id, name, color, data) VALUES ($1, $2, $3, $4, $5)`,
        values
      );
    } else if (table === "tags") {
      await client.query(
        `INSERT INTO tags (id, user_id, name, color, data) VALUES ($1, $2, $3, $4, $5)`,
        values
      );
    } else if (table === "habits") {
      await client.query(
        `INSERT INTO habits (id, user_id, name, data) VALUES ($1, $2, $3, $4)`,
        values
      );
    } else if (table === "countdowns") {
      await client.query(
        `INSERT INTO countdowns (id, user_id, title, event_date, data) VALUES ($1, $2, $3, $4, $5)`,
        values
      );
    }
  }
}

async function replaceTasks(client, userId, tasks) {
  await client.query("DELETE FROM tasks WHERE user_id = $1", [userId]);
  for (const task of tasks) {
    await client.query(
      `INSERT INTO tasks
       (id, user_id, title, list_id, section_id, done, trashed, priority, due, due_time, repeat_rule, reminders, assignee_id, data, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, COALESCE($15::timestamptz, now()), COALESCE($16::timestamptz, now()))`,
      [
        task.id,
        userId,
        task.title || "Без названия",
        task.listId || null,
        task.sectionId || null,
        Boolean(task.done),
        Boolean(task.trashed),
        Number(task.priority || 4),
        task.due || null,
        task.dueTime || null,
        task.repeat || null,
        JSON.stringify(task.reminders || []),
        task.assigneeId || null,
        task,
        task.createdAt || null,
        task.updatedAt || null,
      ]
    );
  }
}

async function replaceHistory(client, userId, rows) {
  await client.query("DELETE FROM history_events WHERE user_id = $1", [userId]);
  for (const item of rows.slice(0, 1000)) {
    await client.query(
      `INSERT INTO history_events (id, user_id, task_id, event_type, message, data, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, now()))`,
      [
        item.id,
        userId,
        item.taskId || null,
        item.type || "event",
        item.message || "Событие",
        item,
        item.at || null,
      ]
    );
  }
}

async function replaceReminderEvents(client, userId, tasks) {
  await client.query("DELETE FROM reminder_events WHERE user_id = $1 AND sent_at IS NULL", [userId]);
  for (const task of tasks) {
    if (task.done || task.trashed) continue;
    for (const reminder of task.reminders || []) {
      const dueAt = reminderToDate(task, reminder);
      if (!dueAt || dueAt.getTime() < Date.now() - 60_000) continue;
      await client.query(
        `INSERT INTO reminder_events (user_id, task_id, reminder_key, due_at, payload)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, task_id, reminder_key, due_at) DO NOTHING`,
        [
          userId,
          task.id,
          String(reminder),
          dueAt.toISOString(),
          {
            taskId: task.id,
            title: task.title,
            body: task.notes || "",
            due: task.due || "",
            dueTime: task.dueTime || "",
            priority: task.priority || 4,
            constantReminder: Boolean(task.constantReminder),
          },
        ]
      );
    }
  }
}

function reminderToDate(task, reminder) {
  const clean = String(reminder || "").trim();
  if (!clean) return null;
  if (/^\d{2}:\d{2}$/.test(clean)) {
    if (!task.due) return null;
    return buildDate(task.due, clean);
  }
  const full = clean.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})$/);
  if (full) return buildDate(full[1], full[2]);
  return null;
}

function buildDate(dateISO, time) {
  const [year, month, day] = dateISO.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}
