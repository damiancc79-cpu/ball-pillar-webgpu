import {
  BoxGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  Quaternion,
  Scene,
  Vector3
} from "three";
import { createRetroMaterial } from "../shaders/retroNodes";
import type { SurfaceId } from "./LevelDefinition";
import type { LevelDefinition } from "./LevelDefinition";

export interface StaticBoxRequest {
  id: string;
  position: Vector3;
  size: Vector3;
  rotation: Vector3;
  surface: SurfaceId;
}

export interface LevelBuildHooks {
  addStaticBox(request: StaticBoxRequest): void;
}

export interface CheckpointMarker {
  id: string;
  name: string;
  position: Vector3;
  radius: number;
  visual: Group;
}

export interface LevelRuntime {
  root: Group;
  checkpoints: CheckpointMarker[];
  goalPosition: Vector3;
  goalRadius: number;
  update(timeSeconds: number): void;
}

const surfaceColors: Record<SurfaceId, string> = {
  concrete: "#695b58",
  rustedMetal: "#6f3e2b",
  polishedMetal: "#3d4653",
  rubber: "#332d35",
  ice: "#a5c9e4",
  sandCoatedMetal: "#886032",
  energy: "#e6a029"
};

const tempMatrix = new Matrix4();
const tempQuaternion = new Quaternion();
const tempScale = new Vector3();

function addRivetBand(target: Group, width: number, depth: number): void {
  const rivetMaterial = new MeshStandardMaterial({ color: "#231d20", roughness: 0.9, metalness: 0.45 });
  const rivetGeometry = new CylinderGeometry(0.07, 0.07, 0.08, 6);
  for (const x of [-width * 0.37, 0, width * 0.37]) {
    for (const z of [-depth * 0.37, depth * 0.37]) {
      const rivet = new Mesh(rivetGeometry, rivetMaterial);
      rivet.rotation.x = Math.PI / 2;
      rivet.position.set(x, 0.36, z);
      target.add(rivet);
    }
  }
}

function createCheckpointVisual(): Group {
  const root = new Group();
  const ringMaterial = new MeshStandardMaterial({
    color: "#ffbe52",
    emissive: new Color("#a84408"),
    emissiveIntensity: 1.3,
    metalness: 0.4,
    roughness: 0.42
  });
  const postMaterial = createRetroMaterial("#593822", 0.85, 0.35);
  const post = new Mesh(new CylinderGeometry(0.22, 0.35, 3.1, 6), postMaterial);
  post.position.y = 1.55;
  const ring = new Mesh(new CylinderGeometry(1.05, 1.05, 0.12, 12, 1, true), ringMaterial);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 2.1;
  root.add(post, ring);
  return root;
}

