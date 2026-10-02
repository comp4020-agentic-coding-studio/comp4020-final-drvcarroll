// game-design.md §12: fleets you have vision on, as glowing markers; in
// transit along their transfer arc; and the arc a launch you're aiming would
// fly. Nothing is drawn for a fleet outside your vision.
import * as THREE from "three";
import { BODIES } from "../../../rules/data/index.ts";
import { mods } from "../../../rules/economy.ts";
import type { Fleet } from "../../../rules/index.ts";
import { travelMs } from "../../../rules/orbit.ts";
import { mirror } from "../mirror.ts";
import { launchTo, me, nations, selFleet, world } from "../store.ts";
import { position, SIZE, sphereOf } from "./layout.ts";

interface Mark { marker: THREE.Mesh; arc?: THREE.Line; key: string }

const ARC_SEGMENTS = 64;

function arcPoints(a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3[] {
  const lift = a.distanceTo(b) * 0.12;
  return Array.from({ length: ARC_SEGMENTS + 1 }, (_, i) => {
    const k = i / ARC_SEGMENTS;
    return new THREE.Vector3().lerpVectors(a, b, k).setY(Math.sin(Math.PI * k) * lift);
  });
}

function dashed(points: THREE.Vector3[], color: THREE.ColorRepresentation, opacity: number): THREE.Line {
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineDashedMaterial({ color, dashSize: 3, gapSize: 2.2, transparent: true, opacity }),
  );
  line.computeLineDistances();
  return line;
}

export class FleetLayer {
  private marks = new Map<string, Mark>();
  private preview: THREE.Line | null = null;
  private previewKey = "";
  private group = new THREE.Group();

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  update(now: number, start: number, camera: THREE.Camera): void {
    const fleets = world.value?.fleets ?? [];
    const seen = new Set<string>();
    const orbitIndex = new Map<string, number>();
    for (const f of fleets) {
      seen.add(f.id);
      const colour = nations.value[f.owner]?.primary ?? "#ffffff";
      const key = `${colour}|${f.transit?.departAt ?? f.at}`;
      let m = this.marks.get(f.id);
      if (!m || m.key !== key) {
        if (m) this.drop(m);
        m = this.make(f, colour, key, start);
        this.marks.set(f.id, m);
      }
      const p = this.positionOf(f, now, start, orbitIndex);
      m.marker.position.copy(p);
      const d = camera.position.distanceTo(p);
      m.marker.scale.setScalar(Math.max(0.12, d * 0.007) * (selFleet.value === f.id ? 1.4 : 1));
      m.marker.rotation.y = now / 700;
    }
    for (const [id, m] of this.marks) if (!seen.has(id)) {
      this.drop(m);
      this.marks.delete(id);
    }
    this.updatePreview(now, start, fleets);
  }

  private positionOf(f: Fleet, now: number, start: number, orbitIndex: Map<string, number>): THREE.Vector3 {
    if (f.transit) {
      const { from, to, departAt, arriveAt } = f.transit;
      const a = new THREE.Vector3(...position(from, departAt, start));
      const b = new THREE.Vector3(...position(to, arriveAt, start));
      const k = THREE.MathUtils.clamp((now - departAt) / (arriveAt - departAt), 0, 1);
      return new THREE.Vector3().lerpVectors(a, b, k).setY(Math.sin(Math.PI * k) * a.distanceTo(b) * 0.12);
    }
    const body = sphereOf(f.at!);
    const n = orbitIndex.get(body) ?? 0;
    orbitIndex.set(body, n + 1);
    const c = new THREE.Vector3(...position(f.at!, now, start));
    const ang = now / 4000 + n * 1.3;
    const r = SIZE[body] * 1.7 + 0.6;
    return c.add(new THREE.Vector3(Math.cos(ang) * r, SIZE[body] * 0.35, Math.sin(ang) * r));
  }

  private make(f: Fleet, colour: string, key: string, start: number): Mark {
    const mine = f.owner === me.value;
    const marker = new THREE.Mesh(
      new THREE.OctahedronGeometry(1, 0),
      new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: mine ? 1 : 0.85 }),
    );
    marker.userData.fleet = f.id;
    this.group.add(marker);
    const m: Mark = { marker, key };
    if (f.transit) {
      const a = new THREE.Vector3(...position(f.transit.from, f.transit.departAt, start));
      const b = new THREE.Vector3(...position(f.transit.to, f.transit.arriveAt, start));
      m.arc = dashed(arcPoints(a, b), colour, 0.55);
      this.group.add(m.arc);
    }
    return m;
  }

  private drop(m: Mark): void {
    for (const o of [m.marker, m.arc]) {
      if (!o) continue;
      this.group.remove(o);
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  }

  // The arc a launch you're aiming would fly, to where the target will be.
  private updatePreview(now: number, start: number, fleets: Fleet[]): void {
    const f = fleets.find((x) => x.id === selFleet.value);
    const to = launchTo.value;
    const n = mirror.value?.nations[me.value ?? ""];
    const key = f?.at && to && n ? `${f.id}>${to}>${Math.floor(now / 1000)}` : "";
    if (key === this.previewKey) return;
    this.previewKey = key;
    if (this.preview) {
      this.group.remove(this.preview);
      this.preview.geometry.dispose();
      this.preview = null;
    }
    if (!key || !f || !to || !n || !BODIES[to]) return;
    const ships = Object.fromEntries(Object.entries(f.units).filter(([u]) => u !== "army"));
    const arrive = now + travelMs(f.at!, to, ships, mods(n));
    const a = new THREE.Vector3(...position(f.at!, now, start));
    const b = new THREE.Vector3(...position(to, arrive, start));
    this.preview = dashed(arcPoints(a, b), "#7be3d4", 0.95);
    this.group.add(this.preview);
  }

  // The fleet marker nearest a screen point, within a few pixels.
  pick(x: number, y: number, camera: THREE.Camera, w: number, h: number): string | null {
    let best: string | null = null, bestD = 16;
    for (const [id, m] of this.marks) {
      const s = m.marker.position.clone().project(camera);
      if (s.z > 1) continue;
      const d = Math.hypot(((s.x + 1) / 2) * w - x, ((1 - s.y) / 2) * h - y);
      if (d < bestD) [best, bestD] = [id, d];
    }
    return best;
  }
}
