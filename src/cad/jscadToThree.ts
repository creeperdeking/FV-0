import { geometries } from "@jscad/modeling";
import type { Geom3 } from "@jscad/modeling/src/geometries/types";
import * as THREE from "three";

/** JSCAD is Z-up; the Geometry tab is Y-up. */
function toThreeVertex(x: number, y: number, z: number): [number, number, number] {
  return [x, z, y];
}

/** Convert a JSCAD solid into a Three.js mesh geometry (flat-shaded triangles). */
export function geom3ToBufferGeometry(solid: Geom3): THREE.BufferGeometry {
  const polygons = geometries.geom3.toPolygons(solid);
  const positions: number[] = [];
  for (const polygon of polygons) {
    const verts = polygon.vertices;
    if (verts.length < 3) continue;
    const origin = verts[0]!;
    for (let i = 1; i < verts.length - 1; i += 1) {
      const a = verts[i]!;
      const b = verts[i + 1]!;
      positions.push(...toThreeVertex(origin[0], origin[1], origin[2]));
      positions.push(...toThreeVertex(a[0], a[1], a[2]));
      positions.push(...toThreeVertex(b[0], b[1], b[2]));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function meshFromGeom3(solid: Geom3, color: number, roughness = 0.6): THREE.Mesh {
  const geometry = geom3ToBufferGeometry(solid);
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0.04,
    side: THREE.DoubleSide,
  });
  return new THREE.Mesh(geometry, material);
}
