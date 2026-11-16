import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "react-bootstrap";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { assemblyExtents, buildAssembly, CAD_GEOMETRY_REV } from "../cad/assembly";
import { meshFromGeom3 } from "../cad/jscadToThree";
import type { Setup } from "../physics";

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
  span: number;
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
  const [building, setBuilding] = useState(false);
  const stale = pendingSig !== builtSig || builtRev !== CAD_GEOMETRY_REV;

  useEffect(() => {
    const element = host.current;
    if (!element) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f3f0e8");
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 1_000_000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    element.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
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

    view.current = { camera, controls, content, sun, span: 0, fitOrtho };

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
      controls.update();
      renderer.render(scene, camera);
    };
    draw();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
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
    const timer = window.setTimeout(() => {
      if (cancel || !view.current) return;
      const live = view.current;
      const drawnGapMm = Math.max(built.gapUm * 1e-3, 0.04 * built.setup.outerMm);
      const { rOuter, faceAtFeed } = assemblyExtents(built.setup);

      disposeObject(live.content);
      live.content.clear();

      const solids = buildAssembly({
        setup: built.setup,
        gapMm: drawnGapMm,
        orificeMm: built.orificeMm,
        washerMm: built.washerMm,
        segments: Math.min(72, Math.max(36, Math.round(48 + built.setup.nOrifices))),
      });
      live.content.add(meshFromGeom3(solids.distributor, 0x3d7ea6, 0.5));
      live.content.add(meshFromGeom3(solids.stator, 0x5f6f82, 0.55));
      live.content.add(meshFromGeom3(solids.disk, 0xd4a24c, 0.62));

      live.sun.position.copy(ISO_DIR).multiplyScalar(rOuter * 3);
      const spanChanged = live.span === 0 || rOuter / live.span > 1.25 || live.span / rOuter > 1.25;
      live.span = rOuter;
      live.fitOrtho(rOuter);
      if (spanChanged) {
        frameIsometric(live.camera, live.controls, rOuter, faceAtFeed);
      } else {
        live.controls.target.set(0, faceAtFeed, 0);
      }
      live.controls.update();
      if (!cancel) setBuilding(false);
    }, 0);

    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [built, builtRev]);

  const reload = () => {
    setBuilt(pending);
    setBuiltSig(pendingSig);
    setBuiltRev(CAD_GEOMETRY_REV);
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
      <div className="d-flex align-items-center gap-2 mb-2">
        <Button variant={stale ? "dark" : "outline-secondary"} size="sm" onClick={reload} disabled={building}>
          Reload CAD view
        </Button>
        {stale ? <span className="small text-secondary">CAD or parameters changed — rebuild to see the new solids</span> : null}
        {building ? <span className="small text-secondary">Building…</span> : null}
      </div>
      <div ref={host} style={{ height: 680, borderRadius: 8, overflow: "hidden" }} />
    </div>
  );
};

export default AssemblyView;
