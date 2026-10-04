import { describe, expect, it } from "vitest";
import { CampaignProgress, type CampaignStorage } from "../level/CampaignProgress";

function createMemoryStorage(): CampaignStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
}

describe("campaign progress", () => {
  it("locks the final ascent until every introductory course is complete", () => {
    const storage = createMemoryStorage();
    const progress = new CampaignProgress({ storage });

    expect(progress.isUnlocked("roll-training")).toBe(true);
    expect(progress.isUnlocked("ramp-gardens")).toBe(false);
    expect(progress.isUnlocked("pillar-works")).toBe(false);

    expect(progress.complete("roll-training")?.id).toBe("ramp-gardens");
    expect(progress.isUnlocked("ramp-gardens")).toBe(true);
    expect(progress.isUnlocked("momentum-plaza")).toBe(false);

    progress.complete("ramp-gardens");
    expect(progress.isUnlocked("momentum-plaza")).toBe(true);
    progress.complete("momentum-plaza");
    expect(progress.isUnlocked("turbine-spine")).toBe(true);
    expect(progress.isUnlocked("pillar-works")).toBe(false);
    progress.complete("turbine-spine");
    expect(progress.isUnlocked("pillar-works")).toBe(true);
  });

  it("restores completed courses from local storage", () => {
    const storage = createMemoryStorage();
    const firstSession = new CampaignProgress({ storage });
    firstSession.complete("roll-training");

    const restored = new CampaignProgress({ storage });
    expect(restored.isCompleted("roll-training")).toBe(true);
    expect(restored.isUnlocked("ramp-gardens")).toBe(true);
  });
});