export class LevelBuilder {
  build(scene: Scene, hooks: LevelBuildHooks, definition: LevelDefinition): LevelRuntime {
    const root = new Group();
    root.name = definition.name;
    scene.add(root);

    const materials = new Map<SurfaceId, MeshStandardMaterial | ReturnType<typeof createRetroMaterial>>();
    const getMaterial = (
      surface: SurfaceId
    ): MeshStandardMaterial | ReturnType<typeof createRetroMaterial> => {
      const existing = materials.get(surface);
      if (existing) return existing;
      const material =
        surface === "energy"
          ? new MeshStandardMaterial({
              color: surfaceColors[surface],
              emissive: "#b9420b",
              emissiveIntensity: 1.8,
              metalness: 0.3,
              roughness: 0.22
            })
          : createRetroMaterial(
              surfaceColors[surface],
              surface === "ice" ? 0.12 : surface === "polishedMetal" ? 0.3 : 0.86,
              surface === "concrete" || surface === "rubber" ? 0.05 : 0.55
            );
      materials.set(surface, material);
      return material;
    };

    for (const entity of definition.entities) {
      const [width, height, depth] = entity.scale ?? [1, 1, 1];
      const position = new Vector3(...entity.position);
      const rotation = new Vector3(...(entity.rotation ?? [0, 0, 0]));
      const surface = entity.material ?? "concrete";
      const group = new Group();
      group.name = entity.id;
      group.position.copy(position);
      group.rotation.set(rotation.x, rotation.y, rotation.z);

      const mesh = new Mesh(new BoxGeometry(width, height, depth), getMaterial(surface));
      mesh.castShadow = entity.type !== "pillar";
      mesh.receiveShadow = true;
      group.add(mesh);
      if (entity.type === "beam") addRivetBand(group, width, depth);
      if (entity.type === "pillar") {
        const cap = new Mesh(new BoxGeometry(width * 1.35, 0.3, depth * 1.35), getMaterial("rustedMetal"));
        cap.position.y = height / 2;
        group.add(cap);
      }
      root.add(group);
      hooks.addStaticBox({
        id: entity.id,
        position,
        size: new Vector3(width, height, depth),
        rotation,
        surface
      });
    }

    // Repeated distant pillars establish the multi-story maze without spending a draw call per support.
    // The span follows the authored route so larger courses do not end in an empty void.
    const routeMaxX = Math.max(
      165,
      ...definition.entities.map((entity) => entity.position[0] + (entity.scale?.[0] ?? 1) * 0.5 + 28)
    );
    const supportXs: number[] = [];
    for (let x = -25; x < routeMaxX; x += 18) {
      supportXs.push(x);
    }
    const backgroundGeometry = new BoxGeometry(1.05, 28, 1.05);
    const backgroundMaterial = createRetroMaterial("#3b3340", 0.95, 0.2);
    const supports = new InstancedMesh(backgroundGeometry, backgroundMaterial, supportXs.length * 2);
    let index = 0;
    for (const x of supportXs) {
      for (const z of [-23, 18]) {
        tempScale.set(1, 0.7 + ((index * 17) % 5) * 0.12, 1);
        tempMatrix.compose(new Vector3(x, -5 + (index % 3), z), tempQuaternion, tempScale);
        supports.setMatrixAt(index, tempMatrix);
        index += 1;
      }
    }
    supports.count = index;
    supports.instanceMatrix.needsUpdate = true;
    root.add(supports);

    const movingLights: PointLight[] = [];
    const lightXs = [18, 51, 73, 126, 147];
    for (let x = 175; x < routeMaxX; x += 30) {
      lightXs.push(x);
    }
    for (const x of lightXs) {
      const light = new PointLight("#ff8a3c", 13, 22, 2);
      light.position.set(x, x > 100 ? 18 : 7, -4);
      root.add(light);
      movingLights.push(light);
    }

    const checkpoints = definition.checkpoints.map((checkpoint) => {
      const visual = createCheckpointVisual();
      visual.position.set(checkpoint.position[0], checkpoint.position[1] - 2.25, checkpoint.position[2]);
      root.add(visual);
      return {
        id: checkpoint.id,
        name: checkpoint.name,
        position: new Vector3(...checkpoint.position),
        radius: checkpoint.radius,
        visual
      };
    });

    const goal = new Group();
    const portalMaterial = new MeshStandardMaterial({
      color: "#ffcf68",
      emissive: "#e74913",
      emissiveIntensity: 2.3,
      roughness: 0.18,
      metalness: 0.5
    });
    const portalOuter = new Mesh(new CylinderGeometry(2.2, 2.2, 0.36, 16, 1, true), portalMaterial);
    portalOuter.rotation.x = Math.PI / 2;
    const portalCore = new Mesh(
      new CircleGeometry(1.62, 16),
      new MeshBasicMaterial({ color: "#ffe18c", side: DoubleSide, transparent: true, opacity: 0.85 })
    );
    portalCore.position.z = 0.03;
    goal.add(portalOuter, portalCore);
    goal.position.set(...definition.goal.position);
    root.add(goal);

    return {
      root,
      checkpoints,
      goalPosition: new Vector3(...definition.goal.position),
      goalRadius: definition.goal.radius,
      update: (timeSeconds) => {
        goal.rotation.y = timeSeconds * 0.9;
        goal.children[1].scale.setScalar(0.88 + Math.sin(timeSeconds * 3.1) * 0.08);
        movingLights.forEach((light, lightIndex) => {
          light.intensity = 8 + Math.sin(timeSeconds * 2.3 + lightIndex) * 5;
        });
        checkpoints.forEach((checkpoint, checkpointIndex) => {
          checkpoint.visual.children[1].rotation.z = timeSeconds * (0.45 + checkpointIndex * 0.04);
        });
      }
    };
  }
}
