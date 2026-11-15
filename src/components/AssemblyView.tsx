import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Setup } from "../physics";

const STATOR_MM = 4;

function coneZ(radius: number, rOuter: number, alpha: number): number {
  return (rOuter - radius) * Math.tan(alpha);
}

function lathe(points: THREE.Vector2[], color: number): THREE.Mesh {
  const geometry = new THREE.LatheGeometry(points, 96);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.04, side: THREE.DoubleSide });
  return new THREE.Mesh(geometry, material);
}

function ringProfile(rInner: number, rOuter: number, zInner: number, zOuter: number, thickness: number): THREE.Vector2[] {
  return [
    new THREE.Vector2(rOuter, zOuter - thickness),
    new THREE.Vector2(rOuter, zOuter),
    new THREE.Vector2(rInner, zInner),
    new THREE.Vector2(rInner, zInner - thickness),
    new THREE.Vector2(rOuter, zOuter - thickness),
  ];
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

type Props = {
  setup: Setup;
};

type View = {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  content: THREE.Group;
  sun: THREE.DirectionalLight;
  span: number;
};

const AssemblyView: React.FC<Props> = ({ setup }) => {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<View | null>(null);

  useEffect(() => {
    const element = host.current;
    if (!element) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f3f0e8");
    const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 1_000_000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    element.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    scene.add(new THREE.AmbientLight(0xffffff, 0.72));
    const sun = new THREE.DirectionalLight(0xffffff, 1.25);
    scene.add(sun);
    const content = new THREE.Group();
    scene.add(content);
    view.current = { camera, controls, content, sun, span: 0 };

    const resize = () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      if (width === 0 || height === 0) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
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

    const rInner = setup.innerMm / 2;
    const rOuter = setup.outerMm / 2;
    const alpha = (setup.angleDeg * Math.PI) / 180;
    const thickness = setup.thicknessMm;
    const gap = Math.max(setup.gapUm * 1e-3, 0.04 * setup.outerMm);
    const feed = rInner + setup.feedFrac * (rOuter - rInner);
    const face = (radius: number) => coneZ(radius, rOuter, alpha);

    disposeObject(current.content);
    current.content.clear();

    const stator = lathe(ringProfile(rInner, rOuter, face(rInner), face(rOuter), STATOR_MM), 0x5f6f82);
    const disk = lathe(
      ringProfile(rInner, rOuter, face(rInner) + gap + thickness, face(rOuter) + gap + thickness, thickness),
      0xd4a24c,
    );
    current.content.add(stator, disk);

    const holeRadius = setup.orificeMm / 2;
    const holeLength = STATOR_MM / Math.cos(alpha);
    const holeGeometry = new THREE.CylinderGeometry(holeRadius, holeRadius, holeLength, 16);
    const holeMaterial = new THREE.MeshStandardMaterial({ color: 0x1c1412, roughness: 0.9 });
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < setup.nOrifices; i += 1) {
      const theta = (i / setup.nOrifices) * Math.PI * 2;
      const tilt = (setup.nozzleAngle * Math.PI) / 180;
      const normal = new THREE.Vector3(Math.sin(alpha) * Math.cos(theta), Math.cos(alpha), Math.sin(alpha) * Math.sin(theta));
      const tangent = new THREE.Vector3(-Math.sin(theta), 0, Math.cos(theta));
      const axis = normal.multiplyScalar(Math.cos(tilt)).addScaledVector(tangent, Math.sin(tilt)).normalize();
      const intoPlate = axis.clone().multiplyScalar(-1);
      const mesh = new THREE.Mesh(holeGeometry, holeMaterial);
      mesh.quaternion.setFromUnitVectors(up, intoPlate);
      mesh.position.set(feed * Math.cos(theta), face(feed), feed * Math.sin(theta));
      mesh.position.addScaledVector(intoPlate, holeLength / 2);
      current.content.add(mesh);
    }

    current.sun.position.set(rOuter, rOuter * 1.4, rOuter * 0.4);
    current.controls.target.set(0, face(feed), 0);
    const spanChanged = current.span === 0 || rOuter / current.span > 1.25 || current.span / rOuter > 1.25;
    if (spanChanged) {
      current.span = rOuter;
      current.camera.near = Math.max(0.05, rOuter * 0.001);
      current.camera.far = rOuter * 40;
      current.camera.position.set(rOuter * 1.15, rOuter * 1.45, rOuter * 2.05);
      current.camera.updateProjectionMatrix();
    }
    current.controls.update();
  }, [setup]);

  return <div ref={host} style={{ height: 680, borderRadius: 8, overflow: "hidden" }} />;
};

export default AssemblyView;
