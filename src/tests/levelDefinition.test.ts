import { describe, expect, it } from "vitest";
import { CAMPAIGN_LEVELS } from "../level/LevelCatalog";
import { PILLAR_WORKS_LEVEL, TURBINE_SPINE_LEVEL, validateLevelDefinition } from "../level/LevelDefinition";

describe("level definition", () => {
  it("contains the expected progression checkpoints and a valid goal", () => {
    expect(validateLevelDefinition(PILLAR_WORKS_LEVEL)).toEqual([]);
    expect(PILLAR_WORKS_LEVEL.checkpoints.map((checkpoint) => checkpoint.id)).toEqual([
      "start",
      "landing",
      "puzzle",
      "tower"
    ]);
    expect(PILLAR_WORKS_LEVEL.goal.radius).toBeGreaterThan(0);
  });

  it("orders a tutorial and easy courses before the final Pillar Works ascent", () => {
    expect(CAMPAIGN_LEVELS.map((level) => level.id)).toEqual([
      "roll-training",
      "ramp-gardens",
      "momentum-plaza",
      "turbine-spine",
      "pillar-works"
    ]);
    expect(CAMPAIGN_LEVELS.slice(0, -1).every((level) => level.difficulty !== "FINAL")).toBe(true);
    expect(TURBINE_SPINE_LEVEL.difficulty).toBe("ADVANCED");
    expect(TURBINE_SPINE_LEVEL.entities.length).toBeGreaterThan(30);
    expect(TURBINE_SPINE_LEVEL.checkpoints).toHaveLength(7);
    const turbineSpan =
      Math.max(
        ...TURBINE_SPINE_LEVEL.entities.map((entity) => entity.position[0] + (entity.scale?.[0] ?? 1) * 0.5)
      ) -
      Math.min(
        ...TURBINE_SPINE_LEVEL.entities.map((entity) => entity.position[0] - (entity.scale?.[0] ?? 1) * 0.5)
      );
    expect(turbineSpan).toBeGreaterThan(240);
    expect(CAMPAIGN_LEVELS.at(-1)?.mechanics).toBe("pillar-works");
    expect(CAMPAIGN_LEVELS.every((level) => validateLevelDefinition(level).length === 0)).toBe(true);
    expect(CAMPAIGN_LEVELS[0].tutorial).toHaveLength(4);
  });

  it("rejects duplicate ids and non-positive geometry", () => {
    const malformed = {
      ...PILLAR_WORKS_LEVEL,
      entities: [
        ...PILLAR_WORKS_LEVEL.entities,
        { ...PILLAR_WORKS_LEVEL.entities[0], scale: [0, 1, 1] as [number, number, number] }
      ]
    };
    const errors = validateLevelDefinition(malformed);
    expect(errors.some((error) => error.includes("Duplicate entity id"))).toBe(true);
    expect(errors.some((error) => error.includes("positive scale"))).toBe(true);
  });
});
