// game-design.md §12: the full-screen solar system. Google-Maps navigation
// (zoom to cursor, drag, rotate), fly-to and follow, region picking, labels.
// Reads the store; never owns game state.
import { effect } from "@preact/signals";
import * as THREE from "three";
import { MapControls } from "three/addons/controls/MapControls.js";
import { BODIES, REGIONS } from "../../../rules/data/index.ts";
import { me, nations, offset, season, selBody, selRegion, world } from "../store.ts";
import { moonDistance, orbitRadius, position, regionAt, seeds, SIZE, sphereOf, SPHERES, type V3 } from "./layout.ts";
import { FleetLayer } from "./fleets.ts";
import { LOOK, regionMaterial } from "./regionMaterial.ts";

const SYSTEM_VIEW = { target: new THREE.Vector3(0, 0, 0), offset: new THREE.Vector3(0, 620, 560) };
const FLY_MS = 1100;
const GLOBE_DRAG = 22; // within SIZE × this, left-drag spins the globe

interface BodyView {
  id: string;
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  regions: string[];
  label: HTMLElement;
  moonOrbit?: THREE.LineLoop;
}

interface Flight { t0: number; fromTarget: THREE.Vector3; fromOffset: THREE.Vector3; body: string | null; toOffset: THREE.Vector3 }

const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
const v3 = (p: V3) => new THREE.Vector3(...p);

