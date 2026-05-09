import type { LocalNoteDraft, NoteSyncSettings, SyncStatus } from "./types";

export const defaultNoteSyncSettings: NoteSyncSettings = {
  notesEnabled: true,
  uploadLocalNotesOnEnable: false
};

export function nextNoteSyncStatus(settings: NoteSyncSettings, previous?: SyncStatus): SyncStatus {
  if (!settings.notesEnabled) {
    return "local_only";
  }

  if (previous === "error") {
    return "pending";
  }

  return "pending";
}

export function shouldQueueNoteForSync(note: Pick<LocalNoteDraft, "syncStatus">, settings: NoteSyncSettings): boolean {
  return settings.notesEnabled && note.syncStatus !== "local_only" && note.syncStatus !== "synced";
}

export function localOnlyNotes(notes: LocalNoteDraft[]): LocalNoteDraft[] {
  return notes.filter((note) => note.syncStatus === "local_only");
}
