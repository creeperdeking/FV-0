/**
 * Parametric FV-0 assembly in JSCAD (@jscad/modeling).
 * Solids are Z-up; convert with jscadToThree for the viewer.
 *
 * The disk is a lean shell: continuous conical floor, outer rim, open inner hole,
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

/** Outer rim wall inset from the floor OD (mm). */
export const OUTER_RIM_INSET_MM = 10;

/** Stator radial overhang past the disk on the inner hole and the outer rim (mm). */
export const STATOR_OVERHANG_MM = 5;

/** Stator plate thickness, vertical (mm). */
export const STATOR_SKIN_MM = 1;

/** Stator underside reinforcement depth (mm). */
export const STATOR_WALL_DEPTH_MM = 8;

/**
 * Clearance from the stator plate underside down to the torus outer crown (mm).
 * With `STATOR_WALL_DEPTH_MM` walls this leaves a
 * `STATOR_WALL_DEPTH_MM - STATOR_ABOVE_TORUS_MM` (= 3 mm) indent into the tube.
 */
export const STATOR_ABOVE_TORUS_MM = 5;

/** Indent of the stator walls into the torus crown (mm). */
export const STATOR_TORUS_INDENT_MM = STATOR_WALL_DEPTH_MM - STATOR_ABOVE_TORUS_MM;

/** Distributor torus: internal bore diameter (mm). */
export const DISTRIBUTOR_BORE_MM = 10;

/** Distributor torus: wall thickness around the bore (mm). */
export const DISTRIBUTOR_WALL_MM = 1;

/** Bump when solid-building logic changes so the viewer can force a rebuild after HMR. */
export const CAD_GEOMETRY_REV = 40;

/** Target polygonal form error for print STL export (mm). */
export const STL_FORM_ERROR_MM = 0.01;

/**
 * Azimuthal segments so an N-gon of radius `radiusMm` stays within `maxErrorMm`
 * of a true circle: δ ≈ R (1 − cos(π/N)).
 */
export function segmentsForRadiusMm(radiusMm: number, maxErrorMm = STL_FORM_ERROR_MM): number {
  const R = Math.max(radiusMm, 0.5);
  const err = Math.max(maxErrorMm, 1e-6);
  const n = Math.ceil(Math.PI * Math.sqrt(R / (2 * err)));
  return Math.min(2048, Math.max(48, n));
}

/** Viewer / non-contact body resolution (ribs, torus, cones, inlet). */
export function previewSegmentsForSetup(setup: Setup): number {
  return Math.min(40, Math.max(24, Math.round(24 + setup.nOrifices / 2)));
}

/** High-res count for the disk↔stator conical contact faces only. */
export function exportFaceSegmentsForSetup(setup: Setup): number {
  const rStator = setup.outerMm / 2 + STATOR_OVERHANG_MM;
  return segmentsForRadiusMm(rStator);
}

/** @deprecated Use exportFaceSegmentsForSetup — kept for UI labels. */
export function exportSegmentsForSetup(setup: Setup): number {
  return exportFaceSegmentsForSetup(setup);
}

/**
 * Plan angle of orifice `i` of `n` (radians, CCW from +X).
 * Rotated so model −Y always falls exactly halfway between two holes
 * (clean XZ section through the gap).
 */
export function orificeTheta(i: number, n: number): number {
  const count = Math.max(n, 1);
  return ((i + 0.5) / count) * Math.PI * 2 - Math.PI / 2;
}

/** One stator rib per two orifices (minimum 2). */
export function statorRibCount(nOrifices: number): number {
  return Math.max(2, Math.floor(Math.max(nOrifices, 1) / 2));
}

/**
 * Plan angle of stator rib `j`: midway between orifice `2j` and `2j+1`
 * (centred in every other inter-orifice gap).
 */
