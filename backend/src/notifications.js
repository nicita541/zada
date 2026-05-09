import webpush from "web-push";
import { withClient } from "./db.js";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && !VAPID_PRIVATE_KEY.includes("replace")) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export function publicPushKey() {
  return VAPID_PRIVATE_KEY.includes("replace") ? "" : VAPID_PUBLIC_KEY;
}

export async function saveSubscription(userId, subscription, userAgent = "") {
  if (!subscription?.endpoint) throw new Error("Invalid push subscription");
  await withClient(async (client) => {
    await client.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, subscription, user_agent, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (endpoint) DO UPDATE SET subscription = EXCLUDED.subscription, user_agent = EXCLUDED.user_agent, updated_at = now()`,
      [userId, subscription.endpoint, subscription, userAgent]
    );
  });
}

export async function sendPushToUser(userId, payload) {
  if (VAPID_PRIVATE_KEY.includes("replace")) {
    return { sent: 0, skipped: true, reason: "VAPID keys are not configured" };
  }

  return withClient(async (client) => {
    const result = await client.query("SELECT id, subscription FROM push_subscriptions WHERE user_id = $1", [userId]);
    let sent = 0;
    for (const row of result.rows) {
      try {
        await webpush.sendNotification(row.subscription, JSON.stringify(payload));
        sent += 1;
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          await client.query("DELETE FROM push_subscriptions WHERE id = $1", [row.id]);
        }
      }
    }
    return { sent };
  });
}

export async function processDueReminders() {
  return withClient(async (client) => {
    const events = await client.query(
      `SELECT id, user_id, task_id, payload
       FROM reminder_events
       WHERE sent_at IS NULL AND due_at <= now()
       ORDER BY due_at ASC
       LIMIT 100`
    );

    for (const event of events.rows) {
      const payload = {
        title: "Задачник",
        body: event.payload?.title || "Напоминание",
        data: { taskId: event.task_id },
      };
      const result = await sendPushToUser(event.user_id, payload);
      await client.query("UPDATE reminder_events SET sent_at = now() WHERE id = $1", [event.id]);
      await client.query(
        `INSERT INTO notification_log (user_id, reminder_event_id, channel, status, message)
         VALUES ($1, $2, $3, $4, $5)`,
        [event.user_id, event.id, "push", result.skipped ? "skipped" : "sent", JSON.stringify(result)]
      );
    }

    return { processed: events.rowCount };
  });
}

export function startReminderWorker() {
  const intervalMs = Number(process.env.REMINDER_INTERVAL_MS || 30_000);
  setInterval(() => {
    processDueReminders().catch((error) => {
      console.error("Reminder worker failed", error);
    });
  }, intervalMs).unref();
}
