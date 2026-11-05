import * as THREE from 'three';

/** Radius rings and selection rings drawn on the ground (§23.4). */
export class Rings {
  readonly group = new THREE.Group();
  private pool: THREE.Mesh[] = [];
  private used = 0;
  private geo = new THREE.RingGeometry(0.85, 1, 32).rotateX(-Math.PI / 2);

  begin(): void {
    this.used = 0;
  }

  ring(x: number, y: number, z: number, radius: number, color: THREE.ColorRepresentation, opacity = 0.8): void {
    let m = this.pool[this.used];
    if (!m) {
      m = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      m.renderOrder = 3;
      this.pool.push(m);
      this.group.add(m);
    }
    this.used++;
    m.visible = true;
    m.position.set(x, y + 0.08, z);
    m.scale.setScalar(radius);
    const mat = m.material as THREE.MeshBasicMaterial;
    mat.color.set(color);
    mat.opacity = opacity;
  }

  end(): void {
    for (let i = this.used; i < this.pool.length; i++) this.pool[i]!.visible = false;
  }
}
