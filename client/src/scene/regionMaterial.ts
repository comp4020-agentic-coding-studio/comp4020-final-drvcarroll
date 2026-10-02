// game-design.md §12: regions as Voronoi patches drawn in the fragment
// shader. Owned patches you can see take their owner's tint and a glowing
// border; fog renders exactly like unclaimed ground.
import * as THREE from "three";
import { WARP as W } from "./layout.ts";

const WARP = Object.fromEntries(Object.entries(W).map(([k, v]) => [k, v.toFixed(4)])) as Record<keyof typeof W, string>;

export const MAX_SEEDS = 25;

export interface Look { base: string; accent: string; banded?: boolean }

export const LOOK: Record<string, Look> = {
  earth: { base: "#4f8f74", accent: "#2f6cb8" }, luna: { base: "#8d8d8a", accent: "#5e5e5c" },
  mercury: { base: "#8a7f74", accent: "#5c544c" }, venus: { base: "#d8c08a", accent: "#b39663" },
  mars: { base: "#b5553a", accent: "#7a3424" }, phobos: { base: "#6e655c", accent: "#4f4842" },
  deimos: { base: "#7a7066", accent: "#585049" }, ceres: { base: "#7d7b78", accent: "#5a5856" },
  vesta: { base: "#9a8f80", accent: "#6e665c" }, psyche: { base: "#9fa3a8", accent: "#6c7075" },
  jupiter: { base: "#c9a27a", accent: "#8c6a4f", banded: true }, io: { base: "#d9c45a", accent: "#a8722f" },
  europa: { base: "#cfc6b4", accent: "#a08770" }, ganymede: { base: "#8f8679", accent: "#5f574d" },
  callisto: { base: "#6b6156", accent: "#463f37" }, saturn: { base: "#d9c08e", accent: "#a88c5c", banded: true },
  titan: { base: "#d39a45", accent: "#9c6a2a" }, enceladus: { base: "#e8eef2", accent: "#b9c6cf" },
  uranus: { base: "#9fd6dc", accent: "#78b4bd", banded: true }, titania: { base: "#9b928a", accent: "#6c655f" },
  oberon: { base: "#8a7d72", accent: "#5f564f" }, neptune: { base: "#4a6fd6", accent: "#2f4ba0", banded: true },
  triton: { base: "#c9b8b0", accent: "#9b8a83" }, pluto: { base: "#c7b29a", accent: "#8d7864" },
};

const vertex = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vLocal = normalize(position);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vPosW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const fragment = /* glsl */ `
  uniform vec3 seeds[${MAX_SEEDS}];
  uniform vec3 tints[${MAX_SEEDS}];
  uniform float owned[${MAX_SEEDS}];
  uniform int count;
  uniform int hover;
  uniform int selected;
  uniform vec3 base;
  uniform vec3 accent;
  uniform float banded;
  varying vec3 vLocal;
  varying vec3 vNormalW;
  varying vec3 vPosW;

  vec3 warp(vec3 d) {
    return normalize(d + vec3(
      ${WARP.amp} * sin(d.y * ${WARP.f1} + d.z * ${WARP.f2}) + ${WARP.amp2} * sin(d.y * ${WARP.g1} + d.z * ${WARP.g2}),
      ${WARP.amp} * sin(d.z * ${WARP.f1} + d.x * ${WARP.f2}) + ${WARP.amp2} * sin(d.z * ${WARP.g1} + d.x * ${WARP.g2}),
      ${WARP.amp} * sin(d.x * ${WARP.f1} + d.y * ${WARP.f2}) + ${WARP.amp2} * sin(d.x * ${WARP.g1} + d.y * ${WARP.g2})));
  }

  float grain(vec3 p) {
    return 0.5 + 0.25 * sin(p.x * 23.0 + sin(p.y * 17.0)) * sin(p.z * 19.0 + sin(p.x * 13.0))
               + 0.15 * sin(p.y * 41.0 + p.z * 37.0) * sin(p.x * 29.0);
  }

  void main() {
    vec3 d = warp(vLocal);
    float b1 = -2.0, b2 = -2.0;
    int i1 = 0;
    for (int i = 0; i < ${MAX_SEEDS}; i++) {
      if (i >= count) break;
      float s = dot(d, seeds[i]);
      if (s > b1) { b2 = b1; b1 = s; i1 = i; }
      else if (s > b2) { b2 = s; }
    }
    float g = grain(vLocal);
    vec3 surface = mix(accent, base, g);
    if (banded > 0.5) surface = mix(accent, base, 0.5 + 0.5 * sin(vLocal.y * 22.0 + 1.8 * sin(vLocal.x * 5.0 + vLocal.z * 3.0)));

    float own = owned[i1];
    vec3 tint = tints[i1];
    vec3 col = mix(surface, tint * (0.55 + 0.45 * g), own * 0.6);

    float edge = count > 1 ? 1.0 - smoothstep(0.0, 0.018, b1 - b2) : 0.0;
    float glow = count > 1 ? 1.0 - smoothstep(0.0, 0.07, b1 - b2) : 0.0;
    vec3 line = own > 0.0 ? tint * 1.6 + 0.2 : vec3(0.72, 0.8, 0.9);
    col = mix(col, line, edge * (own > 0.0 ? 0.95 : 0.5));
    col += line * glow * own * 0.18;

    if (i1 == hover) col += 0.12;
    if (i1 == selected) col = mix(col, vec3(1.0), 0.18 + 0.5 * edge);

    vec3 toSun = normalize(-vPosW);
    float ndl = max(dot(normalize(vNormalW), toSun), 0.0);
    float light = 0.22 + 0.95 * ndl;
    vec3 lit = col * light;
    lit += line * edge * own * 0.35 * (1.0 - ndl); // borders glow on the night side
    gl_FragColor = vec4(lit, 1.0);
  }
`;

export function regionMaterial(look: Look, seedDirs: [number, number, number][]): THREE.ShaderMaterial {
  const pad = <T>(xs: T[], fill: T) => [...xs, ...Array(MAX_SEEDS - xs.length).fill(fill)];
  return new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: {
      seeds: { value: pad(seedDirs.map((d) => new THREE.Vector3(...d)), new THREE.Vector3(0, 1, 0)) },
      tints: { value: pad([], new THREE.Color(0, 0, 0)).map(() => new THREE.Color()) },
      owned: { value: pad([], 0) },
      count: { value: seedDirs.length },
      hover: { value: -1 },
      selected: { value: -1 },
      base: { value: new THREE.Color(look.base) },
      accent: { value: new THREE.Color(look.accent) },
      banded: { value: look.banded ? 1 : 0 },
    },
  });
}
