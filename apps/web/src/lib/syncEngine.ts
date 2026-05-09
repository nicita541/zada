import { shouldQueueNoteForSync, type LocalNoteDraft, type SyncQueueItem } from "@zada/shared";
import { api } from "./api";
import { db } from "./db";

const serverOwnedEntities = new Set(["subscription", "premium_entitlement"]);

export async function runManualSync() {
  const noteSettings = (await db.note_sync_settings.get("notes")) ?? {
    id: "notes" as const,
    notesEnabled: true,
    uploadLocalNotesOnEnable: false
  };

  const queued = await db.sync_queue.toArray();
  const eligible = queued.filter((item) => isEligibleForSync(item, noteSettings));

  if (eligible.length === 0) {
    return { pushed: 0 };
  }

  await api.syncPush(eligible);
  await db.sync_queue.bulkDelete(eligible.map((item) => item.id));
  return { pushed: eligible.length };
}

function isEligibleForSync(
  item: SyncQueueItem,
  noteSettings: { notesEnabled: boolean; uploadLocalNotesOnEnable: boolean }
): boolean {
  if (serverOwnedEntities.has(item.entityType)) {
    return false;
  }

  if (item.entityType !== "note") {
    return true;
  }

  return shouldQueueNoteForSync(item.payload as Pick<LocalNoteDraft, "syncStatus">, noteSettings);
}
