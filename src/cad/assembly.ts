/**
 * Parametric FV-0 assembly in JSCAD (@jscad/modeling).
 * Solids are Z-up; convert with jscadToThree for the viewer.
 *
 * The disk is a lean shell: continuous conical floor, inner rim, open outer edge,
 * hollow inside, stiffened by radial vertical ribs. All skins are 1 mm.
 */
import { booleans, extrusions, maths, primitives, transforms } from "@jscad/modeling";
import type { Geom2, Geom3 } from "@jscad/modeling/src/geometries/types";
import type { Setup } from "../physics";

const { mat4, vec3 } = maths;

/** Wall / floor / rib thickness (mm). */
export const DISK_SKIN_MM = 1;

/** Extra clearance around each washer so it drops into the bay (mm). */
export const WASHER_FIT_CLEARANCE_MM = 0.3;

/** Stator radial overhang past the disk on the inner hole and outer rim (mm). */
export const STATOR_OVERHANG_MM = 5;

/** Distributor torus: internal bore diameter (mm). */
export const DISTRIBUTOR_BORE_MM = 10;

/** Distributor torus: wall thickness around the bore (mm). */
export const DISTRIBUTOR_WALL_MM = 1.5;

/** Bump when solid-building logic changes so the viewer can force a rebuild after HMR. */
export const CAD_GEOMETRY_REV = 7;

/** Disk and stator inner/outer diameters (mm). Stator is larger by `STATOR_OVERHANG_MM` on each edge. */
export function landDiametersMm(setup: Setup): {
  diskInnerMm: number;
  diskOuterMm: number;
  statorInnerMm: number;
  statorOuterMm: number;
} {
  const diskInnerMm = setup.innerMm;
  const diskOuterMm = setup.outerMm;
  const overhang = STATOR_OVERHANG_MM;
  return {
    diskInnerMm,
    diskOuterMm,
    statorInnerMm: Math.max(0.1, diskInnerMm - 2 * overhang),
    statorOuterMm: diskOuterMm + 2 * overhang,
  };
}

export type AssemblySolids = {
  disk: Geom3;
  stator: Geom3;
  distributor: Geom3;
};

export type AssemblyParams = {
  setup: Setup;
  gapMm: number;
  orificeMm: number;
  /** Washer outer diameter (mm). Slots sit on the mid-land; a ring wall stops them sliding outward. */
  washerMm: number;
  segments?: number;
};

function coneZ(radius: number, rOuter: number, alpha: number): number {
  return (rOuter - radius) * Math.tan(alpha);
}

/**
 * How many radial walls fit so a washer of diameter `washerMm` sits between two ribs
 * and against the mid-land circumferential retainer.
 *
 * Geometry: washer OD against the retainer inner face → centre at r_c = r_out − D/2.
 * At that radius the clear chord between two skin-thick ribs must be ≥ D + fit clearance:
 *   2 r_c sin(π/n) − t ≥ D + δ  →  n ≤ π / asin((D + δ + t) / (2 r_c))
 */
export function washerBayCount(setup: Setup, washerMm: number): number {
  const skin = DISK_SKIN_MM;
  const fit = WASHER_FIT_CLEARANCE_MM;
  const rInner = setup.innerMm / 2;
  const rOuter = setup.outerMm / 2;
  const washerD = Math.max(washerMm, skin * 2);
  const rMid = 0.5 * (rInner + rOuter);
  const rWasherOut = Math.min(rOuter - skin, rMid + washerD / 2 + fit);
  const rCenter = Math.max(rInner + skin + washerD / 2, rWasherOut - washerD / 2);
  const need = washerD + fit + skin;
  if (!(rCenter > 0) || need >= 2 * rCenter) return 3;
  const nMax = Math.floor(Math.PI / Math.asin(need / (2 * rCenter)));
  return Math.max(3, nMax);
}

