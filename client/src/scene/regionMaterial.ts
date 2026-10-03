// game-design.md §12: each body's stylised surface, with its regions drawn on
// top as Voronoi patches (owner tint, glowing borders). Fog renders exactly
// like unclaimed ground. Writes the log depth buffer, so bodies are opaque.
import * as THREE from "three";
import { LOGDEPTH_FRAG, LOGDEPTH_FRAG_PARS, LOGDEPTH_VERT, LOGDEPTH_VERT_PARS, NOISE } from "./glsl.ts";
import { WARP as W } from "./layout.ts";

const WARP = Object.fromEntries(Object.entries(W).map(([k, v]) => [k, v.toFixed(4)])) as Record<keyof typeof W, string>;

export const MAX_SEEDS = 25;

export const STYLE = { earth: 0, rock: 1, mars: 2, venus: 3, gas: 4, ice: 5, cracked: 6, volcanic: 7, haze: 8 } as const;

export interface Look { style: keyof typeof STYLE; a: string; b: string; c: string; atmosphere?: string; spot?: boolean }

export const LOOK: Record<string, Look> = {
  earth: { style: "earth", a: "#1d4f8f", b: "#4d7d3a", c: "#c9b27a", atmosphere: "#6fb6ff" },
  luna: { style: "rock", a: "#9a9893", b: "#6c6a66", c: "#c4c2bc" },
  mercury: { style: "rock", a: "#8f8478", b: "#5f574f", c: "#b7aca0" },
  venus: { style: "venus", a: "#e6cf96", b: "#c9a565", c: "#f5e6c0", atmosphere: "#ffdca0" },
  mars: { style: "mars", a: "#c1572f", b: "#7a3420", c: "#e08a5a", atmosphere: "#ff9c70" },
  phobos: { style: "rock", a: "#71685e", b: "#4d463f", c: "#8c8378" },
  deimos: { style: "rock", a: "#7b7166", b: "#564e46", c: "#958b80" },
  ceres: { style: "rock", a: "#807d79", b: "#5a5855", c: "#a8a5a0" },
  vesta: { style: "rock", a: "#9d9283", b: "#6e665b", c: "#c2b6a5" },
  psyche: { style: "rock", a: "#a3a7ad", b: "#6a6e74", c: "#d0d4d9" },
  jupiter: { style: "gas", a: "#ead2b0", b: "#a86f48", c: "#fbf2e2", atmosphere: "#ffe2bb", spot: true },
  io: { style: "volcanic", a: "#e3cf5a", b: "#b5602a", c: "#f4ec9c" },
  europa: { style: "cracked", a: "#e0d6c4", b: "#9b7454", c: "#f4efe6" },
  ganymede: { style: "rock", a: "#958b7e", b: "#635a50", c: "#bdb3a6" },
  callisto: { style: "rock", a: "#6e6358", b: "#463e36", c: "#94897d" },
  saturn: { style: "gas", a: "#ecd9ac", b: "#c09a62", c: "#fbf3df", atmosphere: "#fff0c8" },
  titan: { style: "haze", a: "#d79a45", b: "#a86a28", c: "#efc27a", atmosphere: "#ffb85c" },
  enceladus: { style: "cracked", a: "#eef3f6", b: "#a9c3d2", c: "#ffffff" },
  uranus: { style: "ice", a: "#a3dde3", b: "#79bcc5", c: "#d5f3f5", atmosphere: "#b6f2ff" },
  titania: { style: "rock", a: "#a0968d", b: "#6f6861", c: "#c4bab0" },
  oberon: { style: "rock", a: "#8d8075", b: "#61574f", c: "#ada095" },
  neptune: { style: "ice", a: "#4b72dc", b: "#2c4aa6", c: "#8fb0ff", atmosphere: "#7aa4ff" },
  triton: { style: "cracked", a: "#d3c3bb", b: "#9d8a83", c: "#efe4de" },
  pluto: { style: "rock", a: "#cdb79f", b: "#8f7a66", c: "#f0e2d0" },
};

const vertex = /* glsl */ `
  ${LOGDEPTH_VERT_PARS}
  varying vec3 vLocal;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vLocal = normalize(position);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vPosW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
    ${LOGDEPTH_VERT}
  }
`;