export class GameScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: MapControls;
  readonly scene = new THREE.Scene();
  focus: string | null = null;
  onPick: (body: string, region: string | null) => boolean = () => true; // false: don't fly there
  onBack: () => boolean = () => false; // true if the HUD handled Esc
  onFleet: (id: string) => void = () => {};

  private views = new Map<string, BodyView>();
  private orbits: { line: THREE.LineLoop; base: number }[] = [];
  private fleets: FleetLayer;
  private regionLabels = new Map<string, HTMLElement>();
  private flight: Flight | null = null;
  private lastFocusPos = new THREE.Vector3();
  private down: { x: number; y: number } | null = null;
  private hoverAt: { x: number; y: number } | null = null;
  private stop: (() => void)[] = [];
  private raf = 0;
  private overlay: HTMLElement;

  constructor(canvas: HTMLCanvasElement, overlay: HTMLElement) {
    this.overlay = overlay;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 720 ? 1.5 : 2));
    this.renderer.setClearColor(0x03050a);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.05, 40000);
    this.camera.position.copy(SYSTEM_VIEW.offset);
    this.controls = new MapControls(this.camera, canvas);
    Object.assign(this.controls, {
      enableDamping: true, dampingFactor: 0.12, zoomToCursor: true, screenSpacePanning: false,
      minDistance: 2, maxDistance: 2600, maxPolarAngle: Math.PI, zoomSpeed: 1.4, panSpeed: 1.2,
    });
    this.controls.addEventListener("start", () => (this.flight = null));

    this.buildSpace();
    this.fleets = new FleetLayer(this.scene);
    for (const id of SPHERES) this.buildBody(id);
    this.bindInput(canvas);
    this.stop.push(effect(() => this.paintOwners()));
    this.stop.push(effect(() => this.paintSelection()));
    this.resize();
    this.loop();
  }

  private now(): number {
    return Date.now() + offset.value;
  }

  private start(): number {
    return season.value?.startedAt ?? this.now();
  }

  bodyPos(id: string): THREE.Vector3 {
    return v3(position(id, this.now(), this.start()));
  }

  // --- building the scene ---------------------------------------------------

  private buildSpace(): void {
    const stars = new THREE.BufferGeometry();
    const pts: number[] = [];
    const col: number[] = [];
    for (let i = 0; i < 6000; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = 9000 + Math.random() * 6000;
      const s = Math.sqrt(1 - u * u);
      pts.push(r * s * Math.cos(th), r * u, r * s * Math.sin(th));
      const c = 0.55 + Math.random() * 0.45, warm = Math.random();
      col.push(c, c * (0.9 + warm * 0.1), c * (0.95 + (1 - warm) * 0.15));
    }
    stars.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    stars.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    this.scene.add(new THREE.Points(stars, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true })));

    const sun = new THREE.Mesh(new THREE.SphereGeometry(14, 48, 32), new THREE.MeshBasicMaterial({ color: 0xffe2a0 }));
    this.scene.add(sun);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialTexture(["rgba(255,220,150,0.9)", "rgba(255,170,80,0.35)", "rgba(255,140,60,0)"]),
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    }));
    glow.scale.setScalar(150);
    this.scene.add(glow);

    for (const id of SPHERES.filter((b) => !BODIES[b].parent)) {
      const line = ring(orbitRadius(BODIES[id].orbit.a), BODIES[id].zone === "belt" ? 0x4a4230 : 0x23324a, 0.9);
      this.orbits.push({ line, base: 0.9 });
      this.scene.add(line);
    }
  }

  private buildBody(id: string): void {
    const ss = seeds(id);
    const mat = regionMaterial(LOOK[id], ss.map((s) => s.dir));
    const detail = SIZE[id] > 3 ? 96 : 48;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(SIZE[id], detail, detail / 2), mat);
    mesh.userData.body = id;
    this.scene.add(mesh);
    if (id === "saturn") {
      const rings = new THREE.Mesh(
        new THREE.RingGeometry(SIZE[id] * 1.3, SIZE[id] * 2.2, 96),
        new THREE.MeshBasicMaterial({ color: 0xcdb48a, transparent: true, opacity: 0.45, side: THREE.DoubleSide }),
      );
      rings.rotation.x = -Math.PI / 2 + 0.45;
      mesh.add(rings);
    }
    const label = document.createElement("button");
    label.className = "label body";
    label.textContent = BODIES[id].name.replace(" orbital", "");
    label.tabIndex = -1;
    label.addEventListener("click", () => this.select(id, null));
    this.overlay.append(label);
    const view: BodyView = { id, mesh, mat, regions: ss.map((s) => s.region), label };
    if (BODIES[id].parent) {
      view.moonOrbit = ring(moonDistance(id), 0x24324a, 0.7);
      this.scene.add(view.moonOrbit);
    }
    this.views.set(id, view);
  }

  // --- what the store says ---------------------------------------------------

  private paintOwners(): void {
    const w = world.value;
    const ns = nations.value;
    const byId = new Map((w?.regions ?? []).map((r) => [r.id, r]));
    for (const v of this.views.values()) {
      const u = v.mat.uniforms;
      v.regions.forEach((id, i) => {
        const owner = byId.get(id)?.owner;
        const n = owner ? ns[owner] : undefined;
        u.owned.value[i] = n ? (owner === me.value ? 1 : 0.85) : 0;
        if (n) u.tints.value[i].set(n.primary);
      });
    }
  }

  private paintSelection(): void {
    const sel = selRegion.value;
    for (const v of this.views.values()) v.mat.uniforms.selected.value = sel ? v.regions.indexOf(sel) : -1;
  }

  // --- camera -------------------------------------------------------------------

  // From the HUD a region turns to face you; a click on the globe leaves the
  // camera be, so neighbouring regions stay easy to click.
  select(body: string, region: string | null, face = true): void {
    const sphere = sphereOf(body);
    const close = this.camera.position.distanceTo(this.bodyPos(sphere)) < SIZE[sphere] * GLOBE_DRAG;
    if (!this.onPick(body, region)) return;
    const seed = region && face ? seeds(sphere).find((x) => x.region === region) : undefined;
    if (seed) this.flyTo(sphere, v3(seed.dir));
    else if (this.focus !== sphere || !close) this.flyTo(sphere);
  }

  // Eases to a body (or the whole system); `face` turns a surface point to you.
  flyTo(sphere: string | null, face?: THREE.Vector3): void {
    const cur = this.camera.position.clone().sub(this.controls.target);
    let toOffset: THREE.Vector3;
    if (sphere && face) {
      const d = this.camera.position.distanceTo(this.bodyPos(sphere));
      const keep = d < SIZE[sphere] * GLOBE_DRAG ? cur.length() : SIZE[sphere] * 4.2;
      toOffset = face.clone().normalize().add(new THREE.Vector3(0, 0.25, 0)).normalize().multiplyScalar(keep);
    } else if (sphere) {
      // From the sunlit side, a little off-axis so the terminator shows.
      const sun = this.bodyPos(sphere).negate().setY(0).normalize();
      const side = new THREE.Vector3(-sun.z, 0, sun.x);
      const dir = sun.multiplyScalar(0.8).add(side.multiplyScalar(0.45)).add(new THREE.Vector3(0, 0.45, 0)).normalize();
      toOffset = dir.multiplyScalar(SIZE[sphere] * (BODIES[sphere].parent ? 7 : 5.5));
    } else {
      toOffset = SYSTEM_VIEW.offset.clone();
    }
    this.flight = { t0: performance.now(), fromTarget: this.controls.target.clone(), fromOffset: cur, body: sphere, toOffset };
    this.focus = sphere;
    if (sphere) this.lastFocusPos.copy(this.bodyPos(sphere));
  }

  toSystem(): void {
    this.flyTo(null);
  }

  zoomBy(f: number): void {
    const off = this.camera.position.clone().sub(this.controls.target).multiplyScalar(f);
    const d = THREE.MathUtils.clamp(off.length(), this.controls.minDistance, this.controls.maxDistance);
    this.camera.position.copy(this.controls.target).add(off.setLength(d));
  }

  private pan(dx: number, dz: number): void {
    const d = this.camera.position.distanceTo(this.controls.target) * 0.04;
    const fwd = new THREE.Vector3().subVectors(this.controls.target, this.camera.position).setY(0).normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
    const move = right.multiplyScalar(dx * d).add(fwd.multiplyScalar(dz * d));
    this.focus = null;
    this.camera.position.add(move);
    this.controls.target.add(move);
  }

  private rotate(a: number): void {
    const off = this.camera.position.clone().sub(this.controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
    this.camera.position.copy(this.controls.target).add(off);
  }

  // --- input ---------------------------------------------------------------------

  private bindInput(canvas: HTMLCanvasElement): void {
    const onDown = (e: PointerEvent) => (this.down = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      if (this.down && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) < 5 && e.button === 0) this.click(e);
      this.down = null;
    };
    const onMove = (e: PointerEvent) => (this.hoverAt = { x: e.clientX, y: e.clientY });
    const onLeave = () => (this.hoverAt = null);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    const onKey = (e: KeyboardEvent) => this.key(e);
    addEventListener("keydown", onKey);
    const onResize = () => this.resize();
    addEventListener("resize", onResize);
    this.stop.push(() => {
      removeEventListener("keydown", onKey);
      removeEventListener("resize", onResize);
    });
  }

  private key(e: KeyboardEvent): void {
    if ((e.target as HTMLElement).closest("input, select, textarea") || e.metaKey || e.ctrlKey) return;
    const k = e.key.toLowerCase();
    const pans: Record<string, [number, number]> = {
      arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0], arrowup: [0, 1], w: [0, 1], arrowdown: [0, -1], s: [0, -1],
    };
    if (pans[k]) {
      e.preventDefault();
      this.pan(...pans[k]);
    } else if (k === "q") this.rotate(0.12);
    else if (k === "e") this.rotate(-0.12);
    else if (k === "+" || k === "=") this.zoomBy(0.8);
    else if (k === "-" || k === "_") this.zoomBy(1.25);
    else if (k === "]" || k === "[") {
      const i = SPHERES.indexOf(this.focus ?? sphereOf(selBody.value ?? "earth"));
      const next = SPHERES[(i + (k === "]" ? 1 : -1) + SPHERES.length) % SPHERES.length];
      this.select(next, null);
    } else if (k === "escape") {
      if (!this.onBack()) this.toSystem();
    }
  }

  private ray(x: number, y: number): THREE.Raycaster {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    return ray;
  }

  // Nearest body under the cursor, with a minimum on-screen hit size so small
  // moons stay clickable from far away.
  private hit(x: number, y: number): { body: string; dir: V3 | null } | null {
    const ray = this.ray(x, y).ray;
    let best: { body: string; dir: V3 | null; t: number } | null = null;
    for (const v of this.views.values()) {
      const c = v.mesh.position;
      const dist = this.camera.position.distanceTo(c);
      if (!v.mesh.visible) continue;
      const real = SIZE[v.id] * v.mesh.scale.x;
      const r = Math.max(real, dist * 0.018);
      const oc = ray.origin.clone().sub(c);
      const b = oc.dot(ray.direction), q = oc.lengthSq() - r * r, disc = b * b - q;
      if (disc < 0) continue;
      const t = -b - Math.sqrt(disc);
      if (t < 0 || (best && t > best.t)) continue;
      let dir: V3 | null = null;
      const qr = oc.lengthSq() - real * real, dr = b * b - qr;
      if (dr >= 0) {
        const p = ray.at(-b - Math.sqrt(dr), new THREE.Vector3()).sub(c).normalize();
        dir = [p.x, p.y, p.z];
      }
      best = { body: v.id, dir, t };
    }
    return best;
  }

  private click(e: PointerEvent): void {
    const r = this.renderer.domElement.getBoundingClientRect();
    const fleet = this.fleets.pick(e.clientX - r.left, e.clientY - r.top, this.camera, r.width, r.height);
    if (fleet) return this.onFleet(fleet);
    const h = this.hit(e.clientX, e.clientY);
    if (!h) return;
    const close = this.camera.position.distanceTo(this.bodyPos(h.body)) < SIZE[h.body] * GLOBE_DRAG;
    if (!close || !h.dir) return this.select(h.body, null);
    const region = regionAt(h.body, h.dir);
    this.select(REGIONS[region].body, region, false);
  }

  // --- per frame -------------------------------------------------------------------

  private resize(): void {
    const c = this.renderer.domElement;
    const w = c.clientWidth || innerWidth, h = c.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    if (document.hidden) return;
    this.frame();
  };

  private frame(): void {
    const cam = this.camera.position;
    for (const v of this.views.values()) {
      v.mesh.position.copy(this.bodyPos(v.id));
      const parent = BODIES[v.id].parent;
      // A minimum on-screen size so the inner planets read from far out;
      // moons only appear once you're near their planet.
      const d = cam.distanceTo(v.mesh.position);
      const near = parent ? cam.distanceTo(this.bodyPos(parent)) < SIZE[parent] * 40 : true;
      v.mesh.visible = near;
      v.mesh.scale.setScalar(parent ? 1 : Math.max(1, (d * 0.009) / SIZE[v.id]));
      if (v.moonOrbit) {
        v.moonOrbit.position.copy(this.bodyPos(parent!));
        v.moonOrbit.visible = near;
      }
    }

    if (this.focus) {
      const p = this.bodyPos(this.focus);
      const delta = p.clone().sub(this.lastFocusPos);
      this.lastFocusPos.copy(p);
      if (!this.flight) {
        this.camera.position.add(delta);
        this.controls.target.add(delta);
      }
    }

    if (this.flight) {
      const f = this.flight;
      const k = ease(Math.min(1, (performance.now() - f.t0) / FLY_MS));
      const goal = f.body ? this.bodyPos(f.body) : SYSTEM_VIEW.target;
      this.controls.target.lerpVectors(f.fromTarget, goal, k);
      const off = new THREE.Vector3().lerpVectors(f.fromOffset, f.toOffset, k);
      const len = Math.exp(THREE.MathUtils.lerp(Math.log(f.fromOffset.length()), Math.log(f.toOffset.length()), k));
      this.camera.position.copy(this.controls.target).add(off.setLength(len));
      if (k >= 1) this.flight = null;
    }

    // Orbit lines fade out as you close on a body, so they don't slice it.
    const fade = THREE.MathUtils.clamp((this.camera.position.distanceTo(this.controls.target) - 25) / 90, 0, 1);
    for (const o of this.orbits) (o.line.material as THREE.LineBasicMaterial).opacity = o.base * fade;

    const focusR = this.focus ? SIZE[this.focus] : 0;
    this.controls.minDistance = this.focus ? focusR * 1.25 : 2;
    const dist = this.camera.position.distanceTo(this.controls.target);
    const globe = !!this.focus && dist < focusR * GLOBE_DRAG;
    this.controls.mouseButtons.LEFT = globe ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
    this.controls.touches.ONE = globe ? THREE.TOUCH.ROTATE : THREE.TOUCH.PAN;
    this.controls.update();

    this.fleets.update(this.now(), this.start(), this.camera);
    this.hover();
    this.labels();
    this.renderer.render(this.scene, this.camera);
  }

  private hover(): void {
    let body = "", idx = -1;
    if (this.hoverAt && !this.down) {
      const h = this.hit(this.hoverAt.x, this.hoverAt.y);
      if (h) {
        body = h.body;
        const close = this.camera.position.distanceTo(this.bodyPos(h.body)) < SIZE[h.body] * GLOBE_DRAG;
        if (close && h.dir) idx = this.views.get(h.body)!.regions.indexOf(regionAt(h.body, h.dir));
      }
    }
    for (const v of this.views.values()) v.mat.uniforms.hover.value = v.id === body ? idx : -1;
    this.renderer.domElement.style.cursor = body ? "pointer" : "";
  }

  private labels(): void {
    const w = innerWidth, h = innerHeight;
    const place = (el: HTMLElement, p: THREE.Vector3, show: boolean, dy = 0) => {
      const s = p.clone().project(this.camera);
      const on = show && s.z < 1 && Math.abs(s.x) < 1.1 && Math.abs(s.y) < 1.1;
      el.style.display = on ? "" : "none";
      if (on) el.style.transform = `translate(-50%, 0) translate(${((s.x + 1) / 2) * w}px, ${((1 - s.y) / 2) * h + dy}px)`;
    };
    const camPos = this.camera.position;
    for (const v of this.views.values()) {
      const p = v.mesh.position;
      const d = camPos.distanceTo(p);
      const parent = BODIES[v.id].parent;
      const near = parent ? camPos.distanceTo(this.bodyPos(parent)) < SIZE[parent] * 40 : true;
      const px = (SIZE[v.id] / d) * (h / 0.83);
      place(v.label, p, near && px < h * 0.18, Math.max(6, px * 0.5 + 4));
      v.label.classList.toggle("sel", !!selBody.value && sphereOf(selBody.value) === v.id);
      v.label.classList.toggle("mine", !!me.value && (world.value?.regions ?? []).some((r) => r.owner === me.value && sphereOf(r.body) === v.id));
    }
    const f = this.focus;
    const showRegions = !!f && camPos.distanceTo(this.bodyPos(f)) < SIZE[f] * 9;
    for (const [id, el] of this.regionLabels) if (!showRegions || REGIONS[id] && sphereOf(REGIONS[id].body) !== f) el.style.display = "none";
    if (!showRegions) return;
    const c = this.bodyPos(f!);
    for (const s of seeds(f!)) {
      let el = this.regionLabels.get(s.region);
      if (!el) {
        el = document.createElement("button");
        el.className = "label region";
        el.textContent = REGIONS[s.region].name;
        el.tabIndex = -1;
        el.addEventListener("click", () => this.select(REGIONS[s.region].body, s.region));
        this.overlay.append(el);
        this.regionLabels.set(s.region, el);
      }
      const p = v3(s.dir).multiplyScalar(SIZE[f!] * 1.01).add(c);
      const facing = v3(s.dir).dot(camPos.clone().sub(c).normalize()) > 0.25;
      place(el, p, facing, -8);
      const owner = world.value?.regions.find((r) => r.id === s.region)?.owner;
      el.classList.toggle("mine", owner === me.value);
      el.classList.toggle("sel", selRegion.value === s.region);
    }
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    for (const s of this.stop) s();
    this.controls.dispose();
    this.renderer.dispose();
    this.overlay.replaceChildren();
  }
}

function ring(r: number, color: number, opacity: number): THREE.LineLoop {
  const pts = Array.from({ length: 256 }, (_, i) => {
    const a = (i / 256) * Math.PI * 2;
    return new THREE.Vector3(r * Math.cos(a), 0, r * Math.sin(a));
  });
  return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
}

function radialTexture(stops: string[]): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  stops.forEach((s, i) => grad.addColorStop(i / (stops.length - 1), s));
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}
