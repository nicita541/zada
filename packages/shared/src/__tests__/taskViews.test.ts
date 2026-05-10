import { describe, expect, it } from "vitest";
import { filterTasksForView, groupTodayTasksByDueDate, groupUpcomingTasksByDueDate } from "../taskViews";

const projects = [{ id: "project-1", name: "Release Plan" }];
const tasks = [
  { id: "overdue", title: "Fix launch bug", projectId: "project-1", dueDate: "2026-05-09", completed: false, tags: ["bug"], priority: "p1" },
  { id: "today", title: "Write notes", projectId: null, dueDate: "2026-05-10", completed: false, tags: ["docs"], priority: "p2" },
  { id: "later", title: "Polish board", projectId: "project-1", dueDate: "2026-05-14", completed: false, tags: ["ux"], priority: "p3" },
  { id: "no-date", title: "Inbox idea", projectId: null, dueDate: null, completed: false, tags: ["idea"], priority: null },
  { id: "done", title: "Closed task", projectId: "project-1", dueDate: "2026-05-10", completed: true, tags: [], priority: "p1" }
];

describe("task view helpers", () => {
  it("hides completed tasks by default and can filter completed tasks explicitly", () => {
    expect(filterTasksForView(tasks, projects, "", {}).map((task) => task.id)).toEqual(["overdue", "today", "later", "no-date"]);
    expect(filterTasksForView(tasks, projects, "", { status: "done" }).map((task) => task.id)).toEqual(["done"]);
  });

  it("searches by title, project name, and tag", () => {
    expect(filterTasksForView(tasks, projects, "release", { status: "all" }).map((task) => task.id)).toEqual([
      "overdue",
      "later",
      "done"
    ]);
    expect(filterTasksForView(tasks, projects, "bug", {}).map((task) => task.id)).toEqual(["overdue"]);
  });

  it("supports compact no-date and priority filters", () => {
    expect(filterTasksForView(tasks, projects, "", { noDate: true }).map((task) => task.id)).toEqual(["no-date"]);
    expect(filterTasksForView(tasks, projects, "", { priority: "p1" }).map((task) => task.id)).toEqual(["overdue"]);
  });

  it("groups today and upcoming tasks by due date", () => {
    const todayGroups = groupTodayTasksByDueDate(tasks, "2026-05-10");
    expect(todayGroups.overdue.map((task) => task.id)).toEqual(["overdue"]);
    expect(todayGroups.today.map((task) => task.id)).toEqual(["today", "done"]);
    expect(todayGroups.noDate.map((task) => task.id)).toEqual(["no-date"]);

    const upcomingGroups = groupUpcomingTasksByDueDate(tasks, new Date("2026-05-10T00:00:00.000Z"));
    expect(upcomingGroups.nextSeven.map((task) => task.id)).toEqual(["later"]);
    expect(upcomingGroups.later).toEqual([]);
  });
});
