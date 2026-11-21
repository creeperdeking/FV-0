import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button, Form } from "react-bootstrap";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  assemblyExtents,
  CAD_GEOMETRY_REV,
  exportFaceSegmentsForSetup,
  getCachedAssembly,
  previewSegmentsForSetup,
  STL_FORM_ERROR_MM,
} from "../cad/assembly";
import { meshFromGeom3 } from "../cad/jscadToThree";
import { exportPartStl, type StlPart } from "../cad/stlExport";
import type { Setup } from "../physics";

const PART_KEYS = ["disk", "stator"] as const;
type PartKey = (typeof PART_KEYS)[number];

const PART_LABELS: Record<PartKey, string> = {
  disk: "Disk",
  stator: "Stator + distributor",
};

const DEFAULT_VISIBLE: Record<PartKey, boolean> = {
  disk: true,
  stator: true,
};

const PART_VISIBILITY_KEY = "fv0-cad-parts-visible";
const SECTION_XZ_KEY = "fv0-cad-section-xz";
const CAMERA_KEY = "fv0-cad-camera";

type CameraState = {
  position: [number, number, number];
  target: [number, number, number];
  zoom: number;
};

function readStoredVisibility(): Record<PartKey, boolean> {
  try {
    const raw = localStorage.getItem(PART_VISIBILITY_KEY);
    if (!raw) return { ...DEFAULT_VISIBLE };
    const parsed = JSON.parse(raw) as Partial<Record<PartKey, unknown>>;
    const next = { ...DEFAULT_VISIBLE };
    for (const key of PART_KEYS) {
      if (typeof parsed[key] === "boolean") next[key] = parsed[key];
    }
    return next;
  } catch {
    return { ...DEFAULT_VISIBLE };
  }
}

function readStoredSectionXz(): boolean {
  try {
    return localStorage.getItem(SECTION_XZ_KEY) === "1";
  } catch {
    return false;
  }
}

function isVec3Tuple(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    typeof value[2] === "number" &&
    value.every((n) => Number.isFinite(n))
  );
}

function clearStoredCamera(): void {
  try {
    localStorage.removeItem(CAMERA_KEY);
  } catch {
    /* ignore */
  }
}

/** Reject degenerate views (eye on target, absurd zoom) that leave a blank canvas. */
function isUsableCameraState(state: CameraState, span: number): boolean {
  if (!(state.zoom >= 0.05 && state.zoom <= 80)) return false;
  const dx = state.position[0] - state.target[0];
  const dy = state.position[1] - state.target[1];
  const dz = state.position[2] - state.target[2];
  const dist = Math.hypot(dx, dy, dz);
  const minDist = Math.max(1, span * 0.05);
  const maxDist = Math.max(span * 80, minDist * 2);
  return dist >= minDist && dist <= maxDist;
}

