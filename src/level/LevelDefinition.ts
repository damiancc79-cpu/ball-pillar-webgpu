export type SurfaceId =
  "concrete" | "rustedMetal" | "polishedMetal" | "rubber" | "ice" | "sandCoatedMetal" | "energy";

export interface LevelEntityDefinition {
  id: string;
  type: string;
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  material?: SurfaceId;
  physics?: Record<string, number | boolean | string>;
  properties?: Record<string, number | boolean | string>;
}

export interface CheckpointDefinition {
  id: string;
  name: string;
  position: [number, number, number];
  radius: number;
}

export type TutorialAdvanceTrigger = "move" | "jump" | "brake" | "checkpoint" | "goal";

export interface TutorialStepDefinition {
  id: string;
  title: string;
  body: string;
  advanceOn: TutorialAdvanceTrigger;
}

export type LevelDifficulty = "TUTORIAL" | "EASY" | "ADVANCED" | "FINAL";
export type LevelMechanics = "none" | "turbine-spine" | "pillar-works";

export interface LevelDefinition {
  id: string;
  name: string;
  subtitle?: string;
  objective?: string;
  difficulty?: LevelDifficulty;
  mechanics?: LevelMechanics;
  spawn: [number, number, number];
  entities: LevelEntityDefinition[];
  checkpoints: CheckpointDefinition[];
  goal: { position: [number, number, number]; radius: number };
  tutorial?: readonly TutorialStepDefinition[];
}

const beam = (
  id: string,
  position: [number, number, number],
  scale: [number, number, number],
  material: SurfaceId = "rustedMetal",
  rotation?: [number, number, number]
): LevelEntityDefinition => ({ id, type: "beam", position, scale, material, rotation });

const pillar = (id: string, position: [number, number, number], height = 14): LevelEntityDefinition => ({
  id,
  type: "pillar",
  position,
  scale: [1.35, height, 1.35],
  material: "concrete"
});

/** A broad onboarding route that teaches each input without punishing misses. */
export const ROLL_TRAINING_LEVEL: LevelDefinition = {
  id: "roll-training",
  name: "ROLL TRAINING // SECTOR 00",
  subtitle: "LEARN THE SIGNAL",
  objective: "ROLL, JUMP, BRAKE, THEN REACH THE AMBER EXIT.",
  difficulty: "TUTORIAL",
  mechanics: "none",
  spawn: [0, 1.1, 0],
  entities: [
    beam("training-start", [0, 0, 0], [14, 1, 14], "concrete"),
    beam("training-roll-lane", [12, 0, 0], [10, 1, 12], "concrete"),
    beam("training-brake-bay", [22, 0, 0], [10, 1, 12], "rubber"),
    beam("training-jump-runup", [32, 0, 0], [7, 1, 12], "sandCoatedMetal"),
    beam("training-jump-landing", [42, 0, 0], [10, 1, 14], "rubber"),
    beam("training-goal-deck", [54, 0, 0], [12, 1, 14], "energy"),
    pillar("training-support-start", [0, -4, 0], 8),
    pillar("training-support-brake", [22, -4, 0], 8),
    pillar("training-support-landing", [42, -4, 0], 8),
    pillar("training-support-goal", [54, -4, 0], 8)
  ],
  checkpoints: [
    { id: "start", name: "ROLL BAY", position: [0, 1.2, 0], radius: 6 },
    { id: "brake", name: "BRAKE BAY", position: [22, 1.2, 0], radius: 5 },
    { id: "runup", name: "JUMP RUN-UP", position: [32, 1.2, 0], radius: 4.6 },
    { id: "landing", name: "WIDE LANDING", position: [42, 1.2, 0], radius: 5 }
  ],
  goal: { position: [54, 1.3, 0], radius: 3.6 },
  tutorial: [
    {
      id: "roll",
      title: "1/4 // ROLL",
      body: "WASD OR LEFT STICK FOLLOWS THE CAMERA.",
      advanceOn: "move"
    },
    {
      id: "jump",
      title: "2/4 // JUMP",
      body: "PRESS SPACE, A, OR THE JUMP BUTTON TO HOP A GAP.",
      advanceOn: "jump"
    },
    {
      id: "brake",
      title: "3/4 // BRAKE",
      body: "PRESS X OR LEFT TRIGGER TO STABILIZE BEFORE A LANDING.",
      advanceOn: "brake"
    },
    {
      id: "exit",
      title: "4/4 // EXIT",
      body: "FOLLOW THE AMBER SIGNAL TO COMPLETE TRAINING.",
      advanceOn: "goal"
    }
  ]
};

