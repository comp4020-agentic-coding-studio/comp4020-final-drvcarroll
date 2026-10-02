// Mounts the full-screen map once; the HUD steers it through focusOn().
import { signal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { GameScene } from "../scene/GameScene.ts";
import { sphereOf } from "../scene/layout.ts";
import { drawer, launchTo, selBody, selFleet, selRegion, world } from "../store.ts";

export const scene = signal<GameScene | null>(null);

// While a fleet in orbit is selected, clicking another body aims it there.
function picked(body: string, region: string | null): boolean {
  const f = world.value?.fleets.find((x) => x.id === selFleet.value);
  if (f?.at && sphereOf(body) !== sphereOf(f.at)) {
    launchTo.value = body;
    return false;
  }
  selFleet.value = null;
  launchTo.value = null;
  selBody.value = body;
  selRegion.value = region;
  return true;
}

// Esc steps back one level: aim, fleet, drawer, region; then the system view.
function back(): boolean {
  if (launchTo.value) launchTo.value = null;
  else if (selFleet.value) selFleet.value = null;
  else if (drawer.value) drawer.value = null;
  else if (selRegion.value) selRegion.value = null;
  else {
    selBody.value = null;
    return false; // and the camera backs out to the whole system
  }
  return true;
}

export function focusOn(body: string, region: string | null = null): void {
  if (scene.value) scene.value.select(body, region);
  else picked(body, region);
}

export function selectFleet(id: string): void {
  const f = world.value?.fleets.find((x) => x.id === id);
  selFleet.value = id;
  launchTo.value = null;
  selRegion.value = null;
  const at = f?.at ?? f?.transit?.to;
  if (at && scene.value) scene.value.flyTo(sphereOf(at));
}

export function SceneHost() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const s = new GameScene(canvas.current!, labels.current!);
    s.onPick = picked;
    s.onBack = back;
    s.onFleet = selectFleet;
    scene.value = s;
    (window as unknown as { scene: GameScene }).scene = s;
    return () => {
      s.dispose();
      scene.value = null;
    };
  }, []);
  return (
    <>
      <canvas ref={canvas} class="scene" aria-label="Solar system map: drag to pan, scroll to zoom, click a body or region" />
      <div ref={labels} class="labels" />
    </>
  );
}