function readStoredCamera(span: number): CameraState | null {
  try {
    const raw = localStorage.getItem(CAMERA_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CameraState>;
    if (!isVec3Tuple(parsed.position) || !isVec3Tuple(parsed.target)) {
      clearStoredCamera();
      return null;
    }
    if (typeof parsed.zoom !== "number" || !Number.isFinite(parsed.zoom) || parsed.zoom <= 0) {
      clearStoredCamera();
      return null;
    }
    const state: CameraState = { position: parsed.position, target: parsed.target, zoom: parsed.zoom };
    if (!isUsableCameraState(state, span)) {
      clearStoredCamera();
      return null;
    }
    return state;
  } catch {
    clearStoredCamera();
    return null;
  }
}

function writeStoredCamera(camera: THREE.OrthographicCamera, controls: OrbitControls, span: number): void {
  try {
    const state: CameraState = {
      position: camera.position.toArray() as [number, number, number],
      target: controls.target.toArray() as [number, number, number],
      zoom: camera.zoom,
    };
    if (!isUsableCameraState(state, span)) return;
    localStorage.setItem(CAMERA_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function applyCameraState(
  camera: THREE.OrthographicCamera,
  controls: OrbitControls,
  state: CameraState,
  span: number,
): void {
  camera.position.fromArray(state.position);
  controls.target.fromArray(state.target);
  camera.zoom = state.zoom;
  camera.near = Math.max(0.05, span * 0.001);
  camera.far = span * 40;
  camera.updateProjectionMatrix();
}

/**
 * Model (JSCAD) XZ plane is y = 0. After Z-up → Y-up conversion that becomes
 * Three.js z = 0 — a vertical diametral cut through the assembly.
 */
const SECTION_XZ_PLANE = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

function applySectionClipping(root: THREE.Object3D, enabled: boolean): void {
  const planes = enabled ? [SECTION_XZ_PLANE] : [];
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      const standard = material as THREE.MeshStandardMaterial;
      standard.clippingPlanes = planes;
      standard.clipShadows = enabled;
      standard.needsUpdate = true;
    }
  });
}

function disposeObject(object: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((item) => materials.add(item));
    else if (material) materials.add(material);
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

type CadInputs = {
  setup: Setup;
  gapUm: number;
  orificeMm: number;
  washerMm: number;
};

function cadSignature(inputs: CadInputs): string {
  return JSON.stringify(inputs);
}

type Props = CadInputs;

/** True isometric direction in a Y-up scene (equal foreshortening on X/Y/Z). */
const ISO_DIR = new THREE.Vector3(1, 1, 1).normalize();

type View = {
  camera: THREE.OrthographicCamera;
  controls: OrbitControls;
  content: THREE.Group;
  sun: THREE.DirectionalLight;
  renderer: THREE.WebGLRenderer;
  span: number;
  faceAtFeed: number;
  framed: boolean;
  fitOrtho: (span: number) => void;
};

function frameIsometric(camera: THREE.OrthographicCamera, controls: OrbitControls, span: number, targetY: number): void {
  const target = new THREE.Vector3(0, targetY, 0);
  const distance = span * 4;
  camera.position.copy(target).addScaledVector(ISO_DIR, distance);
  camera.near = Math.max(0.05, span * 0.001);
  camera.far = span * 40;
  camera.zoom = 1;
  camera.updateProjectionMatrix();
  controls.target.copy(target);
}

const AssemblyView: React.FC<Props> = ({ setup, gapUm, orificeMm, washerMm }) => {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<View | null>(null);
  const pending = useMemo(() => ({ setup, gapUm, orificeMm, washerMm }), [setup, gapUm, orificeMm, washerMm]);
  const pendingSig = useMemo(() => cadSignature(pending), [pending]);
  const [built, setBuilt] = useState<CadInputs>(pending);
  const [builtSig, setBuiltSig] = useState(pendingSig);
  const [builtRev, setBuiltRev] = useState(CAD_GEOMETRY_REV);
  const [building, setBuilding] = useState(true);
  const [exporting, setExporting] = useState<StlPart | null>(null);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const [visible, setVisible] = useState<Record<PartKey, boolean>>(readStoredVisibility);
  const [sectionXz, setSectionXz] = useState(readStoredSectionXz);
  const faceSegs = useMemo(() => exportFaceSegmentsForSetup(setup), [setup]);
  const bodySegs = useMemo(() => previewSegmentsForSetup(setup), [setup]);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const sectionRef = useRef(sectionXz);
  sectionRef.current = sectionXz;
  const stale = pendingSig !== builtSig || builtRev !== CAD_GEOMETRY_REV;

  useEffect(() => {
    try {
      localStorage.setItem(PART_VISIBILITY_KEY, JSON.stringify(visible));
    } catch {
      /* ignore */
    }
  }, [visible]);

  useEffect(() => {
    try {
      localStorage.setItem(SECTION_XZ_KEY, sectionXz ? "1" : "0");
    } catch {
      /* ignore */
    }
    const live = view.current;
    if (!live) return;
    live.renderer.localClippingEnabled = sectionXz;
    applySectionClipping(live.content, sectionXz);
  }, [sectionXz]);

  useEffect(() => {
    const element = host.current;
    if (!element) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f3f0e8");
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 1_000_000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.localClippingEnabled = sectionRef.current;
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    element.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    const persistCamera = () => {
      const live = view.current;
      if (!live?.framed || live.span <= 0) return;
      writeStoredCamera(camera, controls, live.span);
    };
    controls.addEventListener("end", persistCamera);
    scene.add(new THREE.AmbientLight(0xffffff, 0.72));
    const sun = new THREE.DirectionalLight(0xffffff, 1.25);
    scene.add(sun);
    const content = new THREE.Group();
    scene.add(content);

    const fitOrtho = (span: number) => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      if (width === 0 || height === 0) return;
      const aspect = width / height;
      // Half-extent so the disk diameter (~2×span) fills most of the view with margin.
      const half = span * 1.35;
      camera.left = -half * aspect;
      camera.right = half * aspect;
      camera.top = half;
      camera.bottom = -half;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    view.current = { camera, controls, content, sun, renderer, span: 0, faceAtFeed: 0, framed: false, fitOrtho };

    const resize = () => {
      if (!view.current) return;
      fitOrtho(view.current.span || 1);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);

    let frame = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      // Skip work while the Geometry tab is hidden (zero-size host).
      if (element.clientWidth === 0 || element.clientHeight === 0) return;
      controls.update();
      renderer.render(scene, camera);
    };
    draw();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      persistCamera();
      controls.removeEventListener("end", persistCamera);
      controls.dispose();
      disposeObject(content);
      renderer.dispose();
      element.removeChild(renderer.domElement);
      view.current = null;
    };
  }, []);

  useEffect(() => {
    const current = view.current;
    if (!current) return;

    let cancel = false;
    setBuilding(true);

    const run = async () => {
      // Let the app chrome paint before starting heavy CSG.
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (cancel || !view.current) return;

      const live = view.current;
      const drawnGapMm = Math.max(built.gapUm * 1e-3, 0.04 * built.setup.outerMm);
      const { rOuter, faceAtFeed } = assemblyExtents(built.setup);

      const solids = await getCachedAssembly({
        setup: built.setup,
        gapMm: drawnGapMm,
        orificeMm: built.orificeMm,
        washerMm: built.washerMm,
        segments: previewSegmentsForSetup(built.setup),
      });
      if (cancel || !view.current) return;

      disposeObject(live.content);
      live.content.clear();

      const parts: { key: PartKey; solid: typeof solids.disk; color: number; roughness: number }[] = [
        { key: "stator", solid: solids.stator, color: 0x5f6f82, roughness: 0.55 },
        { key: "disk", solid: solids.disk, color: 0xd4a24c, roughness: 0.62 },
      ];
      const shown = visibleRef.current;
      for (const part of parts) {
        const mesh = meshFromGeom3(part.solid, part.color, part.roughness);
        mesh.name = part.key;
        mesh.visible = shown[part.key];
        live.content.add(mesh);
        // Yield between meshing parts so the tab stays interactive.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        if (cancel) return;
      }
      live.renderer.localClippingEnabled = sectionRef.current;
      applySectionClipping(live.content, sectionRef.current);

      live.sun.position.copy(ISO_DIR).multiplyScalar(rOuter * 3);
      const firstFrame = !live.framed;
      live.span = rOuter;
      live.faceAtFeed = faceAtFeed;
      live.fitOrtho(rOuter);
      if (firstFrame) {
        const stored = readStoredCamera(rOuter);
        if (stored) {
          applyCameraState(live.camera, live.controls, stored, rOuter);
        } else {
          frameIsometric(live.camera, live.controls, rOuter, faceAtFeed);
        }
        live.framed = true;
        writeStoredCamera(live.camera, live.controls, rOuter);
      } else {
        // Keep the current view across CAD reloads; only refresh clip planes for scale.
        live.camera.near = Math.max(0.05, rOuter * 0.001);
        live.camera.far = rOuter * 40;
        live.camera.updateProjectionMatrix();
        writeStoredCamera(live.camera, live.controls, rOuter);
      }
      live.controls.update();
      if (!cancel) setBuilding(false);
    };

    void run();
    return () => {
      cancel = true;
    };
  }, [built, builtRev]);

  useEffect(() => {
    const live = view.current;
    if (!live) return;
    for (const key of PART_KEYS) {
      const object = live.content.getObjectByName(key);
      if (object) object.visible = visible[key];
    }
  }, [visible]);

  const reload = () => {
    setBuilt(pending);
    setBuiltSig(pendingSig);
    setBuiltRev(CAD_GEOMETRY_REV);
  };

  const resetView = () => {
    const live = view.current;
    if (!live || live.span <= 0) return;
    frameIsometric(live.camera, live.controls, live.span, live.faceAtFeed);
    live.framed = true;
    live.controls.update();
    writeStoredCamera(live.camera, live.controls, live.span);
  };

  const togglePart = (key: PartKey) => {
    setVisible((current) => ({ ...current, [key]: !current[key] }));
  };

  const downloadStl = async (part: StlPart) => {
    if (exporting) return;
    setExporting(part);
    setExportNote(null);
    try {
      const result = await exportPartStl(
        part,
        { setup: pending.setup, orificeMm: pending.orificeMm, washerMm: pending.washerMm },
        (progress) => {
          if (progress.phase === "building") {
            setExportNote(
              `Building ${part}: contact face ${progress.faceSegments} seg (≤${STL_FORM_ERROR_MM * 1e3} µm), body ${progress.bodySegments} seg…`,
            );
          } else if (progress.phase === "serializing") {
            setExportNote("Writing STL…");
          }
        },
      );
      setExportNote(
        `Downloaded ${part} STL (face ${result.faceSegments} / body ${result.bodySegments} seg, ≤${result.formErrorUm} µm on contact).`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Export failed";
      setExportNote(message);
    } finally {
      setExporting(null);
    }
  };

  // Solid-building HMR does not change setup params — rebuild automatically when assembly.ts updates.
  useEffect(() => {
    const hot = (import.meta as ImportMeta & {
      hot?: { accept: (dep: string, cb: () => void) => void };
    }).hot;
    if (!hot) return undefined;
    hot.accept("../cad/assembly", () => {
      setBuilt({ ...pending });
      setBuiltSig(cadSignature(pending));
      setBuiltRev(CAD_GEOMETRY_REV);
    });
    return undefined;
  }, [pending]);

  return (
    <div>
      <div className="d-flex align-items-center gap-2 mb-2 flex-wrap">
        <Button variant={stale ? "dark" : "outline-secondary"} size="sm" onClick={reload} disabled={building || !!exporting}>
          Reload CAD view
        </Button>
        <Button variant="outline-secondary" size="sm" onClick={resetView} disabled={building || !!exporting}>
          Reset view
        </Button>
        <Button
          variant="outline-dark"
          size="sm"
          onClick={() => void downloadStl("disk")}
          disabled={building || !!exporting}
          title={`Contact floor at ${faceSegs} seg (≤${STL_FORM_ERROR_MM * 1e3} µm); ribs/rim at ${bodySegs} seg`}
        >
          {exporting === "disk" ? "Exporting disk…" : "Download disk STL"}
        </Button>
        <Button
          variant="outline-dark"
          size="sm"
          onClick={() => void downloadStl("stator")}
          disabled={building || !!exporting}
          title={`Contact plate at ${faceSegs} seg (≤${STL_FORM_ERROR_MM * 1e3} µm); ribs/torus/cones at ${bodySegs} seg`}
        >
          {exporting === "stator" ? "Exporting stator…" : "Download stator STL"}
        </Button>
        {stale ? <span className="small text-secondary">CAD or parameters changed — rebuild to see the new solids</span> : null}
        {building ? <span className="small text-secondary">Building…</span> : null}
        {exportNote ? <span className="small text-secondary">{exportNote}</span> : null}
      </div>
      <div className="d-flex align-items-center gap-3 mb-2 flex-wrap">
        <span className="small text-secondary">Show</span>
        {PART_KEYS.map((key) => (
          <Form.Check
            key={key}
            type="switch"
            id={`cad-part-${key}`}
            label={PART_LABELS[key]}
            checked={visible[key]}
            onChange={() => togglePart(key)}
            className="mb-0"
          />
        ))}
        <Form.Check
          type="switch"
          id="cad-section-xz"
          label="Section XZ"
          checked={sectionXz}
          onChange={() => setSectionXz((value) => !value)}
          className="mb-0"
          title="Clip on the model XZ plane to look inside"
        />
      </div>
      <div ref={host} style={{ height: 680, borderRadius: 8, overflow: "hidden" }} />
    </div>
  );
};

export default AssemblyView;