/** Gentle turns, broad pads, and surface changes without gaps or moving hazards. */
export const RAMP_GARDENS_LEVEL: LevelDefinition = {
  id: "ramp-gardens",
  name: "RAMP GARDENS // SECTOR 01",
  subtitle: "WIDE LINES, SOFT EDGES",
  objective: "PRACTISE CAMERA-RELATIVE STEERING ACROSS WIDE TERRACES.",
  difficulty: "EASY",
  mechanics: "none",
  spawn: [0, 1.1, 0],
  entities: [
    beam("garden-start", [0, 0, 0], [14, 1, 14], "concrete"),
    beam("garden-east", [12, 0, 0], [12, 1, 14], "sandCoatedMetal"),
    beam("garden-turn-a", [23, 0, 4], [12, 1, 14], "concrete"),
    beam("garden-turn-b", [31, 0, 11], [14, 1, 14], "rubber"),
    beam("garden-north", [43, 0, 11], [12, 1, 14], "concrete"),
    beam("garden-summit", [55, 0, 11], [14, 1, 14], "energy"),
    pillar("garden-support-start", [0, -4, 0], 8),
    pillar("garden-support-turn", [31, -4, 11], 8),
    pillar("garden-support-summit", [55, -4, 11], 8)
  ],
  checkpoints: [
    { id: "start", name: "LOW TERRACE", position: [0, 1.2, 0], radius: 6 },
    { id: "east", name: "EAST GARDEN", position: [23, 1.2, 4], radius: 5 },
    { id: "turn", name: "SOFT TURN", position: [31, 1.2, 11], radius: 5 },
    { id: "summit", name: "GARDEN SUMMIT", position: [55, 1.2, 11], radius: 5.5 }
  ],
  goal: { position: [55, 1.3, 11], radius: 3.6 }
};

/** A low-risk run-up and landing course before the final machinery. */
export const MOMENTUM_PLAZA_LEVEL: LevelDefinition = {
  id: "momentum-plaza",
  name: "MOMENTUM PLAZA // SECTOR 02",
  subtitle: "A SAFE RUN-UP",
  objective: "PRACTISE JUMPS, BOOSTS, AND SOFT LANDINGS ON WIDE PADS.",
  difficulty: "EASY",
  mechanics: "none",
  spawn: [0, 1.1, 0],
  entities: [
    beam("plaza-start", [0, 0, 0], [14, 1, 14], "concrete"),
    beam("plaza-control", [12, 0, 0], [10, 1, 12], "concrete"),
    beam("plaza-runup", [23, 0, 0], [10, 1, 12], "sandCoatedMetal"),
    beam("plaza-landing", [36, 0, 0], [12, 1, 14], "rubber"),
    beam("plaza-turn", [46, 0, 8], [14, 1, 14], "concrete"),
    beam("plaza-finish", [46, 0, 22], [14, 1, 14], "energy"),
    pillar("plaza-support-start", [0, -4, 0], 8),
    pillar("plaza-support-runup", [23, -4, 0], 8),
    pillar("plaza-support-landing", [36, -4, 0], 8),
    pillar("plaza-support-finish", [46, -4, 22], 8)
  ],
  checkpoints: [
    { id: "start", name: "CONTROL DECK", position: [0, 1.2, 0], radius: 6 },
    { id: "runup", name: "MOMENTUM BAY", position: [23, 1.2, 0], radius: 5 },
    { id: "landing", name: "SOFT LANDING", position: [36, 1.2, 0], radius: 5 },
    { id: "turn", name: "TURN DECK", position: [46, 1.2, 8], radius: 5 }
  ],
  goal: { position: [46, 1.3, 22], radius: 3.6 }
};

