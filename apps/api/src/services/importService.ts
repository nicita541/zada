import type { TaskOutlineItem } from "@zada/shared";
import { gameDevTemplate, parseTaskOutline } from "@zada/shared";
import { prisma } from "../prisma";
import { optionalDate } from "../utils/date";

export function previewTaskOutline(source: string) {
  return parseTaskOutline(source);
}

export async function confirmTaskOutlineImport(userId: string, source: string) {
  const preview = parseTaskOutline(source);
  if (preview.errors.length > 0) {
    return { preview, imported: false };
  }

  const workspace = await ensurePersonalWorkspace(userId);
  const project = await prisma.project.create({
    data: {
      userId,
      workspaceId: workspace.id,
      name: preview.projectName ?? "Imported Project",
      type: "standard"
    }
  });

  const createdByImportId = new Map<string, string>();
  for (const item of preview.items) {
    const task = await createTaskFromImportItem(userId, workspace.id, project.id, item, createdByImportId);
    createdByImportId.set(item.id, task.id);
  }

  return {
    preview,
    imported: true,
    projectId: project.id,
    taskCount: preview.items.length
  };
}

export async function createGameDevProject(userId: string, projectName = gameDevTemplate.projectName) {
  const workspace = await ensurePersonalWorkspace(userId);
  const project = await prisma.project.create({
    data: {
      userId,
      workspaceId: workspace.id,
      name: projectName,
      type: "game_dev",
      columns: {
        create: gameDevTemplate.columns.map((name, position) => ({
          userId,
          workspaceId: workspace.id,
          name,
          position
        }))
      },
      milestones: {
        create: ["Prototype", "Vertical Slice", "Alpha", "Beta", "Release"].map((name) => ({
          userId,
          workspaceId: workspace.id,
          name
        }))
      },
      notes: {
        create: [
          {
            userId,
            workspaceId: workspace.id,
            title: "Game Concept",
            content: gameDevTemplate.conceptFields.map((field) => `## ${field}\n`).join("\n"),
            syncStatus: "pending"
          },
          {
            userId,
            workspaceId: workspace.id,
            title: "Game Design Document",
            content: gameDevTemplate.gddSections.map((section) => `## ${section}\n`).join("\n"),
            syncStatus: "pending"
          }
        ]
      }
    }
  });

  return project;
}

async function createTaskFromImportItem(
  userId: string,
  workspaceId: string,
  projectId: string,
  item: TaskOutlineItem,
  createdByImportId: Map<string, string>
) {
  const task = await prisma.task.create({
    data: {
      userId,
      workspaceId,
      projectId,
      parentId: item.parentId ? createdByImportId.get(item.parentId) ?? null : null,
      title: item.title,
      description: item.description,
      status: item.completed ? "done" : "todo",
      type: item.type,
      priority: item.priority,
      dueDate: optionalDate(item.dueDate),
      startDate: optionalDate(item.startDate),
      time: item.time,
      repeat: item.repeat,
      remindAt: optionalDate(item.remindAt),
      position: item.sourceLine
    }
  });

  for (const tagName of item.tags) {
    const tag = await prisma.tag.upsert({
      where: { userId_workspaceId_name: { userId, workspaceId, name: tagName } },
      update: {},
      create: { userId, workspaceId, name: tagName }
    });
    await prisma.taskTag.create({ data: { taskId: task.id, tagId: tag.id } });
  }

  return task;
}

async function ensurePersonalWorkspace(userId: string) {
  const existing = await prisma.workspace.findFirst({
    where: { userId, deletedAt: null },
    orderBy: { createdAt: "asc" }
  });

  if (existing) {
    return existing;
  }

  return prisma.workspace.create({
    data: {
      userId,
      name: "Personal"
    }
  });
}