const fragment = /* glsl */ `
  ${LOGDEPTH_FRAG_PARS}
  uniform vec3 seeds[${MAX_SEEDS}];
  uniform vec3 tints[${MAX_SEEDS}];
  uniform float owned[${MAX_SEEDS}];
  uniform float lights[${MAX_SEEDS}];
  uniform int count;
  uniform int hover;
  uniform int selected;
  uniform int style;
  uniform float spot;
  uniform float seed;
  uniform vec3 ca;
  uniform vec3 cb;
  uniform vec3 cc;
  varying vec3 vLocal;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  ${NOISE}

  vec3 warp(vec3 d) {
    return normalize(d + vec3(
      ${WARP.amp} * sin(d.y * ${WARP.f1} + d.z * ${WARP.f2}) + ${WARP.amp2} * sin(d.y * ${WARP.g1} + d.z * ${WARP.g2}),
      ${WARP.amp} * sin(d.z * ${WARP.f1} + d.x * ${WARP.f2}) + ${WARP.amp2} * sin(d.z * ${WARP.g1} + d.x * ${WARP.g2}),
      ${WARP.amp} * sin(d.x * ${WARP.f1} + d.y * ${WARP.f2}) + ${WARP.amp2} * sin(d.x * ${WARP.g1} + d.y * ${WARP.g2})));
  }

  float craters(vec3 p, float scale) {
    vec2 c = cells(p * scale);
    float r = 0.25 + 0.3 * c.y;
    float bowl = smoothstep(r, r * 0.55, c.x);
    float rim = smoothstep(r * 0.75, r, c.x) * smoothstep(r * 1.25, r, c.x);
    return rim * 0.5 - bowl * 0.35;
  }

  // Each body family's look. 'land' feeds city lights; 'spec' ocean shine.
  vec3 surface(vec3 p, out float land, out float spec) {
    land = 1.0; spec = 0.0;
    vec3 q = p + seed;
    if (style == 0) { // Earth
      float h = fbm(q * 1.6) + 0.35 * fbm(q * 5.0);
      land = smoothstep(0.02, 0.06, h);
      float dry = smoothstep(0.1, 0.45, fbm(q * 2.3 + 7.0)) * (1.0 - smoothstep(0.35, 0.7, abs(p.y)));
      vec3 ground = mix(cb, cc, dry);
      ground = mix(ground, ground * 0.7, smoothstep(0.2, 0.6, h));
      vec3 sea = mix(ca * 0.55, ca, smoothstep(-0.4, 0.05, h));
      vec3 col = mix(sea, ground, land);
      spec = 1.0 - land;
      float ice = smoothstep(0.78, 0.86, abs(p.y) + 0.06 * fbm(q * 4.0));
      col = mix(col, vec3(0.93, 0.96, 1.0), ice);
      float cloud = smoothstep(0.15, 0.6, fbm(q * 2.6 + vec3(0.0, 0.0, 3.0)) + 0.25 * snoise(q * 9.0));
      return mix(col, vec3(1.0), cloud * 0.55);
    }
    if (style == 1) { // cratered rock
      float n = fbm(q * 2.2);
      vec3 col = mix(cb, ca, 0.5 + 0.5 * n);
      col = mix(col, cb * 0.85, smoothstep(0.1, 0.5, fbm(q * 1.1 + 3.0)));
      float k = craters(q, 3.0) + 0.6 * craters(q, 7.0) + 0.35 * craters(q, 15.0);
      return col * (1.0 + k) + cc * max(k, 0.0) * 0.25;
    }
    if (style == 2) { // Mars
      float n = fbm(q * 2.0);
      vec3 col = mix(ca, cc, 0.5 + 0.5 * fbm(q * 4.0));
      col = mix(col, cb, smoothstep(0.05, 0.4, n));
      col *= 1.0 + 0.5 * craters(q, 5.0);
      float cap = smoothstep(0.82, 0.9, abs(p.y) + 0.05 * fbm(q * 5.0));
      return mix(col, vec3(0.97, 0.95, 0.92), cap);
    }
    if (style == 3) { // Venus clouds
      vec3 r = vec3(p.x + 0.4 * fbm(q * 2.0), p.y * 3.0, p.z);
      float n = fbm(r * 2.2 + fbm(q * 1.5));
      return mix(cb, cc, 0.5 + 0.6 * n);
    }
    if (style == 4 || style == 5) { // gas and ice giants: zones and belts
      bool gas = style == 4;
      float turb = snoise(vec3(p.x * 3.0, p.y * 14.0, p.z * 3.0) + seed) * (gas ? 0.035 : 0.015)
                 + snoise(vec3(p.x * 9.0, p.y * 30.0, p.z * 9.0) + seed) * (gas ? 0.012 : 0.004);
      float lat = p.y + turb;
      float zones = sin(lat * (gas ? 17.0 : 7.0) + 0.6) * 0.5 + 0.5;
      float belts = sin(lat * (gas ? 41.0 : 19.0)) * 0.5 + 0.5;
      vec3 col = mix(cb, ca, smoothstep(0.25, 0.75, zones));
      col = mix(col, cc, smoothstep(0.55, 0.95, belts) * (gas ? 0.45 : 0.2));
      col *= 0.92 + 0.12 * snoise(vec3(p.x * 20.0, p.y * 60.0, p.z * 20.0));
      if (spot > 0.5) {
        vec3 c0 = normalize(vec3(0.6, -0.36, 0.72));
        vec3 d = p - c0;
        float e = length(vec2(dot(d, normalize(cross(c0, vec3(0.0, 1.0, 0.0)))) * 0.55, d.y));
        float swirl = smoothstep(0.13, 0.05, e + 0.02 * snoise(p * 30.0));
        col = mix(col, vec3(0.78, 0.36, 0.22), swirl * 0.85);
      }
      return col;
    }
    if (style == 6) { // cracked ice
      vec3 col = mix(ca, cc, 0.5 + 0.5 * fbm(q * 3.0));
      float crack = 1.0 - smoothstep(0.0, 0.035, abs(snoise(q * 3.5)));
      float crack2 = 1.0 - smoothstep(0.0, 0.025, abs(snoise(q * 8.0 + 2.0)));
      return mix(col, cb, max(crack, crack2 * 0.7) * 0.8);
    }
    if (style == 7) { // volcanic
      vec3 col = mix(ca, cc, 0.5 + 0.5 * fbm(q * 2.5));
      vec2 c = cells(q * 5.0);
      float vent = smoothstep(0.22, 0.05, c.x) * step(0.55, c.y);
      col = mix(col, cb, smoothstep(0.35, 0.1, c.x) * 0.5 * step(0.4, c.y));
      return mix(col, vec3(0.12, 0.08, 0.05), vent);
    }
    // haze
    float n = fbm(vec3(p.x, p.y * 2.5, p.z) * 2.0 + q);
    return mix(cb, cc, 0.5 + 0.4 * n);
  }

  void main() {
    ${LOGDEPTH_FRAG}
    vec3 d = warp(vLocal);
    float b1 = -2.0, b2 = -2.0;
    int i1 = 0;
    for (int i = 0; i < ${MAX_SEEDS}; i++) {
      if (i >= count) break;
      float s = dot(d, seeds[i]);
      if (s > b1) { b2 = b1; b1 = s; i1 = i; }
      else if (s > b2) { b2 = s; }
    }
    float land, spec;
    vec3 col = surface(vLocal, land, spec);

    float own = owned[i1];
    vec3 tint = tints[i1];
    col = mix(col, col * 0.45 + tint * 0.75, own * 0.42);

    float w = fwidth(b1 - b2);
    float edge = count > 1 ? 1.0 - smoothstep(0.0, w * (own > 0.0 ? 2.4 : 1.3), b1 - b2) : 0.0;
    float glow = count > 1 ? 1.0 - smoothstep(0.0, 0.05, b1 - b2) : 0.0;
    vec3 line = own > 0.0 ? tint * 1.5 + 0.25 : vec3(0.85, 0.9, 1.0);
    col = mix(col, line, edge * (own > 0.0 ? 0.95 : 0.32));
    col += line * glow * own * 0.14;
    if (i1 == hover) col += 0.1;
    if (i1 == selected) col = mix(col, vec3(1.0), 0.14 + 0.55 * edge);

    vec3 n = normalize(vNormalW);
    vec3 toSun = normalize(-vPosW);
    float ndl = dot(n, toSun);
    float day = smoothstep(-0.08, 0.25, ndl);
    float light = 0.07 + 1.05 * max(ndl, 0.0);
    vec3 lit = col * light;
    vec3 v = normalize(cameraPosition - vPosW);
    lit += vec3(0.9, 0.95, 1.0) * spec * pow(max(dot(n, normalize(toSun + v)), 0.0), 60.0) * 0.6 * day;

    // City lights on the night side, denser with buildings in sensed regions.
    float city = land * lights[i1] * smoothstep(0.35, 0.8, snoise(vLocal * 38.0) * 0.5 + 0.5 + 0.3 * snoise(vLocal * 9.0));
    lit += vec3(1.0, 0.78, 0.45) * city * (1.0 - day) * 1.4;
    lit += line * edge * own * 0.4 * (1.0 - day);
    gl_FragColor = vec4(lit, 1.0);
  }
`;

