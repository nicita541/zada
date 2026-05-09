import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { pool, withClient } from "./db.js";
import { getUserId, readSnapshot, saveSnapshot } from "./snapshot.js";
import { publicPushKey, saveSubscription, sendPushToUser, startReminderWorker } from "./notifications.js";

const app = express();
const port = Number(process.env.PORT || 3000);
const corsOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || origin === "null" || !corsOrigins.length || corsOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin is not allowed: ${origin}`));
      }
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "25mb" }));
app.use(morgan("tiny"));

app.get("/health", async (_req, res) => {
  await pool.query("SELECT 1");
  res.json({ ok: true, service: "taskbook-api", time: new Date().toISOString() });
});

app.get("/api/bootstrap", async (req, res) => {
  const userId = getUserId(req);
  const snapshot = await readSnapshot(userId);
  res.json({
    userId,
    state: snapshot?.state || null,
    updatedAt: snapshot?.updatedAt || null,
    pushPublicKey: publicPushKey(),
    serverTime: new Date().toISOString(),
  });
});

app.get("/api/snapshot", async (req, res) => {
  const snapshot = await readSnapshot(getUserId(req));
  res.json({ state: snapshot?.state || null, updatedAt: snapshot?.updatedAt || null });
});

app.put("/api/snapshot", async (req, res) => {
  if (!req.body?.state) return res.status(400).json({ error: "state is required" });
  const result = await saveSnapshot(getUserId(req), req.body.state);
  res.json(result);
});

app.get("/api/tasks", async (req, res) => {
  const userId = getUserId(req);
  const result = await withClient((client) =>
    client.query(
      `SELECT id, title, list_id, section_id, done, trashed, priority, due, due_time, repeat_rule, reminders, assignee_id, data, updated_at
       FROM tasks
       WHERE user_id = $1
       ORDER BY COALESCE(due, '9999-12-31'::date), priority, updated_at DESC`,
      [userId]
    )
  );
  res.json({ tasks: result.rows });
});

app.post("/api/push/subscribe", async (req, res) => {
  await saveSubscription(getUserId(req), req.body.subscription, req.header("user-agent") || "");
  res.json({ ok: true });
});

app.post("/api/push/test", async (req, res) => {
  const result = await sendPushToUser(getUserId(req), {
    title: "Задачник",
    body: req.body?.message || "Тестовое уведомление",
    data: {},
  });
  res.json(result);
});

app.get("/api/reminders", async (req, res) => {
  const userId = getUserId(req);
  const result = await withClient((client) =>
    client.query(
      `SELECT id, task_id, reminder_key, due_at, payload, sent_at
       FROM reminder_events
       WHERE user_id = $1
       ORDER BY due_at ASC
       LIMIT 200`,
      [userId]
    )
  );
  res.json({ reminders: result.rows });
});

app.post("/api/reminders/:id/ack", async (req, res) => {
  const userId = getUserId(req);
  const result = await withClient(async (client) => {
    const update = await client.query(
      `UPDATE reminder_events
       SET sent_at = COALESCE(sent_at, now())
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [req.params.id, userId]
    );
    if (update.rowCount) {
      await client.query(
        `INSERT INTO notification_log (user_id, reminder_event_id, channel, status, message)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, req.params.id, "desktop", "shown", req.body?.message || "Desktop notification shown"]
      );
    }
    return update.rowCount;
  });
  res.json({ ok: Boolean(result) });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "internal_error", message: error.message });
});

app.listen(port, () => {
  console.log(`Taskbook API listening on ${port}`);
  startReminderWorker();
});
