// game-design.md §12 "A full, busy system": the asteroid belt, Jupiter's
// Trojans and the Kuiper belt as GPU-orbited points, plus comets with tails.
// Decorative only: nothing here is clickable or part of the rules.
import * as THREE from "three";
import { BODIES, MAP } from "../../../rules/data/index.ts";
import { LOGDEPTH_FRAG, LOGDEPTH_FRAG_PARS, LOGDEPTH_VERT, LOGDEPTH_VERT_PARS } from "./glsl.ts";
import { orbitRadius } from "./layout.ts";

const TAU = 2 * Math.PI;
const DEG = Math.PI / 180;
const YEAR = 365.25;

// Seeded, so every player sees the same belt.
function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// a in AU, phase and node in radians, rate in rad/day, size in scene units.
interface Rock { a: number; phase: number; rate: number; e: number; peri: number; inc: number; node: number; size: number; tone: number }

const pointVertex = /* glsl */ `
  ${LOGDEPTH_VERT_PARS}
  attribute vec4 orb;  // a (AU), phase, rate, inc
  attribute vec4 ecc;  // e, perihelion, node, size
  attribute float tone;
  uniform float days;
  uniform float pxPerUnit;
  varying vec3 vSun;
  varying float vTone;
  varying float vAlpha;
  void main() {
    float th = orb.y + orb.z * days;
    float a = orb.x * (1.0 - ecc.x * cos(th - ecc.y));
    float r = 140.0 + 260.0 * log(a / 0.3);
    vec3 p = vec3(r * cos(th), r * sin(orb.w) * sin(th - ecc.z), -r * sin(th));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vec3 sunV = (viewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vSun = normalize(sunV - mv.xyz);
    vTone = tone;
    float px = ecc.w * pxPerUnit / -mv.z;
    vAlpha = clamp(px / 1.5, 0.4, 1.0);
    gl_PointSize = max(px, 1.5);
    gl_Position = projectionMatrix * mv;
    ${LOGDEPTH_VERT}
  }
`;

const pointFragment = /* glsl */ `
  ${LOGDEPTH_FRAG_PARS}
  uniform vec3 colour;
  uniform float opacity;
  varying vec3 vSun;
  varying float vTone;
  varying float vAlpha;
  void main() {
    ${LOGDEPTH_FRAG}
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(c, c);
    if (r2 > 1.0) discard;
    vec3 n = vec3(c.x, -c.y, sqrt(1.0 - r2));
    float light = 0.1 + 1.1 * max(dot(n, vSun), 0.0);
    gl_FragColor = vec4(colour * vTone * light, opacity * vAlpha);
  }
`;

function points(rocks: Rock[], colour: string, opacity: number): THREE.Points {
  const orb = new Float32Array(rocks.length * 4), ecc = new Float32Array(rocks.length * 4), tone = new Float32Array(rocks.length);
  rocks.forEach((k, i) => {
    orb.set([k.a, k.phase, k.rate, k.inc], i * 4);
    ecc.set([k.e, k.peri, k.node, k.size], i * 4);
    tone[i] = k.tone;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(rocks.length * 3), 3));
  g.setAttribute("orb", new THREE.BufferAttribute(orb, 4));
  g.setAttribute("ecc", new THREE.BufferAttribute(ecc, 4));
  g.setAttribute("tone", new THREE.BufferAttribute(tone, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: pointVertex, fragmentShader: pointFragment, transparent: true, depthWrite: false,
    uniforms: { days: { value: 0 }, pxPerUnit: { value: 1000 }, colour: { value: new THREE.Color(colour) }, opacity: { value: opacity } },
  });
  const p = new THREE.Points(g, mat);
  p.frustumCulled = false; // positions are computed in the shader
  return p;
}

// Kirkwood gaps: resonances with Jupiter leave the belt empty here.
const KIRKWOOD = [2.5, 2.82, 2.95, 3.27];