export function regionMaterial(id: string, seedDirs: [number, number, number][]): THREE.ShaderMaterial {
  const look = LOOK[id];
  const pad = <T>(xs: T[], n: number, fill: () => T) => [...xs, ...Array.from({ length: n - xs.length }, fill)];
  return new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: {
      seeds: { value: pad(seedDirs.map((d) => new THREE.Vector3(...d)), MAX_SEEDS, () => new THREE.Vector3(0, 1, 0)) },
      tints: { value: pad([], MAX_SEEDS, () => new THREE.Color()) },
      owned: { value: pad([], MAX_SEEDS, () => 0) },
      lights: { value: pad([], MAX_SEEDS, () => 0) },
      count: { value: seedDirs.length },
      hover: { value: -1 },
      selected: { value: -1 },
      style: { value: STYLE[look.style] },
      spot: { value: look.spot ? 1 : 0 },
      seed: { value: [...id].reduce((a, ch) => a + ch.charCodeAt(0), 0) * 0.37 },
      ca: { value: new THREE.Color(look.a) },
      cb: { value: new THREE.Color(look.b) },
      cc: { value: new THREE.Color(look.c) },
    },
  });
}

// A rim-glow shell, brighter on the day side.
export function atmosphereMaterial(colour: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
    uniforms: { glow: { value: new THREE.Color(colour) } },
    vertexShader: /* glsl */ `
      ${LOGDEPTH_VERT_PARS}
      varying vec3 vN; varying vec3 vP;
      void main() {
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 w = modelMatrix * vec4(position, 1.0);
        vP = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
        ${LOGDEPTH_VERT}
      }`,
    fragmentShader: /* glsl */ `
      ${LOGDEPTH_FRAG_PARS}
      uniform vec3 glow;
      varying vec3 vN; varying vec3 vP;
      void main() {
        ${LOGDEPTH_FRAG}
        vec3 v = normalize(cameraPosition - vP);
        float rim = pow(1.0 - max(dot(vN, v), 0.0), 4.0);
        float sun = 0.25 + 0.75 * smoothstep(-0.3, 0.6, dot(vN, normalize(-vP)));
        gl_FragColor = vec4(glow * rim * sun * 1.3, rim * sun);
      }`,
  });
}