/** Annular cross-section in the +X half-plane: X = radius, Y = height (becomes Z after rotate-extrude). */
function ringProfile(rInner: number, rOuter: number, zInner: number, zOuter: number, thickness: number): Geom2 {
  return primitives.polygon({
    points: [
      [rOuter, zOuter - thickness],
      [rOuter, zOuter],
      [rInner, zInner],
      [rInner, zInner - thickness],
    ],
  });
}

function revolve(profile: Geom2, segments: number): Geom3 {
  return extrusions.extrudeRotate({ segments, angle: Math.PI * 2 }, profile);
}

/** Matrix that maps local +Z onto `direction` and places the origin at `origin`. */
function matrixAimZ(origin: [number, number, number], direction: [number, number, number]) {
  const z = vec3.normalize(vec3.create(), direction);
  const ref = Math.abs(z[2]) < 0.9 ? vec3.fromValues(0, 0, 1) : vec3.fromValues(1, 0, 0);
  const x = vec3.normalize(vec3.create(), vec3.cross(vec3.create(), ref, z));
  const y = vec3.cross(vec3.create(), z, x);
  return mat4.fromValues(x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, origin[0], origin[1], origin[2], 1);
}

/** Cylinder along +Z, then aimed along `normal` (unit) and moved to `origin`. */
function aimedCylinder(radius: number, length: number, origin: [number, number, number], normal: [number, number, number], segments: number): Geom3 {
  const blank = primitives.cylinder({ height: length, radius, segments, center: [0, 0, 0] });
  return transforms.transform(matrixAimZ(origin, normal), blank);
}

/**
 * Lean hovering disk: conical floor, inner rim, open outer edge, radial ribs,
 * plus a circumferential washer stop so added washers cannot slide outward down the cone.
 * `setup.thicknessMm` is the overall wall height above the flying face.
 */
function buildLeanDisk(setup: Setup, gapMm: number, washerMm: number, segments: number): Geom3 {
  const skin = DISK_SKIN_MM;
  const rInner = setup.innerMm / 2;
  const rOuter = setup.outerMm / 2;
  const wallH = Math.max(setup.thicknessMm, skin * 2);
  const face = (radius: number) => coneZ(radius, rOuter, (setup.angleDeg * Math.PI) / 180) + gapMm;
  const topZ = face(rInner) + wallH;

  // Continuous conical floor (1 mm vertical thickness).
  const floor = revolve(ringProfile(rInner, rOuter, face(rInner) + skin, face(rOuter) + skin, skin), segments);

  // Inner hole rim.
  const innerRim = revolve(
    primitives.polygon({
      points: [
        [rInner, face(rInner)],
        [rInner + skin, face(rInner)],
        [rInner + skin, topZ],
        [rInner, topZ],
      ],
    }),
    segments,
  );

  // Washer pocket: centered on the mid-land. Circumferential wall at the washer OD
  // keeps the stack from sliding outward; the floor edge itself stays open (no outer rim).
  const fit = WASHER_FIT_CLEARANCE_MM;
  const washerD = Math.max(washerMm, skin * 2);
  const rMid = 0.5 * (rInner + rOuter);
  const rWasherOut = Math.min(rOuter - skin, rMid + washerD / 2 + fit);
  const retainer = revolve(
    primitives.polygon({
      points: [
        [rWasherOut, face(rWasherOut)],
        [rWasherOut + skin, face(rWasherOut)],
        [rWasherOut + skin, topZ],
        [rWasherOut, topZ],
      ],
    }),
    segments,
  );

  const ribCount = washerBayCount(setup, washerD);
  const rRib0 = rInner + skin;
  const rRib1 = rOuter;
  const ribs: Geom3[] = [];
  for (let i = 0; i < ribCount; i += 1) {
    const theta = (i / ribCount) * Math.PI * 2;
    // Sketch in XY with Y = height, extrude thickness in Z, then tip up so height becomes Z
    // and thickness becomes Y — a true radial vertical wall before rotateZ.
    const web = primitives.polygon({
      points: [
        [rRib0, face(rRib0)],
        [rRib1, face(rRib1)],
        [rRib1, topZ],
        [rRib0, topZ],
      ],
    });
    const slab = extrusions.extrudeLinear({ height: skin }, web);
    const upright = transforms.rotateX(Math.PI / 2, slab);
    const centered = transforms.translate([0, skin / 2, 0], upright);
    ribs.push(transforms.rotateZ(theta, centered));
  }

  return booleans.union(floor, innerRim, retainer, ...ribs);
}