function belt(n: number, r: () => number): Rock[] {
  const out: Rock[] = [];
  while (out.length < n) {
    const a = 2.1 + 1.2 * r() ** 0.8;
    if (KIRKWOOD.some((g) => Math.abs(a - g) < 0.025)) continue;
    out.push({
      a, phase: r() * TAU, rate: TAU / (YEAR * a ** 1.5), e: r() * 0.12, peri: r() * TAU,
      inc: r() * r() * 18 * DEG, node: r() * TAU, size: 0.06 + 0.5 * r() ** 5, tone: 0.55 + 0.45 * r(),
    });
  }
  return out;
}

// Two swarms, 60° ahead of and behind Jupiter, sharing its period.
function trojans(n: number, r: () => number): Rock[] {
  const j = BODIES.jupiter.orbit;
  return Array.from({ length: n }, (_, i) => ({
    a: j.a * (0.97 + 0.06 * r()), phase: j.l0Deg * DEG + (i % 2 ? 1 : -1) * 60 * DEG + (r() + r() + r() - 1.5) * 28 * DEG,
    rate: TAU / j.periodDays, e: r() * 0.05, peri: r() * TAU, inc: r() * 22 * DEG, node: r() * TAU,
    size: 0.08 + 0.6 * r() ** 5, tone: 0.5 + 0.4 * r(),
  }));
}

// The classical Kuiper belt, the plutinos at 39.4 AU, and a scattered tail.
function kuiper(n: number, r: () => number): Rock[] {
  return Array.from({ length: n }, () => {
    const kind = r();
    const a = kind < 0.25 ? 39.4 + r() * 0.4 : kind < 0.85 ? 42 + r() * 6 : 50 + r() * 40;
    return {
      a, phase: r() * TAU, rate: TAU / (YEAR * a ** 1.5), e: kind < 0.85 ? r() * 0.12 : 0.2 + r() * 0.3, peri: r() * TAU,
      inc: r() * r() * 30 * DEG, node: r() * TAU, size: 0.4 + 2 * r() ** 5, tone: 0.45 + 0.5 * r(),
    };
  });
}

// Real elements; m0Deg (at 2050) places a few to round the Sun this season.
interface Comet { a: number; e: number; i: number; node: number; peri: number; m0Deg: number }
const COMETS: Comet[] = [
  { a: 17.83, e: 0.967, i: 162.3, node: 58.4, peri: 111.3, m0Deg: -2.5 }, // Halley
  { a: 2.22, e: 0.848, i: 11.8, node: 334.6, peri: 186.5, m0Deg: -40 }, // Encke
  { a: 186, e: 0.995, i: 89.4, node: 282.5, peri: 130.6, m0Deg: -0.3 }, // Hale-Bopp
  { a: 26.1, e: 0.963, i: 113.5, node: 139.4, peri: 153, m0Deg: 3 }, // Swift-Tuttle
  { a: 3.46, e: 0.641, i: 7.0, node: 50.1, peri: 12.8, m0Deg: -25 }, // 67P
  { a: 3.15, e: 0.51, i: 10.5, node: 68.9, peri: 179.2, m0Deg: 150 }, // Tempel 1
];

