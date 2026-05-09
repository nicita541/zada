import type { GameDevTemplate } from "./types";

export const gameDevTemplate: GameDevTemplate = {
  projectName: "Game Development Project",
  columns: ["Ideas", "Backlog", "Todo", "In Progress", "Testing", "Done"],
  conceptFields: [
    "Game title",
    "Genre",
    "Platforms",
    "Target audience",
    "Elevator pitch",
    "Core fantasy",
    "Gameplay loop",
    "Key mechanics",
    "Visual style",
    "References",
    "Risks",
    "MVP scope"
  ],
  gddSections: [
    "Overview",
    "Story",
    "World",
    "Characters",
    "Player Mechanics",
    "Combat",
    "Enemies",
    "Levels",
    "Items",
    "UI",
    "Audio",
    "Art Style",
    "Technical Notes",
    "Milestones",
    "Open Questions"
  ],
  defaultTaskGroups: [
    {
      title: "Core Mechanics",
      type: "feature",
      tasks: ["Define player movement", "Prototype interaction loop", "Create fail and win states"]
    },
    {
      title: "Player",
      type: "code",
      tasks: ["Implement controller", "Add input mapping", "Tune camera behavior"]
    },
    {
      title: "Enemies",
      type: "design",
      tasks: ["Define enemy archetypes", "Prototype first AI state", "Document combat counters"]
    },
    {
      title: "UI/UX",
      type: "ui",
      tasks: ["Create HUD wireframe", "Define pause menu", "List accessibility needs"]
    },
    {
      title: "Bugs",
      type: "bug",
      tasks: ["Set severity labels", "Create reproduction template", "Link bugs to builds"]
    },
    {
      title: "Milestones",
      type: "milestone",
      tasks: ["Prototype", "Vertical Slice", "Alpha", "Beta", "Release"]
    }
  ]
};

export function createGameDevOutline(projectName = gameDevTemplate.projectName): string {
  const lines = [`# Project: ${projectName}`, ""];

  gameDevTemplate.defaultTaskGroups.forEach((group, groupIndex) => {
    const groupNumber = groupIndex + 1;
    lines.push(`${groupNumber}. ${group.title} [${group.type}]`);
    group.tasks.forEach((task, taskIndex) => {
      lines.push(`  ${groupNumber}.${taskIndex + 1} ${task} [${group.type}]`);
    });
  });

  return lines.join("\n");
}