export function statorRibTheta(j: number, nOrifices: number): number {
  const n = Math.max(nOrifices, 1);
  const a = orificeTheta((2 * j) % n, n);
  const b = orificeTheta((2 * j + 1) % n, n);
  // Average on the circle (handles wrap when n is odd).
  let mid = (a + b) / 2;
  if (Math.abs(b - a) > Math.PI) mid += Math.PI;
  return mid;
}

export type DistributorConeLayout = {
  halfAngle: number;
  tipHeightAboveCenter: number;
  coneHeight: number;
  touchRadius: number;
};

/**
 * Cone half-angle so a vertical stub of tip radius `outerTipR` ends `tipHeight`
 * above the tube centre and is tangent to the tube circle (no skirt).
 * Larger tip height → steeper (more vertical) walls.
 */
export function distributorConeLayoutAtHeight(
  tubeOuterR: number,
  outerTipR: number,
  tipHeight: number,
): DistributorConeLayout {
  const R = Math.max(tubeOuterR, 0.5);
  const rTip = Math.min(Math.max(outerTipR, 0.05), R * 0.9);
  const H = Math.max(tipHeight, R + 0.5);
  // H cos θ + rTip sin θ = R  →  cos(θ − α) = R / hypot(H, rTip), α = atan2(rTip, H)
  const hypot = Math.hypot(H, rTip);
  const cosArg = Math.min(1, Math.max(-1, R / hypot));
  const alpha = Math.atan2(rTip, H);
  // Prefer the upper-side touch (θ from crown, in (0, π/2)).
  const delta = Math.acos(cosArg);
  let touchFromTop = alpha + delta;
  if (touchFromTop <= 0.05 || touchFromTop >= Math.PI / 2 - 0.05) {
    touchFromTop = alpha - delta;
  }
  touchFromTop = Math.min(Math.PI / 2 - 0.08, Math.max(0.08, touchFromTop));
  const tipHeightAboveCenter = H;
  const touchZ = R * Math.cos(touchFromTop);
  const touchRadius = R * Math.sin(touchFromTop);
  const coneHeight = Math.max(0.5, tipHeightAboveCenter - touchZ);
  const halfAngle = Math.atan2(Math.max(0, touchRadius - rTip), coneHeight);
  return { halfAngle, tipHeightAboveCenter, coneHeight, touchRadius };
}

/**
 * Default layout when tip height is free: meet on the upper tube wall.
 * Prefer `distributorConeLayoutAtHeight` once the stator/torus stack is fixed.
 */
export function distributorConeLayout(tubeOuterR: number, outerTipR: number): DistributorConeLayout {
  const R = Math.max(tubeOuterR, 0.5);
  const rTip = Math.min(Math.max(outerTipR, 0.05), R * 0.9);
  const thetaMin = 2 * Math.atan(rTip / R);
  const touchFromTop = Math.min(Math.PI / 2 - 0.1, Math.max(thetaMin + 0.25, Math.PI / 3));
  const tipHeightAboveCenter = (R - rTip * Math.sin(touchFromTop)) / Math.cos(touchFromTop);
  return distributorConeLayoutAtHeight(tubeOuterR, outerTipR, tipHeightAboveCenter);
}

/** Tip height from tube centre to the orifice face for the stator/torus stack. */
export function distributorTipHeightMm(): number {
  return STATOR_SKIN_MM + STATOR_ABOVE_TORUS_MM + DISTRIBUTOR_BORE_MM / 2 + DISTRIBUTOR_WALL_MM;
}

/**
 * Inlet length outside the torus wall so the −Y tip is flush with the stator
 * outer rim: stubR + tubeOuterR + inletLen = rStatorOut.
 */
export function distributorInletLenMm(setup: Setup): number {
  const rInner = setup.innerMm / 2;
  const rOuter = setup.outerMm / 2;
  const feed = rInner + setup.feedFrac * (rOuter - rInner);
  const tubeOuterR = DISTRIBUTOR_BORE_MM / 2 + DISTRIBUTOR_WALL_MM;
  const stubR = Math.max(tubeOuterR + 0.5, feed);
  const rStatorOut = rOuter + STATOR_OVERHANG_MM;
  // yCrest = -(stubR + tubeOuterR); tip at yCrest - inletLen = -rStatorOut
  return Math.max(0.5, rStatorOut - stubR - tubeOuterR);
}

