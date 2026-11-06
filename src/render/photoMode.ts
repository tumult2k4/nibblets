/**
 * Photo mode's post pass (§18 F12, P11.2): the scene is drawn into a texture, then onto the screen through one small
 * shader — a soft vignette, and a tilt-shift toggle that blurs above and below a band in focus (the "miniature" look,
 * a little more saturated). No depth of field: the blur depends only on the height on screen, so it is cheap and
 * steady. Off, the renderer draws straight to the screen as before.
 */
import * as THREE from 'three';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform vec2 texel;
uniform float vignette, tilt, focus, band;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tScene, vUv);
  if (tilt > 0.0) {
    float d = clamp((abs(vUv.y - focus) - band) / max(0.05, 0.5 - band), 0.0, 1.0);
    float r = d * d * tilt * 7.0;
    if (r > 0.05) {
      vec4 acc = vec4(0.0);
      float ws = 0.0;
      for (int i = -3; i <= 3; i++) for (int j = -3; j <= 3; j++) {
        vec2 o = vec2(float(i), float(j));
        float w = exp(-dot(o, o) / 8.0);
        acc += texture2D(tScene, vUv + o * texel * r) * w;
        ws += w;
      }
      c = acc / ws;
    }
    float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
    c.rgb = mix(vec3(l), c.rgb, 1.0 + 0.18 * tilt);
  }
  vec2 q = vUv - 0.5;
  float v = 1.0 - smoothstep(0.35, 0.85, length(q * vec2(1.0, 0.85)) * 1.15);
  c.rgb *= mix(1.0, v, vignette);
  gl_FragColor = vec4(c.rgb, 1.0);
  #include <colorspace_fragment>
}`;

export interface PhotoLook { vignette: number; tilt: boolean; focus: number }

export class PhotoMode {
  on = false;
  look: PhotoLook = { vignette: 0.5, tilt: false, focus: 0.5 };
  private rt: THREE.WebGLRenderTarget | null = null;
  private quad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> | null = null;
  private post = new THREE.Scene();
  private postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private size = new THREE.Vector2();

  /** Draw `scene` through the pass. */
  render(gl: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.Camera): void {
    gl.getDrawingBufferSize(this.size);
    if (!this.rt || this.rt.width !== this.size.x || this.rt.height !== this.size.y) {
      this.rt?.dispose();
      this.rt = new THREE.WebGLRenderTarget(this.size.x, this.size.y, { samples: 4, colorSpace: THREE.LinearSRGBColorSpace, type: THREE.HalfFloatType });
    }
    const q = this.quad ?? this.makeQuad();
    const u = q.material.uniforms;
    u.tScene!.value = this.rt.texture;
    (u.texel!.value as THREE.Vector2).set(1 / this.size.x, 1 / this.size.y);
    u.vignette!.value = this.look.vignette;
    u.tilt!.value = this.look.tilt ? 1 : 0;
    u.focus!.value = 1 - this.look.focus; // the slider counts from the top, the texture from the bottom
    gl.setRenderTarget(this.rt);
    gl.render(scene, cam);
    gl.setRenderTarget(null);
    gl.render(this.post, this.postCam);
  }

  private makeQuad(): THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false,
      uniforms: { tScene: { value: null }, texel: { value: new THREE.Vector2() }, vignette: { value: 0.6 }, tilt: { value: 0 }, focus: { value: 0.5 }, band: { value: 0.1 } },
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    this.quad.frustumCulled = false;
    this.post.add(this.quad);
    return this.quad;
  }

  /** Free the target when photo mode is left (it is the size of the screen). */
  release(): void {
    this.rt?.dispose();
    this.rt = null;
  }
}
