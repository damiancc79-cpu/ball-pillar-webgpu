import {
  BoxGeometry,
  Color,
  DirectionalLight,
  FogExp2,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PointLight,
  Scene,
  SphereGeometry,
  Vector3
} from "three";
import { createRetroMaterial } from "../shaders/retroNodes";

const matrix = new Matrix4();
const menuCameraTarget = new Vector3(0, 1, 0);

export class MainMenuScene {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(52, 4 / 3, 0.1, 180);
  private readonly ball: Mesh;
  private readonly rotatingArms: Group[] = [];
  private readonly glow: PointLight;

  constructor() {
    this.scene.background = new Color("#818eae");
    this.scene.fog = new FogExp2("#8190b1", 0.028);
    this.camera.position.set(8, 5.2, 11.5);

    const sky = new HemisphereLight("#b5c7eb", "#332522", 1.4);
    this.scene.add(sky);
    const key = new DirectionalLight("#ffa75b", 2.6);
    key.position.set(-7, 13, 5);
    key.castShadow = true;
    this.scene.add(key);

    const platform = new Group();
    const deck = new Mesh(new BoxGeometry(8.5, 0.85, 6.5), createRetroMaterial("#5b3426", 0.82, 0.35));
    deck.receiveShadow = true;
    platform.add(deck);
    for (const z of [-2.5, 0, 2.5]) {
      const seam = new Mesh(new BoxGeometry(8.7, 0.08, 0.09), createRetroMaterial("#19141a", 0.9, 0.25));
      seam.position.set(0, 0.48, z);
      platform.add(seam);
    }
    this.scene.add(platform);

    const ballMaterial = new MeshPhysicalMaterial({
      color: "#182239",
      metalness: 0.92,
      roughness: 0.16,
      clearcoat: 0.6,
      clearcoatRoughness: 0.12
    });
    this.ball = new Mesh(new SphereGeometry(1.05, 16, 12), ballMaterial);
    this.ball.position.set(-0.6, 1.48, 0.2);
    this.ball.castShadow = true;
    this.scene.add(this.ball);
    this.glow = new PointLight("#ffd477", 18, 12, 2);
    this.glow.position.set(-2.5, 4.4, 4);
    this.scene.add(this.glow);

    const armMaterial = createRetroMaterial("#51382d", 0.78, 0.55);
    for (const x of [-8, 8]) {
      const rig = new Group();
      rig.position.set(x, 3.1, -3.2);
      const post = new Mesh(new BoxGeometry(0.7, 6.4, 0.7), armMaterial);
      post.position.y = -3.2;
      const arm = new Mesh(new BoxGeometry(5, 0.42, 0.55), armMaterial);
      arm.position.x = 2.2;
      rig.add(post, arm);
      this.scene.add(rig);
      this.rotatingArms.push(rig);
    }

    const pillars = new InstancedMesh(
      new BoxGeometry(1.2, 22, 1.2),
      createRetroMaterial("#4e4246", 0.96, 0.15),
      18
    );
    let count = 0;
    for (let x = -22; x <= 22; x += 11) {
      for (const z of [-18, 14]) {
        matrix.makeTranslation(x, -8 + (count % 4) * 1.7, z);
        pillars.setMatrixAt(count, matrix);
        count += 1;
      }
    }
    pillars.count = count;
    pillars.instanceMatrix.needsUpdate = true;
    this.scene.add(pillars);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  update(elapsed: number): void {
    const orbit = elapsed * 0.13;
    this.camera.position.set(Math.cos(orbit) * 11, 5.2 + Math.sin(orbit * 0.5) * 0.7, Math.sin(orbit) * 11);
    this.camera.lookAt(menuCameraTarget);
    this.ball.position.x = -0.55 + Math.sin(elapsed * 0.65) * 0.65;
    this.ball.rotation.z += 0.016;
    this.rotatingArms.forEach((arm, index) => (arm.rotation.z = elapsed * (index % 2 === 0 ? 0.55 : -0.43)));
    this.glow.intensity = 12 + Math.sin(elapsed * 2) * 6;
  }
}