type DistributorConeFit = {
  holeR: number;
  outerTipR: number;
  tanHalf: number;
  boreR: number;
  tubeOuterR: number;
  layout: DistributorConeLayout;
  zTubeCenterFromFace: number;
};

/** Shared taper so the stator seat and the distributor stub are the same cone. */
function distributorConeFit(orificeMm: number): DistributorConeFit {
  const boreR = DISTRIBUTOR_BORE_MM / 2;
  const tubeOuterR = boreR + DISTRIBUTOR_WALL_MM;
  const holeR = Math.max(orificeMm / 2, 0.05);
  const wall = Math.max(DISK_SKIN_MM, DISTRIBUTOR_WALL_MM);
  const outerTipR = holeR + wall;
  const tipHeight = distributorTipHeightMm();
  const layout = distributorConeLayoutAtHeight(tubeOuterR, outerTipR, tipHeight);
  // Face at tip → tube centre this far below the orifice face.
  const zTubeCenterFromFace = tipHeight;
  return { holeR, outerTipR, tanHalf: Math.tan(layout.halfAngle), boreR, tubeOuterR, layout, zTubeCenterFromFace };
}

/**
 * Extra height above the feed-circle face so a vertical cone still crosses the
 * sloped stator surface on the uphill side, without pinching to a point.
 */
function coneTrimMargin(radius: number, alpha: number, tanHalf: number): number {
  const pinch = radius / Math.max(tanHalf, 1e-4);
  return Math.min(radius * Math.tan(Math.abs(alpha)) + 0.5, pinch * 0.75);
}

function coneRadiusAt(rAtRef: number, zRef: number, z: number, tanHalf: number): number {
  return rAtRef + (zRef - z) * tanHalf;
}

/** Vertical frustum. `r0` is the radius at `z0` (bottom), `r1` at `z1` (top). */
function verticalFrustum(x: number, y: number, z0: number, z1: number, r0: number, r1: number, segments: number): Geom3 {
  const height = Math.max(z1 - z0, 0.05);
  const mid: [number, number, number] = [x, y, (z0 + z1) / 2];
  return transforms.transform(
    matrixAimZ(mid, [0, 0, 1]),
    primitives.cylinderElliptic({
      height,
      startRadius: [Math.max(r0, 0), Math.max(r0, 0)],
      endRadius: [Math.max(r1, 0), Math.max(r1, 0)],
      segments,
    }),
  );
}

/** Solid filling everything above the stator face, used to trim orifice exits flush. */
function aboveStatorFace(rInner: number, alpha: number, rMax: number, segments: number): Geom3 {
  const slope = Math.tan(alpha);
  const zAxis = -rInner * slope;
  const zOuter = (rMax - rInner) * slope;
  const profile = primitives.polygon({
    points: [
      [0, zAxis],
      [rMax, zOuter],
      [rMax, zOuter + 30],
      [0, zAxis + 30],
    ],
  });
  return revolve(profile, segments);
}

/** Half-angle in degrees for UI copy (depends on orifice size via tip OD). */
export function distributorConeAngleDeg(orificeMm: number): number {
  return (distributorConeFit(orificeMm).layout.halfAngle * 180) / Math.PI;
}

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
  /** Fused stator plate, underside ribs, and distributor plenum. */
  stator: Geom3;
};

export type AssemblyParams = {
  setup: Setup;
  gapMm: number;
  orificeMm: number;
  /** Washer outer diameter (mm). Slots sit on the mid-land; a ring wall stops them sliding outward. */
  washerMm: number;
  segments?: number;
};

