import {
  MOMENTUM_PLAZA_LEVEL,
  PILLAR_WORKS_LEVEL,
  RAMP_GARDENS_LEVEL,
  ROLL_TRAINING_LEVEL,
  TURBINE_SPINE_LEVEL,
  type LevelDefinition
} from "./LevelDefinition";

/** Ordered campaign progression: learn the ball first, then face the full machine. */
export const CAMPAIGN_LEVELS = [
  ROLL_TRAINING_LEVEL,
  RAMP_GARDENS_LEVEL,
  MOMENTUM_PLAZA_LEVEL,
  TURBINE_SPINE_LEVEL,
  PILLAR_WORKS_LEVEL
] as const satisfies readonly LevelDefinition[];

export type CampaignLevelId = (typeof CAMPAIGN_LEVELS)[number]["id"];

export const DEFAULT_LEVEL_ID: CampaignLevelId = ROLL_TRAINING_LEVEL.id;

export function getCampaignLevel(levelId: string): LevelDefinition | undefined {
  return CAMPAIGN_LEVELS.find((level) => level.id === levelId);
}

export function getNextCampaignLevel(levelId: string): LevelDefinition | undefined {
  const index = CAMPAIGN_LEVELS.findIndex((level) => level.id === levelId);
  return index >= 0 ? CAMPAIGN_LEVELS[index + 1] : undefined;
}