/** A longer advanced route that layers timing, precision, momentum, and recovery checkpoints. */
export const TURBINE_SPINE_LEVEL: LevelDefinition = {
  id: "turbine-spine",
  name: "TURBINE SPINE // SECTOR 03",
  subtitle: "FIVE DISTRICTS, ONE ASCENT",
  objective: "LINK THE LIFT, ROTOR, SWING ARM, BOOST VAULT, AND SIGNAL SPIRE.",
  difficulty: "ADVANCED",
  mechanics: "turbine-spine",
  spawn: [0, 1.1, 0],
  entities: [
    // 01 — Intake yard: a broad reset zone before the timed transfer.
    beam("spine-arrival", [0, 0, 0], [16, 1, 16], "concrete"),
    beam("spine-intake", [14, 0, 0], [12, 1, 14], "sandCoatedMetal"),
    beam("spine-stabilizer", [26, 0, 0], [12, 1, 14], "rubber"),
    beam("spine-lift-ramp", [33.5, 0.5, 0], [5, 1, 12], "sandCoatedMetal", [0, 0, -0.18]),
    beam("spine-transfer-dock", [40, 1, 0], [8, 1, 12], "concrete"),
    beam("spine-east-dock", [62, 1.2, 0], [10, 1, 12], "rubber"),
    pillar("spine-support-arrival", [0, -5.5, 0], 10),
    pillar("spine-support-transfer", [40, -5.5, 0], 12),
    pillar("spine-support-east-dock", [62, -6.3, 0], 14),

    // 02 — Turbine plaza: the arena is broad, but the rotating arm punishes rushing.
    beam("spine-turbine-runup", [74, 1.2, 0], [10, 1, 12], "sandCoatedMetal"),
    beam("spine-turbine-arena", [85, 1.2, 0], [10, 1, 10], "polishedMetal"),
    beam("spine-turbine-exit", [98, 1.25, 0], [12, 1, 12], "rubber"),
    beam("spine-turbine-bypass", [85, 1.25, 5.5], [10, 1, 2.5], "concrete"),
    pillar("spine-support-turbine", [85, -6.3, 0], 14),
    pillar("spine-support-exit", [98, -6.25, 0], 14),

    // 03 — Switchback gallery: short diagonal hops under a pendulum, followed by a reset deck.
    beam("spine-gallery-link", [106, 1.45, 0], [4, 0.8, 7], "concrete"),
    beam("spine-gallery-yard", [113, 1.7, 0], [14, 1, 14], "concrete"),
    beam("spine-switchback-a", [121, 2.6, 4], [7, 0.8, 5], "sandCoatedMetal", [0, 0, -0.14]),
    beam("spine-switchback-b", [128, 3.8, -3], [7, 0.8, 5], "polishedMetal", [0, 0, -0.14]),
    beam("spine-switchback-c", [135, 5, 4], [7, 0.8, 5], "sandCoatedMetal", [0, 0, -0.14]),
    beam("spine-switchback-crest", [146, 5.8, 0], [14, 1, 14], "rubber"),
    pillar("spine-support-gallery", [113, -6.4, 0], 15),
    pillar("spine-support-crest", [146, -4.7, 0], 20),

    // 04 — Boost vault: a fast high arc is optional; the moving side route is safer but slower.
    beam("spine-vault-runup", [160, 5.8, 0], [14, 1, 10], "sandCoatedMetal"),
    beam("spine-launch-array", [164, 6.35, 0], [4, 0.3, 4], "energy"),
    beam("spine-service-ledge", [169, 6.7, 7], [6, 0.8, 5], "concrete"),
    beam("spine-service-catch", [182, 8.6, 4], [7, 0.8, 6], "polishedMetal"),
    beam("spine-vault-landing", [181, 9, 0], [14, 1, 14], "rubber"),
    pillar("spine-support-vault", [181, -5, 0], 27),

    // 05 — Signal spire: a final narrow three-step climb after the last recovery checkpoint.
    beam("spine-spire-link", [190, 9, 0], [4, 1, 7], "concrete"),
    beam("spine-spire-base", [198, 9, 0], [14, 1, 14], "concrete"),
    beam("spine-spire-runup", [209, 10, 0], [8, 0.9, 8], "sandCoatedMetal", [0, 0, -0.12]),
    beam("spine-needle-a", [218, 10.8, -3], [6, 0.8, 3], "polishedMetal", [0, 0, -0.18]),
    beam("spine-needle-b", [224, 11.6, 3], [6, 0.8, 3], "polishedMetal", [0, 0, -0.18]),
    beam("spine-needle-c", [230, 12.4, -2], [6, 0.8, 3], "sandCoatedMetal", [0, 0, -0.18]),
    beam("spine-goal-deck", [240, 13.2, 0], [14, 1, 14], "energy"),
    pillar("spine-support-base", [198, -5, 0], 27),
    pillar("spine-support-goal", [240, -2.3, 0], 30)
  ],
  checkpoints: [
    { id: "start", name: "ARRIVAL BAY", position: [0, 1.2, 0], radius: 6 },
    { id: "transfer", name: "TRANSFER DOCK", position: [40, 2.1, 0], radius: 5 },
    { id: "rotor", name: "ROTOR GATE", position: [98, 2.35, 0], radius: 5 },
    { id: "gallery", name: "SWING GATE", position: [113, 2.8, 0], radius: 5 },
    { id: "crest", name: "SWITCHBACK CREST", position: [146, 6.9, 0], radius: 5.5 },
    { id: "vault", name: "VAULT LANDING", position: [181, 10.1, 0], radius: 5.5 },
    { id: "spire", name: "SIGNAL SPIRE", position: [198, 10.1, 0], radius: 5 }
  ],
  goal: { position: [240, 14.3, 0], radius: 3.8 }
};

