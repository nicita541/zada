import { describe, expect, it } from "vitest";
import { parseTaskOutline } from "../taskOutlineParser";

describe("parseTaskOutline", () => {
  it("parses numbered hierarchy, tags, priority, dates and task types", () => {
    const result = parseTaskOutline(`# Project: RPG Demo

1. Player (Main playable character.)
  1.1 Implement movement (WASD, run, jump.) #player #movement p1 due:2026-05-10 [code]
  1.2 Implement attack #combat p2 [feature]
    1.2.1 Add hitbox #combat [bug]
`);

    expect(result.projectName).toBe("RPG Demo");
    expect(result.errors).toEqual([]);
    expect(result.items).toHaveLength(4);
    expect(result.items[1]).toMatchObject({
      title: "Implement movement",
      description: "WASD, run, jump.",
      priority: "p1",
      dueDate: "2026-05-10",
      type: "code",
      tags: ["player", "movement"]
    });
    expect(result.items[3]?.parentId).toBe(result.items[2]?.id);
    expect(result.tree[0]?.children[1]?.children[0]?.title).toBe("Add hitbox");
  });

  it("parses bullets and checkboxes", () => {
    const result = parseTaskOutline(`- [ ] Create concept #design
  - [x] Draft pitch [design]
`);

    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.completed).toBe(false);
    expect(result.items[1]?.completed).toBe(true);
    expect(result.items[1]?.parentId).toBe(result.items[0]?.id);
  });
});