type AssemblyCacheEntry = {
  key: string;
  solids: AssemblySolids;
};

let assemblyCache: AssemblyCacheEntry | null = null;

function assemblyCacheKey(params: AssemblyParams): string {
  return JSON.stringify({
    rev: CAD_GEOMETRY_REV,
    setup: params.setup,
    gapMm: params.gapMm,
    orificeMm: params.orificeMm,
    washerMm: params.washerMm,
    segments: params.segments ?? null,
  });
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/** Build assembly solids (cached). Yields between heavy CSG steps so the UI can paint. */
export async function getCachedAssembly(params: AssemblyParams): Promise<AssemblySolids> {
  const key = assemblyCacheKey(params);
  if (assemblyCache && assemblyCache.key === key) return assemblyCache.solids;
  const solids = await buildAssembly(params);
  assemblyCache = { key, solids };
  return solids;
}

/** Flying-face height: cone is low at the hole and rises toward the rim. */
function coneZ(radius: number, rInner: number, alpha: number): number {
  return (radius - rInner) * Math.tan(alpha);
}

/**
 * How many radial walls fit so a washer of diameter `washerMm` sits between two ribs
 * and against the mid-land circumferential retainer (inner stop — cone slopes down inward).
 *
 * Geometry: washer ID against the retainer outer face → centre at r_c = r_in + D/2.
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
  const rRim = Math.max(rInner + 3 * skin, rOuter - OUTER_RIM_INSET_MM);
  const rWasherIn = Math.max(rInner + skin, rMid - washerD / 2 - fit);
  const rCenter = Math.min(rRim - 2 * skin - washerD / 2, rWasherIn + washerD / 2);
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
 * Lean hovering disk: conical floor, outer rim, open inner hole, radial ribs,
 * plus a circumferential washer stop so added washers cannot slide inward down the cone.
 * `setup.thicknessMm` is the overall wall height above the flying face.
 */
async function buildLeanDisk(
  setup: Setup,
  gapMm: number,
  washerMm: number,
  bodySegments: number,
  faceSegments = bodySegments,
): Promise<Geom3> {
  const skin = DISK_SKIN_MM;
  const rInner = setup.innerMm / 2;
  const rOuter = setup.outerMm / 2;
  const wallH = Math.max(setup.thicknessMm, skin * 2);
  const face = (radius: number) => coneZ(radius, rInner, (setup.angleDeg * Math.PI) / 180) + gapMm;
  // Ceiling is the same cone, lifted by the wall height — not a flat lid.
  const crown = (radius: number) => face(radius) + wallH;

  // Flying-face floor at `faceSegments`; ribs/rim stay at preview `bodySegments`.
  const floor = revolve(ringProfile(rInner, rOuter, face(rInner) + skin, face(rOuter) + skin, skin), faceSegments);

  // Outer rim wall, inset from the floor OD.
  const rRim = Math.max(rInner + 3 * skin, rOuter - OUTER_RIM_INSET_MM);
  const outerRim = revolve(
    primitives.polygon({
      points: [
        [rRim - skin, face(rRim - skin)],
        [rRim, face(rRim)],
        [rRim, crown(rRim)],
        [rRim - skin, crown(rRim - skin)],
      ],
    }),
    bodySegments,
  );

  // Washer pocket: centered on the mid-land. Circumferential wall at the washer ID
  // keeps the stack from sliding inward down the cone; the inner hole edge stays open.
  const fit = WASHER_FIT_CLEARANCE_MM;
  const washerD = Math.max(washerMm, skin * 2);
  const rMid = 0.5 * (rInner + rOuter);
  const rWasherIn = Math.max(rInner + skin, rMid - washerD / 2 - fit);
  const retainer = revolve(
    primitives.polygon({
      points: [
        [rWasherIn - skin, face(rWasherIn - skin)],
        [rWasherIn, face(rWasherIn)],
        [rWasherIn, crown(rWasherIn)],
        [rWasherIn - skin, crown(rWasherIn - skin)],
      ],
    }),
    bodySegments,
  );

  let disk = booleans.union(floor, outerRim, retainer);
  await yieldToUi();

  const ribCount = washerBayCount(setup, washerD);
  const rRib0 = rInner;
  // Ribs run past the inset wall out to the floor OD.
  const rRib1 = rOuter;
  for (let i = 0; i < ribCount; i += 1) {
    const theta = (i / ribCount) * Math.PI * 2;
    // Sketch in XY with Y = height, extrude thickness in Z, then tip up so height becomes Z
    // and thickness becomes Y — a true radial vertical wall before rotateZ.
    const web = primitives.polygon({
      points: [
        [rRib0, face(rRib0)],
        [rRib1, face(rRib1)],
        [rRib1, crown(rRib1)],
        [rRib0, crown(rRib0)],
      ],
    });
    const slab = extrusions.extrudeLinear({ height: skin }, web);
    const upright = transforms.rotateX(Math.PI / 2, slab);
    const centered = transforms.translate([0, skin / 2, 0], upright);
    disk = booleans.union(disk, transforms.rotateZ(theta, centered));
    if (i % 2 === 1) await yieldToUi();
  }

  return disk;
}

/** Same rib / rim / retainer pattern as the disk, hanging below a conical plate. */
async function addMirroredStatorWalls(
  plate: Geom3,
  args: {
    setup: Setup;
    rStatorIn: number;
    rStatorOut: number;
    face: (radius: number) => number;
    wallH: number;
    washerMm: number;
    segments: number;
  },
): Promise<Geom3> {
  const { setup, face, wallH, washerMm, segments } = args;
  const skin = DISK_SKIN_MM;
  const statorMm = STATOR_SKIN_MM;
  const rInner = setup.innerMm / 2;
  const rOuter = setup.outerMm / 2;
  // Underside of the plate; free edge of the hanging walls (both follow the cone).
  // Wall tops use `face` (not underside) so they bury into the plate skin and
  // CSG-union cleanly — coplanar under-only contact left a visible gap.
  const under = (radius: number) => face(radius) - statorMm;
  const heel = (radius: number) => under(radius) - wallH;
  const top = (radius: number) => face(radius);

  const rRim = Math.max(rInner + 3 * skin, rOuter - OUTER_RIM_INSET_MM);
  const outerRim = revolve(
    primitives.polygon({
      points: [
        [rRim - skin, heel(rRim - skin)],
        [rRim, heel(rRim)],
        [rRim, top(rRim)],
        [rRim - skin, top(rRim - skin)],
      ],
    }),
    segments,
  );

  const fit = WASHER_FIT_CLEARANCE_MM;
  const washerD = Math.max(washerMm, skin * 2);
  const rMid = 0.5 * (rInner + rOuter);
  const rWasherIn = Math.max(rInner + skin, rMid - washerD / 2 - fit);
  const retainer = revolve(
    primitives.polygon({
      points: [
        [rWasherIn - skin, heel(rWasherIn - skin)],
        [rWasherIn, heel(rWasherIn)],
        [rWasherIn, top(rWasherIn)],
        [rWasherIn - skin, top(rWasherIn - skin)],
      ],
    }),
    segments,
  );

  let stator = booleans.union(plate, outerRim, retainer);
  await yieldToUi();

  // Ribs sit midway between every two orifices (not the disk washer-bay count).
  const ribs = statorRibCount(setup.nOrifices);
  const rRib0 = args.rStatorIn;
  const rRib1 = args.rStatorOut;
  for (let j = 0; j < ribs; j += 1) {
    const theta = statorRibTheta(j, setup.nOrifices);
    const web = primitives.polygon({
      points: [
        [rRib0, heel(rRib0)],
        [rRib1, heel(rRib1)],
        [rRib1, top(rRib1)],
        [rRib0, top(rRib0)],
      ],
    });
    const slab = extrusions.extrudeLinear({ height: skin }, web);
    const upright = transforms.rotateX(Math.PI / 2, slab);
    const centered = transforms.translate([0, skin / 2, 0], upright);
    stator = booleans.union(stator, transforms.rotateZ(theta, centered));
    if (j % 2 === 1) await yieldToUi();
  }

  return stator;
}

/**
 * Fused stator + distributor: plate, underside ribs, hollow torus, and one
 * continuous orifice cone per hole. Ribs union into the torus (no clearance
 * groove); conical contacts are a single wall, not a male/female pair.
 */
async function buildFusedStator(args: {
  setup: Setup;
  orificeMm: number;
  washerMm: number;
  bodySegments: number;
  faceSegments?: number;
}): Promise<Geom3> {
  const { setup, orificeMm, washerMm, bodySegments } = args;
  const faceSegments = args.faceSegments ?? bodySegments;
  const rInner = setup.innerMm / 2;
  const rOuter = setup.outerMm / 2;
  const alpha = (setup.angleDeg * Math.PI) / 180;
  const statorMm = STATOR_SKIN_MM;
  const feed = rInner + setup.feedFrac * (rOuter - rInner);
  const face = (radius: number) => coneZ(radius, rInner, alpha);
  const { boreR, tubeOuterR, holeR, outerTipR, tanHalf, layout, zTubeCenterFromFace } = distributorConeFit(orificeMm);
  const stubR = Math.max(tubeOuterR + 0.5, feed);
  const zRef = face(feed);
  const zTubeCenter = zRef - zTubeCenterFromFace;
  const wallH = STATOR_WALL_DEPTH_MM;

  const overhang = STATOR_OVERHANG_MM;
  const rStatorIn = Math.max(0.05, rInner - overhang);
  const rStatorOut = rOuter + overhang;
  // Contact face at `faceSegments`; everything else stays at preview `bodySegments`.
  const plate = revolve(ringProfile(rStatorIn, rStatorOut, face(rStatorIn), face(rStatorOut), statorMm), faceSegments);

  // Plate + ribs/rim/retainer — no torus clearance cut; union will merge into the tube.
  let body = await addMirroredStatorWalls(plate, {
    setup,
    rStatorIn,
    rStatorOut,
    face,
    wallH,
    washerMm,
    segments: bodySegments,
  });

  const ringSegs = Math.max(24, bodySegments);
  const tubeSegs = Math.max(12, Math.min(24, Math.round(bodySegments / 2)));
  const majorR = stubR;
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
  const boreCut = transforms.translate([0, 0, zTubeCenter], bore);
  const plenum = transforms.translate([0, 0, zTubeCenter], booleans.subtract(outer, bore));
  // Ribs indent into the torus and become one solid with it.
  body = booleans.union(body, plenum);
  await yieldToUi();

  const coneLen = layout.coneHeight + Math.min(0.25, DISTRIBUTOR_WALL_MM * 0.2);
  const marginOuter = coneTrimMargin(outerTipR, alpha, tanHalf);
  const marginInner = coneTrimMargin(holeR, alpha, tanHalf);
  const zConeTop = zRef + marginOuter;
  const zConeBot = zRef - coneLen;
  const rConeBot = coneRadiusAt(outerTipR, zRef, zConeBot, tanHalf);
  const rConeTop = coneRadiusAt(outerTipR, zRef, zConeTop, tanHalf);
  const coneSegs = Math.max(8, Math.min(16, Math.round(bodySegments / 3)));
  const rAirBot = Math.min(coneRadiusAt(holeR, zRef, zTubeCenter, tanHalf), boreR * 0.85);
  const rAirTop = coneRadiusAt(holeR, zRef, zRef + marginInner, tanHalf);

  for (let i = 0; i < Math.max(setup.nOrifices, 0); i += 1) {
    const theta = orificeTheta(i, setup.nOrifices);
    const x = stubR * Math.cos(theta);
    const y = stubR * Math.sin(theta);
    // One common cone wall from the tube through the plate (no separate seat sleeve).
    const frustum = verticalFrustum(x, y, zConeBot, zConeTop, rConeBot, rConeTop, coneSegs);
    body = booleans.union(body, booleans.subtract(frustum, boreCut));
    const airway = verticalFrustum(x, y, zTubeCenter, zRef + marginInner, rAirBot, Math.max(rAirTop, holeR), coneSegs);
    body = booleans.subtract(body, airway);
    await yieldToUi();
  }

  const inletLen = distributorInletLenMm(setup);
  const inletDir: [number, number, number] = [0, -1, 0];
  const yCenter = -majorR;
  const yCrest = -(majorR + tubeOuterR);
  const yFree = yCrest - inletLen;
  const ySolidStop = yCenter + 0.2;
  const inletShell = aimedCylinder(
    tubeOuterR,
    ySolidStop - yFree,
    [0, (yFree + ySolidStop) / 2, zTubeCenter],
    inletDir,
    tubeSegs,
  );
  body = booleans.union(body, booleans.subtract(inletShell, boreCut));
  const yBoreStop = yCenter + Math.min(0.8, boreR * 0.3);
  const yBoreFree = yFree - 0.5;
  body = booleans.subtract(
    body,
    aimedCylinder(boreR, yBoreStop - yBoreFree, [0, (yBoreFree + yBoreStop) / 2, zTubeCenter], inletDir, tubeSegs),
  );
  await yieldToUi();

  const rCap = rOuter + STATOR_OVERHANG_MM + inletLen + tubeOuterR + 10;
  body = booleans.subtract(body, aboveStatorFace(rInner, alpha, rCap, bodySegments));
  await yieldToUi();

  return body;
}

export async function buildAssembly(params: AssemblyParams): Promise<AssemblySolids> {
  const { setup, orificeMm, washerMm } = params;
  const segments = params.segments ?? previewSegmentsForSetup(setup);
  const gap = params.gapMm;

  const disk = await buildLeanDisk(setup, gap, washerMm, segments);
  await yieldToUi();

  const stator = await buildFusedStator({ setup, orificeMm, washerMm, bodySegments: segments });

  return { disk, stator };
}

/** STL disk: high-res contact floor only; ribs/rim at preview resolution. */
export async function buildDiskForExport(params: Omit<AssemblyParams, "gapMm" | "segments"> & { faceSegments?: number; bodySegments?: number }): Promise<Geom3> {
  const bodySegments = params.bodySegments ?? previewSegmentsForSetup(params.setup);
  const faceSegments = params.faceSegments ?? exportFaceSegmentsForSetup(params.setup);
  return buildLeanDisk(params.setup, 0, params.washerMm, bodySegments, faceSegments);
}

/** STL stator: high-res contact plate only; ribs/torus/cones at preview resolution. */
export async function buildStatorForExport(params: Omit<AssemblyParams, "gapMm" | "segments"> & { faceSegments?: number; bodySegments?: number }): Promise<Geom3> {
  const bodySegments = params.bodySegments ?? previewSegmentsForSetup(params.setup);
  const faceSegments = params.faceSegments ?? exportFaceSegmentsForSetup(params.setup);
  return buildFusedStator({
    setup: params.setup,
    orificeMm: params.orificeMm,
    washerMm: params.washerMm,
    bodySegments,
    faceSegments,
  });
}

export function assemblyExtents(setup: Setup): { rOuter: number; feed: number; faceAtFeed: number } {
  const rInner = setup.innerMm / 2;
  const rOuter = setup.outerMm / 2;
  const alpha = (setup.angleDeg * Math.PI) / 180;
  const feed = rInner + setup.feedFrac * (rOuter - rInner);
  return { rOuter: rOuter + STATOR_OVERHANG_MM, feed, faceAtFeed: coneZ(feed, rInner, alpha) };
}