/** The dense final course: machinery stays visible from nearby routes and the tower is always a landmark. */
export const PILLAR_WORKS_LEVEL: LevelDefinition = {
  id: "pillar-works",
  name: "PILLAR WORKS // FINAL ASCENT",
  subtitle: "THE FULL MACHINE",
  objective: "MASTER THE MACHINERY, COUNTERWEIGHTS, AND FINAL TOWER.",
  difficulty: "FINAL",
  mechanics: "pillar-works",
  spawn: [0, 2.4, 0],
  entities: [
    // Start deck and first bridge.
    beam("start-deck", [0, 0, 0], [9, 1, 8], "concrete"),
    beam("start-ramp", [5, 0.5, -2], [4, 1, 3], "sandCoatedMetal", [0, 0, -0.12]),
    beam("bridge-a", [8, 1.2, -3.5], [4.6, 0.55, 1.4]),
    beam("bridge-b", [16, 2.5, -3.5], [4.1, 0.55, 1.25]),
    beam("bridge-c", [23, 3.5, -1], [3, 0.55, 1.25], "rustedMetal", [0, 0.35, 0]),
    pillar("pillar-a", [7, -5.5, -3.5]),
    pillar("pillar-b", [16, -4.2, -3.5]),
    pillar("pillar-c", [23, -3.2, -1]),
    // Momentum gap and forgiving route.
    beam("run-up", [29, 3.7, -0.5], [7, 0.7, 2.5], "sandCoatedMetal", [0, 0, -0.1]),
    beam("landing", [42, 5.4, -0.5], [6, 0.7, 4], "rubber"),
    beam("safe-route-a", [29, 1.5, 6], [6, 0.7, 2.1], "concrete"),
    beam("safe-route-b", [37, 3.5, 6], [4.8, 0.7, 2.1], "concrete", [0, 0, -0.12]),
    beam("safe-route-c", [42, 5.1, 3.7], [3.6, 0.7, 2.2], "concrete", [0, 0.48, 0]),
    pillar("pillar-landing", [42, -2.5, -0.5], 18),
    pillar("pillar-safe-a", [29, -6, 6]),
    pillar("pillar-safe-b", [37, -4, 6]),
    // Mechanical crossing.
    beam("mechanical-deck", [51, 5.2, -0.5], [5.4, 0.75, 5], "polishedMetal"),
    beam("machinery-landing", [65, 6, -0.5], [5.5, 0.75, 4], "rustedMetal"),
    pillar("pillar-machine", [51, -2.5, -0.5], 18),
    pillar("pillar-machine-2", [65, -1.7, -0.5], 20),
    // Puzzle chamber.
    beam("puzzle-deck", [73, 6.2, -0.5], [8, 0.75, 7], "concrete"),
    beam("friction-concrete", [96, 8.8, -0.5], [4, 0.65, 2], "concrete"),
    beam("friction-ice", [103, 8.8, -0.5], [4, 0.65, 2], "ice"),
    beam("friction-rubber", [110, 8.8, -0.5], [4, 0.65, 2], "rubber"),
    beam("friction-metal", [117, 8.8, -0.5], [4, 0.65, 2], "polishedMetal"),
    pillar("pillar-puzzle", [73, -1.8, -0.5], 20),
    pillar("pillar-bridge", [86, 0.8, -0.5], 20),
    // Visible high-risk shortcut.
    beam("shortcut-a", [94, 13.5, -8], [9, 0.45, 0.9], "polishedMetal", [0, 0.1, 0]),
    beam("shortcut-b", [108, 14.5, -7], [7, 0.45, 0.9], "polishedMetal", [0, 0.18, 0]),
    // Final tower lift and goal deck.
    beam("tower-base", [126, 9.2, -0.5], [6, 0.75, 5], "rustedMetal"),
    beam("tower-ramp-a", [133, 12, -0.5], [5, 0.65, 1.5], "sandCoatedMetal", [0, 0, -0.38]),
    beam("tower-ramp-b", [140, 16, -0.5], [5, 0.65, 1.5], "sandCoatedMetal", [0, 0, -0.42]),
    beam("goal-deck", [147, 19.8, -0.5], [6, 0.75, 6], "energy"),
    pillar("tower-pillar-a", [126, 0, -0.5], 22),
    pillar("tower-pillar-b", [140, 6.6, -0.5], 20),
    pillar("tower-pillar-c", [147, 10.4, -0.5], 20)
  ],
  checkpoints: [
    { id: "start", name: "START PLATFORM", position: [0, 2.4, 0], radius: 5 },
    { id: "landing", name: "MOMENTUM LANDING", position: [42, 7.5, -0.5], radius: 5 },
    { id: "puzzle", name: "COUNTERWEIGHT BAY", position: [73, 8.1, -0.5], radius: 5 },
    { id: "tower", name: "FINAL TOWER", position: [126, 11, -0.5], radius: 5 }
  ],
  goal: { position: [147, 22, -0.5], radius: 3.2 }
};