// Heliocentric position in AU, ecliptic axes mapped to the scene's (x, y up, −y).
function cometAt(c: Comet, days: number): { dir: THREE.Vector3; au: number } {
  const n = TAU / (YEAR * c.a ** 1.5);
  let m = (c.m0Deg * DEG + n * (days - MAP.calendarStartJ2000Days)) % TAU;
  if (m > Math.PI) m -= TAU;
  if (m < -Math.PI) m += TAU;
  let E = c.e > 0.8 ? Math.PI * Math.sign(m || 1) : m;
  for (let k = 0; k < 30; k++) E -= (E - c.e * Math.sin(E) - m) / (1 - c.e * Math.cos(E));
  const xo = c.a * (Math.cos(E) - c.e), yo = c.a * Math.sqrt(1 - c.e * c.e) * Math.sin(E);
  const [w, O, i] = [c.peri * DEG, c.node * DEG, c.i * DEG];
  const [cw, sw, cO, sO, ci, si] = [Math.cos(w), Math.sin(w), Math.cos(O), Math.sin(O), Math.cos(i), Math.sin(i)];
  const x = (cO * cw - sO * sw * ci) * xo + (-cO * sw - sO * cw * ci) * yo;
  const y = (sO * cw + cO * sw * ci) * xo + (-sO * sw + cO * cw * ci) * yo;
  const z = sw * si * xo + cw * si * yo;
  const v = new THREE.Vector3(x, z, -y);
  return { dir: v.clone().normalize(), au: v.length() };
}

function tailMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { strength: { value: 1 } },
    vertexShader: /* glsl */ `
      ${LOGDEPTH_VERT_PARS}
      varying float vK; varying vec3 vN; varying vec3 vP;
      void main() {
        vK = 1.0 - position.y;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
        ${LOGDEPTH_VERT}
      }`,
    fragmentShader: /* glsl */ `
      ${LOGDEPTH_FRAG_PARS}
      uniform float strength;
      varying float vK; varying vec3 vN; varying vec3 vP;
      void main() {
        ${LOGDEPTH_FRAG}
        float face = abs(dot(vN, normalize(cameraPosition - vP)));
        float a = pow(vK, 2.2) * face * strength;
        gl_FragColor = vec4(mix(vec3(0.55, 0.75, 1.0), vec3(0.95, 0.97, 1.0), vK), a);
      }`,
  });
}

export class Decor {
  private belts: THREE.Points[];
  private comets: { c: Comet; head: THREE.Mesh; tail: THREE.Mesh; mat: THREE.ShaderMaterial }[];

  constructor(scene: THREE.Scene, phone: boolean) {
    const r = rng(4020), k = phone ? 1 / 3 : 1;
    this.belts = [
      points(belt(Math.round(18000 * k), r), "#c2ae90", 0.95),
      points(trojans(Math.round(4000 * k), r), "#b3a28a", 0.9),
      points(kuiper(Math.round(12000 * k), r), "#a9c0d6", 0.9),
    ];
    for (const b of this.belts) scene.add(b);
    // Tip at the head, widening away from it along +y.
    const cone = new THREE.ConeGeometry(1, 1, 24, 1, true).rotateX(Math.PI).translate(0, 0.5, 0);
    this.comets = COMETS.map((c) => {
      const head = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: "#a8c8e8" }));
      const mat = tailMaterial();
      const tail = new THREE.Mesh(cone, mat);
      tail.frustumCulled = false;
      scene.add(head, tail);
      return { c, head, tail, mat };
    });
  }

  update(days: number, pxPerUnit: number, camera: THREE.Camera): void {
    for (const b of this.belts) {
      const u = (b.material as THREE.ShaderMaterial).uniforms;
      u.days.value = days;
      u.pxPerUnit.value = pxPerUnit;
    }
    const up = new THREE.Vector3(0, 1, 0);
    for (const { c, head, tail, mat } of this.comets) {
      const { dir, au } = cometAt(c, days);
      const p = dir.clone().multiplyScalar(orbitRadius(Math.max(au, 0.35)));
      head.position.copy(p);
      head.scale.setScalar(Math.max(0.2, camera.position.distanceTo(p) * 0.0011));
      // Tails point away from the Sun and grow as the comet closes on it.
      const len = Math.min(240, 160 / au ** 1.2);
      tail.visible = au < 6;
      tail.position.copy(p);
      tail.quaternion.setFromUnitVectors(up, dir);
      tail.scale.set(len * 0.07, len, len * 0.07);
      mat.uniforms.strength.value = Math.min(1, 1.6 / au);
    }
  }
}