/**
 * Hollow torus plenum on the orifice feed circle.
 * Bore Ø `DISTRIBUTOR_BORE_MM`, wall `DISTRIBUTOR_WALL_MM`; sits under the stator,
 * touching its underside at the feed radius.
 */
function buildDistributor(feed: number, zTopOfTube: number, segments: number): Geom3 {
  const boreR = DISTRIBUTOR_BORE_MM / 2;
  const tubeOuterR = boreR + DISTRIBUTOR_WALL_MM;
  const majorR = Math.max(feed, tubeOuterR + 0.5);
  const ringSegs = Math.max(24, segments);
  const tubeSegs = Math.max(16, Math.round(segments / 2));
  const outer = primitives.torus({
    innerRadius: tubeOuterR,
    outerRadius: majorR,
    innerSegments: tubeSegs,
    outerSegments: ringSegs,
  });
  const bore = primitives.torus({
    innerRadius: boreR,
    outerRadius: majorR,
    innerSegments: tubeSegs,
    outerSegments: ringSegs,
  });
  const shell = booleans.subtract(outer, bore);
  // Torus is built in the XY plane about Z; place so the tube top meets zTopOfTube.
  return transforms.translate([0, 0, zTopOfTube - tubeOuterR], shell);
}

export function buildAssembly(params: AssemblyParams): AssemblySolids {
  const { setup, orificeMm, washerMm } = params;
  const segments = params.segments ?? 64;
  const rInner = setup.innerMm / 2;
  const rOuter = setup.outerMm / 2;
  const alpha = (setup.angleDeg * Math.PI) / 180;
  const statorMm = setup.statorMm;
  const gap = params.gapMm;
  const feed = rInner + setup.feedFrac * (rOuter - rInner);
  const face = (radius: number) => coneZ(radius, rOuter, alpha);
  const holeRadius = Math.max(orificeMm / 2, 0.05);

  const disk = buildLeanDisk(setup, gap, washerMm, segments);

  const overhang = STATOR_OVERHANG_MM;
  const rStatorIn = Math.max(0.05, rInner - overhang);
  const rStatorOut = rOuter + overhang;
  let stator = revolve(ringProfile(rStatorIn, rStatorOut, face(rStatorIn), face(rStatorOut), statorMm), segments);

  const drillLength = statorMm * 6 + setup.thicknessMm;
  const cutters: Geom3[] = [];
  for (let i = 0; i < setup.nOrifices; i += 1) {
    const theta = (i / setup.nOrifices) * Math.PI * 2;
    const normal: [number, number, number] = [Math.sin(alpha) * Math.cos(theta), Math.sin(alpha) * Math.sin(theta), Math.cos(alpha)];
    const origin: [number, number, number] = [feed * Math.cos(theta), feed * Math.sin(theta), face(feed)];
    cutters.push(aimedCylinder(holeRadius, drillLength, origin, normal, 12));
  }
  if (cutters.length > 0) {
    stator = booleans.subtract(stator, ...cutters);
  }

  // Stator underside at feed ≈ face(feed) − statorMm (cone face is the top).
  const distributor = buildDistributor(feed, face(feed) - statorMm, segments);

  return { disk, stator, distributor };
}

export function assemblyExtents(setup: Setup): { rOuter: number; feed: number; faceAtFeed: number } {
  const rInner = setup.innerMm / 2;
  const rOuter = setup.outerMm / 2;
  const alpha = (setup.angleDeg * Math.PI) / 180;
  const feed = rInner + setup.feedFrac * (rOuter - rInner);
  return { rOuter: rOuter + STATOR_OVERHANG_MM, feed, faceAtFeed: coneZ(feed, rOuter, alpha) };
}