export function validateLevelDefinition(level: LevelDefinition): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const checkpointIds = new Set<string>();
  const tutorialIds = new Set<string>();
  const hasFiniteVector = (vector: readonly number[]): boolean =>
    vector.length === 3 && vector.every((value) => Number.isFinite(value));
  if (!hasFiniteVector(level.spawn)) errors.push("Level spawn must contain three finite coordinates.");
  if (!hasFiniteVector(level.goal.position)) errors.push("Level goal must contain three finite coordinates.");
  if (!Number.isFinite(level.goal.radius) || level.goal.radius <= 0)
    errors.push("Level goal requires a positive radius.");
  for (const entity of level.entities) {
    if (ids.has(entity.id)) errors.push(`Duplicate entity id: ${entity.id}`);
    ids.add(entity.id);
    if (!entity.scale || entity.scale.some((value) => value <= 0))
      errors.push(`Entity ${entity.id} requires a positive scale.`);
    if (!hasFiniteVector(entity.position)) errors.push(`Entity ${entity.id} requires finite coordinates.`);
  }
  if (level.checkpoints.length === 0) {
    errors.push("Level requires at least one checkpoint.");
  }
  for (const checkpoint of level.checkpoints) {
    if (checkpointIds.has(checkpoint.id)) errors.push(`Duplicate checkpoint id: ${checkpoint.id}`);
    checkpointIds.add(checkpoint.id);
    if (!hasFiniteVector(checkpoint.position))
      errors.push(`Checkpoint ${checkpoint.id} requires finite coordinates.`);
    if (!Number.isFinite(checkpoint.radius) || checkpoint.radius <= 0)
      errors.push(`Checkpoint ${checkpoint.id} requires a positive radius.`);
  }
  for (const step of level.tutorial ?? []) {
    if (tutorialIds.has(step.id)) errors.push(`Duplicate tutorial id: ${step.id}`);
    tutorialIds.add(step.id);
    if (!step.title.trim() || !step.body.trim()) errors.push(`Tutorial ${step.id} requires title and body.`);
  }
  return errors;
}
