import * as THREE from 'three';

export type HandPose = 'open' | 'point' | 'grab' | 'pet' | 'cast' | 'paint';

interface Finger { base: THREE.Group; mid: THREE.Group }

/** Pose targets: [base curl, mid curl] per finger (thumb, index, middle, ring, pinky). */
const POSES: Record<HandPose, [number, number][]> = {
  open: [[0.2, 0.1], [0.15, 0.1], [0.12, 0.08], [0.15, 0.1], [0.2, 0.12]],
  point: [[0.9, 0.6], [0.0, 0.0], [1.5, 1.4], [1.5, 1.4], [1.5, 1.4]],
  grab: [[1.0, 0.9], [1.5, 1.4], [1.55, 1.45], [1.55, 1.45], [1.5, 1.4]],
  pet: [[0.3, 0.2], [0.35, 0.3], [0.35, 0.3], [0.35, 0.3], [0.35, 0.3]],
  cast: [[0.4, 0.2], [0.2, 0.1], [0.1, 0.05], [0.2, 0.1], [0.3, 0.2]],
  paint: [[0.05, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
};

/** Large low-poly god hand (§17.3, §23.4): palm + five two-segment fingers, lerped poses, blob shadow, drop line. */
export class GodHand {
  readonly group = new THREE.Group();
  private hand = new THREE.Group();
  private fingers: Finger[] = [];
  private mat = new THREE.MeshLambertMaterial({ color: '#f0c79c', flatShading: true, emissive: '#000000' });
  readonly shadow: THREE.Mesh;
  private line: THREE.Line;
  pose: HandPose = 'open';
  private cur: [number, number][] = POSES.open.map((p) => [...p] as [number, number]);
  glow = new THREE.Color('#000000');
  /** world-space size; the UI scales it with camera distance so it reads at every zoom */
  size = 0.9;

  constructor() {
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.28, 1.0), this.mat);
    palm.castShadow = false;
    this.hand.add(palm);
    const fx = [-0.55, -0.32, -0.05, 0.22, 0.42];
    const fl = [0.42, 0.55, 0.6, 0.55, 0.42];
    for (let i = 0; i < 5; i++) {
      const base = new THREE.Group();
      const thumb = i === 0;
      base.position.set(fx[i]!, 0, thumb ? 0.1 : 0.5);
      if (thumb) base.rotation.y = -0.9;
      const seg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, fl[i]!, 5).rotateX(Math.PI / 2).translate(0, 0, fl[i]! / 2), this.mat);
      base.add(seg1);
      const mid = new THREE.Group();
      mid.position.z = fl[i]!;
      const seg2 = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.1, fl[i]! * 0.8, 5).rotateX(Math.PI / 2).translate(0, 0, fl[i]! * 0.4), this.mat);
      mid.add(seg2);
      base.add(mid);
      this.hand.add(base);
      this.fingers.push({ base, mid });
    }
    // palm faces down, fingers point "forward" (toward -camera)
    this.hand.rotation.x = 0.35;
    this.group.add(this.hand);
    const sg = new THREE.CircleGeometry(0.9, 16).rotateX(-Math.PI / 2);
    this.shadow = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.22, depthWrite: false }));
    this.shadow.renderOrder = 2;
    const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, -1, 0)]);
    this.line = new THREE.Line(lg, new THREE.LineDashedMaterial({ color: '#fff7e0', dashSize: 0.25, gapSize: 0.18, transparent: true, opacity: 0.8 }));
    this.line.visible = false;
  }

  attach(scene: THREE.Scene): void {
    scene.add(this.group, this.shadow, this.line);
  }

  /**
   * @param ground terrain point under the cursor
   * @param height hand height above ground (hold height while holding)
   * @param yaw camera yaw so the hand faces away from the viewer
   */
  update(dt: number, ground: THREE.Vector3 | null, height: number, yaw: number, t: number, holding: boolean): void {
    this.group.visible = !!ground;
    this.shadow.visible = !!ground;
    if (!ground) {
      this.line.visible = false;
      return;
    }
    const bob = this.pose === 'open' ? Math.sin(t * 2) * 0.12 : 0;
    const handY = ground.y + height + (holding ? 0.9 : 0) + bob;
    this.group.position.lerp(new THREE.Vector3(ground.x, handY, ground.z), 1 - Math.exp(-dt * 25));
    this.group.rotation.y = yaw + Math.PI;
    this.group.scale.setScalar(this.size);
    this.shadow.position.set(this.group.position.x, ground.y + 0.06, this.group.position.z);
    const sh = Math.max(0.35, 1.1 - height * 0.05);
    this.shadow.scale.setScalar(sh);
    const k = 1 - Math.exp(-dt / 0.05);
    const target = POSES[this.pose];
    this.fingers.forEach((f, i) => {
      const c = this.cur[i]!;
      c[0] += (target[i]![0] - c[0]) * k;
      c[1] += (target[i]![1] - c[1]) * k;
      const wig = this.pose === 'pet' ? Math.sin(t * 14 + i) * 0.3 : 0;
      f.base.rotation.x = c[0] + wig;
      f.mid.rotation.x = c[1] + wig * 0.5;
    });
    this.hand.rotation.x = this.pose === 'paint' ? 0 : this.pose === 'point' ? 0.6 : 0.35;
    this.mat.emissive.copy(this.glow);
    this.line.visible = holding;
    if (holding) {
      const top = this.group.position.clone().add(new THREE.Vector3(0, -0.9, 0));
      const pos = this.line.geometry.attributes.position as THREE.BufferAttribute;
      pos.setXYZ(0, top.x, top.y, top.z);
      pos.setXYZ(1, top.x, ground.y, top.z);
      pos.needsUpdate = true;
      this.line.computeLineDistances();
    }
  }
}