// The Sun: churning granulation, bright enough to bloom.
export function sunMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: /* glsl */ `
      ${LOGDEPTH_VERT_PARS}
      varying vec3 vL; varying vec3 vN; varying vec3 vP;
      void main() {
        vL = normalize(position); vN = normalize(mat3(modelMatrix) * normal);
        vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
        ${LOGDEPTH_VERT}
      }`,
    fragmentShader: /* glsl */ `
      ${LOGDEPTH_FRAG_PARS}
      uniform float time;
      varying vec3 vL; varying vec3 vN; varying vec3 vP;
      ${NOISE}
      void main() {
        ${LOGDEPTH_FRAG}
        float n = fbm(vL * 6.0 + vec3(0.0, time * 0.03, time * 0.02)) * 0.5 + 0.5;
        float g = 1.0 - smoothstep(0.0, 0.08, cells(vL * 18.0 + time * 0.01).x) * 0.25;
        vec3 v = normalize(cameraPosition - vP);
        float limb = pow(max(dot(vN, v), 0.0), 0.45);
        vec3 col = mix(vec3(1.0, 0.55, 0.15), vec3(1.0, 0.93, 0.7), n) * g;
        gl_FragColor = vec4(col * (0.75 + 0.6 * limb) * 1.6, 1.0);
      }`,
  });
}

// Planetary rings: bands and gaps by radius, faint and translucent.
export function ringMaterial(inner: number, outer: number, colour: string, opacity: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { inner: { value: inner }, outer: { value: outer }, tint: { value: new THREE.Color(colour) }, opacity: { value: opacity } },
    vertexShader: /* glsl */ `
      ${LOGDEPTH_VERT_PARS}
      varying vec3 vL;
      void main() {
        vL = position;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
        ${LOGDEPTH_VERT}
      }`,
    fragmentShader: /* glsl */ `
      ${LOGDEPTH_FRAG_PARS}
      uniform float inner; uniform float outer; uniform vec3 tint; uniform float opacity;
      varying vec3 vL;
      ${NOISE}
      void main() {
        ${LOGDEPTH_FRAG}
        float r = (length(vL.xy) - inner) / (outer - inner);
        float bands = 0.55 + 0.45 * sin(r * 90.0 + snoise(vec3(r * 40.0, 0.0, 0.0)) * 2.0);
        float gap = smoothstep(0.58, 0.6, r) * smoothstep(0.66, 0.64, r);
        float edge = smoothstep(0.0, 0.05, r) * smoothstep(1.0, 0.92, r);
        float a = opacity * bands * edge * (1.0 - gap * 0.9);
        gl_FragColor = vec4(tint * (0.7 + 0.5 * bands), a);
      }`,
  });
}
