import { describe, expect, it } from "vitest";
import { buildInternalLink, parseInternalLinks } from "../internalLinks";

describe("internal links", () => {
  it("parses supported link kinds", () => {
    const links = parseInternalLinks("[[Task: Implement attack]] and [[GDD: Combat]]");

    expect(links).toHaveLength(2);
    expect(links[0]).toMatchObject({ kind: "Task", target: "Implement attack" });
    expect(links[1]).toMatchObject({ kind: "GDD", target: "Combat" });
  });

  it("builds links", () => {
    expect(buildInternalLink("Snippet", "PlayerAttack")).toBe("[[Snippet: PlayerAttack]]");
  });
});
