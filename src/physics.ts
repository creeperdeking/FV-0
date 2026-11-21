/**
 * First-order aerostatic model of a shallow conical annular disk with a
 * recessed mid-band pocket and tight sealing lips at the inner and outer edges.
 *
 * Orifices feed the deep pocket. Leak (and almost all gap sensitivity) is through
 * the two lip lands at the flying clearance. The pocket gap is the lip gap plus a
 * fixed geometric recess machined/printed into the face.
 */

const GAMMA = 1.4;
const R_SPECIFIC = 287.05;
const MU_AIR = 1.81e-5;
const P_ATM = 101_325;
const T_REF = 293.15;
const G = 9.80665;

export type Air = {
  pAtm: number;
  temperatureK: number;
  mu: number;
  gamma: number;
  rSpecific: number;
};

export const AIR: Air = {
  pAtm: P_ATM,
  temperatureK: T_REF,
  mu: MU_AIR,
  gamma: GAMMA,
  rSpecific: R_SPECIFIC,
};

export type Setup = {
  outerMm: number;
  innerMm: number;
  angleDeg: number;
  thicknessMm: number;
  statorMm: number;
  density: number;
  nOrifices: number;
  orificeMm: number;
  /** Flying clearance at the sealing lips (µm). */
  gapUm: number;
  /**
   * Mid-band pocket clearance at the design lip gap (mm).
   * Geometric recess = pocketGapMm − gapUm/1000; pocket gap tracks lip gap + recess.
   */
  pocketGapMm: number;
  /**
   * Radial width of the stator flat lip at the inner hole (mm).
   */
  lipInnerMm: number;
  /** Radial width of the stator flat lip at the outer rim (mm). */
  lipOuterMm: number;
  /**
   * Lateral play offset between rotor and stator lip breaks (mm).
   * Applied as the *same* radial translation on both edges (not a symmetric inset):
   * both rotor breaks shift toward the OD by this amount relative to the stator.
   * ID: rotor flat reaches into the stator cone. OD: rotor cone starts over the stator flat.
   */
  lateralMarginMm: number;
  feedFrac: number;
  cd: number;
  /** Washer outer diameter for CAD bay sizing (mm). */
  washerMm: number;
};

/** Setup plus the supply pressure that holds the design lip gap. */
type SuppliedSetup = Setup & { supplyBar: number };

export type BearingState = {
  gapM: number;
  pocketGapM: number;
  recessM: number;
  lipInnerM: number;
  lipOuterM: number;
  lateralMarginM: number;
  /** Flat–flat seal radial width after subtracting the lateral margin (m). */
  sealInnerM: number;
  sealOuterM: number;
  orificeMm: number;
  /** Gauge pressure that holds the disk at the design lip gap. Null when no pressure can. */
  supplyBar: number | null;
  pocketPressurePa: number;
  liftAxialN: number;
  liftNormalN: number;
  stiffnessAxial: number;
  radialStiffness: number;
  massFlowKgS: number;
  volumeFlowNlpm: number;
  floatMarginN: number;
  naturalFreqHz: number;
  knudsen: number;
  notes: string[];
  weightN: number;
  massKg: number;
  areaM2: number;
  coneRiseM: number;
  feedRadiusM: number;
  rInnerM: number;
  rOuterM: number;
};

const ORIFICE_MIN_MM = 0.05;
const ORIFICE_MAX_MM = 8;

export type Sweep = {
  gapUm: number[];
  liftN: number[];
  stiffnessPerUm: number[];
  flowNlpm: number[];
};

export type PressureCurve = {
  radiusMm: number[];
  gaugeBar: number[];
};

type Geometry = {
  rInner: number;
  rOuter: number;
  angleRad: number;
  thicknessM: number;
  density: number;
  weightN: number;
  massKg: number;
  areaM2: number;
  coneRiseM: number;
};

/**
 * Radii of pocket / lip / seal boundaries (m).
 * Stator lips are the full `lip*Mm` bands. Rotor breaks are the stator breaks
 * translated toward the OD by `lateralMarginMm` (same direction on both edges).
 * Viscous sealing uses the flat–flat overlap (`rInner`→`rSealIn`, `rSealOut`→`rOuter`).
 */
export type LandRadii = {
  rInner: number;
  rOuter: number;
  feed: number;
  /** Stator inner flat ends / cone begins. */
  rStatorLipIn: number;
  /** Stator outer cone ends / flat begins. */
  rStatorLipOut: number;
  /** Rotor inner flat ends (stator break + margin). */
  rRotorLipIn: number;
  /** Rotor outer flat begins (stator break + margin). */
  rRotorLipOut: number;
  /** End of inner flat–flat seal (= min of the two inner breaks). */
  rSealIn: number;
  /** Start of outer flat–flat seal (= max of the two outer breaks). */
  rSealOut: number;
  /** @deprecated Use rSealIn — kept for call sites expecting the old pocket edge. */
  rLipIn: number;
  /** @deprecated Use rSealOut */
  rLipOut: number;
};

function geometryOf(setup: Omit<Setup, "orificeMm">): Geometry {
  const rOuter = (setup.outerMm / 2) * 1e-3;
  const rInner = (setup.innerMm / 2) * 1e-3;
  const angleRad = (setup.angleDeg * Math.PI) / 180;
  const areaM2 = Math.PI * (rOuter ** 2 - rInner ** 2);
  const thicknessM = setup.thicknessMm * 1e-3;
  const massKg = setup.density * areaM2 * thicknessM;
  return {
    rInner,
    rOuter,
    angleRad,
    thicknessM,
    density: setup.density,
    areaM2,
    massKg,
    weightN: massKg * G,
    coneRiseM: (rOuter - rInner) * Math.tan(angleRad),
  };
}

export function feedRadiusM(setup: Setup): number {
  const rOuter = (setup.outerMm / 2) * 1e-3;
  const rInner = (setup.innerMm / 2) * 1e-3;
  return rInner + setup.feedFrac * (rOuter - rInner);
}

/** Fixed face step between lip plane and pocket floor (m). */
export function recessDepthM(setup: Pick<Setup, "gapUm" | "pocketGapMm">): number {
  return Math.max(setup.pocketGapMm * 1e-3 - Math.max(setup.gapUm, 0) * 1e-6, 0);
}

export function landRadiiOf(setup: Setup, geo: Geometry = geometryOf(setup)): LandRadii | null {
  const lipIn = Math.max(setup.lipInnerMm, 0) * 1e-3;
  const lipOut = Math.max(setup.lipOuterMm, 0) * 1e-3;
  const margin = Math.max(setup.lateralMarginMm, 0) * 1e-3;
  if (!(lipOut > margin)) return null;
  // Stator flat lands (full lip widths).
  const rStatorLipIn = geo.rInner + lipIn;
  const rStatorLipOut = geo.rOuter - lipOut;
  // Same-direction translation toward the OD on both edges (not a mirrored inset).
  const rRotorLipIn = rStatorLipIn + margin;
  const rRotorLipOut = rStatorLipOut + margin;
  const feed = feedRadiusM(setup);
  if (!(rStatorLipIn < rStatorLipOut) || !(rRotorLipIn < rRotorLipOut)) return null;
  if (!(rRotorLipIn > geo.rInner) || !(rRotorLipOut < geo.rOuter)) return null;
  // Feed in the pocket between rotor cone breaks.
  if (!(feed > rRotorLipIn) || !(feed < rRotorLipOut)) return null;
  // Tight seals = both faces flat.
  const rSealIn = Math.min(rStatorLipIn, rRotorLipIn);
  const rSealOut = Math.max(rStatorLipOut, rRotorLipOut);
  return {
    rInner: geo.rInner,
    rOuter: geo.rOuter,
    feed,
    rStatorLipIn,
    rStatorLipOut,
    rRotorLipIn,
    rRotorLipOut,
    rSealIn,
    rSealOut,
    rLipIn: rSealIn,
    rLipOut: rSealOut,
  };
}

function rhoAtm(air: Air): number {
  return air.pAtm / (air.rSpecific * air.temperatureK);
}

function flowFunction(pressureRatio: number, gamma: number): number {
  const pr = Math.min(1, Math.max(0, pressureRatio));
  const crit = (2 / (gamma + 1)) ** (gamma / (gamma - 1));
  if (pr <= crit) {
    return Math.sqrt(gamma) * (2 / (gamma + 1)) ** ((gamma + 1) / (2 * (gamma - 1)));
  }
  return Math.sqrt((2 * gamma) / (gamma - 1) * (pr ** (2 / gamma) - pr ** ((gamma + 1) / gamma)));
}

function orificeMassFlow(pSupply: number, pDown: number, diameterM: number, cd: number, air: Air): number {
  const area = 0.25 * Math.PI * diameterM ** 2;
  const phi = flowFunction(pDown / pSupply, air.gamma);
  return (cd * area * pSupply * phi) / Math.sqrt(air.rSpecific * air.temperatureK);
}

/** Isothermal compressible radial-film conductance: m = C (p_hi² − p_lo²). */
function filmConductance(h: number, rA: number, rB: number, air: Air): number {
  const r1 = Math.min(rA, rB);
  const r2 = Math.max(rA, rB);
  if (!(h > 0) || !(r2 > r1)) return 0;
  return (Math.PI * h ** 3) / (12 * air.mu * air.rSpecific * air.temperatureK * Math.log(r2 / r1));
}

/** Two lands in series share the same m = C (p² drop); equivalent C is the harmonic mean. */
function seriesConductance(c1: number, c2: number): number {
  if (!(c1 > 0) || !(c2 > 0)) return 0;
  return 1 / (1 / c1 + 1 / c2);
}

/**
 * Mass outflow from the pocket through both lips.
 * Each branch is pocket annulus (deep) in series with a sealing lip (tight).
 */
function filmOutflow(hLip: number, pD: number, setup: Setup, geo: Geometry, air: Air): number {
  const lands = landRadiiOf(setup, geo);
  if (!lands) return 0;
  const hPocket = hLip + recessDepthM(setup);
  // Pocket path to the seal edge; tight leak only on the flat–flat overlap.
  const cPocketIn = filmConductance(hPocket, lands.feed, lands.rSealIn, air);
  const cLipIn = filmConductance(hLip, lands.rInner, lands.rSealIn, air);
  const cPocketOut = filmConductance(hPocket, lands.feed, lands.rSealOut, air);
  const cLipOut = filmConductance(hLip, lands.rSealOut, lands.rOuter, air);
  const cIn = seriesConductance(cPocketIn, cLipIn);
  const cOut = seriesConductance(cPocketOut, cLipOut);
  return (cIn + cOut) * (pD ** 2 - air.pAtm ** 2);
}

// Clearance warning: keep in sync with soft-film-warning.md whenever you change
// HOVER_RUB_GAP_M or the evaluateAt branch that emits the banner.
// Warn when the *lip* flying height is inside typical resin face error on the seal rings.
const HOVER_RUB_GAP_M = 50e-6;

// Hole-spacing warning: keep in sync with hole-spacing-warning.md.
// Deep pocket equalizes better than a thin full-face film → slightly looser ratios.
const HOLE_PITCH_WARN_LAND = 3;
const HOLE_PITCH_NOTE_LAND = 1.5;

// Orifice-size warning: keep in sync with orifice-warning.md.
/** Past this pocket gauge ratio the axial stiffness is already down the far side of its peak. */
const POCKET_RATIO_WARN = 0.8;

/** Minimum useful recess (mm). Shallower than this, the mid-band is not a true pocket. */
const RECESS_MIN_MM = 0.5;

/** Lip radial width below this many lip gaps is entrance-dominated, not a viscous land. */
const LIP_WIDTH_MIN_GAPS = 20;

/**
 * Warning diameter for the orifice→pocket curtain (mm). Crossover is d = 4 h_pocket; warn at d = 2 h_pocket.
 * The relevant height is the pocket clearance at the hole, not the lip gap.
 */
function curtainOrificeMm(hPocket: number): number {
  return 2 * hPocket * 1e3;
}

/**
 * Hole diameter that sets the pocket gauge ratio to `beta` at lip gap `hLip`, assuming the throat is the restrictor.
 */
function orificeMmAtPocketRatio(setup: SuppliedSetup, hLip: number, geo: Geometry, beta: number): number {
  const pO = AIR.pAtm + setup.supplyBar * 1e5;
  const pD = AIR.pAtm + beta * (pO - AIR.pAtm);
  const phi = flowFunction(pD / pO, AIR.gamma);
  if (phi <= 1e-12 || setup.nOrifices <= 0 || setup.cd <= 0) return Number.POSITIVE_INFINITY;
  const mOne = filmOutflow(hLip, pD, setup, geo, AIR) / setup.nOrifices;
  const area = (mOne * Math.sqrt(AIR.rSpecific * AIR.temperatureK)) / (setup.cd * pO * phi);
  return Math.sqrt((4 * Math.max(area, 0)) / Math.PI) * 1e3;
}

type OrificeLimit = { mm: number; kind: "curtain" | "stiffness" | "land" };

/**
 * Tightest diameter that still matches the orifice→pocket assumptions.
 * Curtain uses pocket height; land uses pocket half-width and pitch.
 */
function orificeWarnLimit(setup: SuppliedSetup, hLip: number, geo: Geometry): OrificeLimit {
  const lands = landRadiiOf(setup, geo);
  const hPocket = hLip + recessDepthM(setup);
  const pocketHalf =
    lands == null
      ? Math.min(feedRadiusM(setup) - geo.rInner, geo.rOuter - feedRadiusM(setup))
      : Math.min(lands.feed - lands.rSealIn, lands.rSealOut - lands.feed);
  const pitchM = (2 * Math.PI * feedRadiusM(setup)) / Math.max(setup.nOrifices, 1);
  const limits: OrificeLimit[] = [
    { mm: curtainOrificeMm(hPocket), kind: "curtain" },
    { mm: orificeMmAtPocketRatio(setup, hLip, geo, POCKET_RATIO_WARN), kind: "stiffness" },
    { mm: 0.2 * Math.min(pocketHalf, pitchM) * 1e3, kind: "land" },
  ];
  return limits.reduce((tightest, limit) => (limit.mm < tightest.mm ? limit : tightest));
}

/** Banner copy for the orifice warning. Keep wording aligned with orifice-warning.md. */
function orificeWarnNote(orificeMm: number, limit: OrificeLimit, hPocket: number): string {
  const hole = orificeMm.toFixed(2);
  const cap = limit.mm.toFixed(2);
  if (limit.kind === "curtain") {
    const crossover = (limit.mm * 2).toFixed(2);
    const pocketUm = (hPocket * 1e6).toFixed(0);
    const hammer =
      hPocket > 0.4e-3
        ? " A deep recess stores enough volume that a soft orifice restrictor can hammer."
        : "";
    return `Each hole is ${hole} mm. The orifice dumps into the ~${pocketUm} µm pocket; the inlet curtain matches the throat at ${crossover} mm (4× pocket gap). Above ${cap} mm the pocket entrance, rather than the drilled hole, starts to set the feed.${hammer}`;
  }
  if (limit.kind === "stiffness") {
    return `Each hole is ${hole} mm. Above ${cap} mm at this lip gap the pocket pressure is past the stiffness peak, so a larger hole mostly adds air use and softens the orifice–land pressure divider.`;
  }
  return `Each hole is ${hole} mm. Above ${cap} mm the hole is a large fraction of the pocket half-width or the hole spacing, so the feeds are no longer small sources in the recess.`;
}

/**
 * Circumferential spacing vs radial path to the nearest lip (pocket half-land).
 * Deep pocket equalizes better than a thin film, so the warn ratio is looser — see hole-spacing-warning.md.
 */
function holeSpacingNotes(setup: Setup, geo: Geometry): string[] {
  const lands = landRadiiOf(setup, geo);
  if (!lands || setup.nOrifices <= 0) return [];
  const landM = Math.min(lands.feed - lands.rSealIn, lands.rSealOut - lands.feed);
  if (!(landM > 0)) return [];
  const pitchM = (2 * Math.PI * lands.feed) / setup.nOrifices;
  const ratio = pitchM / landM;
  const nEven = Math.max(1, Math.ceil((2 * Math.PI * lands.feed) / landM));
  const pitchMm = (pitchM * 1e3).toFixed(0);
  const landMm = (landM * 1e3).toFixed(0);
  if (ratio > HOLE_PITCH_WARN_LAND) {
    return [
      `Hole spacing is ${pitchMm} mm on the feed ring, more than ${HOLE_PITCH_WARN_LAND}× the ${landMm} mm path to the nearest seal. Even with a deep pocket, sparse jets can leave soft arcs; aim near ${nEven} holes. This model averages the pocket and will not show that rocking.`,
    ];
  }
  if (ratio > HOLE_PITCH_NOTE_LAND) {
    return [
      `Hole spacing is ${pitchMm} mm vs a ${landMm} mm path to the seal (${setup.nOrifices} holes). The deep pocket helps equalize; about ${nEven} holes would still be safer before you rely on even pressure.`,
    ];
  }
  return [];
}

function geometryNotes(setup: Setup, geo: Geometry, hLip: number): string[] {
  const notes: string[] = [];
  const lands = landRadiiOf(setup, geo);
  if (!lands) {
    notes.push(
      "Stator lip widths must exceed the lateral movement margin, and the feed ring must sit between the rotor lip breaks (flat lips with an offset cone→flat transition).",
    );
    return notes;
  }
  const recessMm = recessDepthM(setup) * 1e3;
  if (recessMm < RECESS_MIN_MM) {
    notes.push(
      `Pocket clearance is only ${setup.pocketGapMm.toFixed(2)} mm above a ${(hLip * 1e6).toFixed(0)} µm lip (recess ${recessMm.toFixed(2)} mm). Below about ${RECESS_MIN_MM} mm recess the mid-band is not a true deep pocket and the curtain/orifice limits tighten toward the lip gap.`,
    );
  }
  const sealInMm = (lands.rSealIn - lands.rInner) * 1e3;
  const sealOutMm = (lands.rOuter - lands.rSealOut) * 1e3;
  const sealInGaps = (sealInMm * 1e-3) / Math.max(hLip, 1e-9);
  const sealOutGaps = (sealOutMm * 1e-3) / Math.max(hLip, 1e-9);
  if (sealInGaps < LIP_WIDTH_MIN_GAPS || sealOutGaps < LIP_WIDTH_MIN_GAPS) {
    notes.push(
      `Flat–flat seals (stator lips ${sealInMm.toFixed(1)} / ${sealOutMm.toFixed(1)} mm at ${(hLip * 1e6).toFixed(0)} µm) should be at least ~${LIP_WIDTH_MIN_GAPS}× the lip gap. Narrower lands are entrance-dominated and leak more than this model predicts.`,
    );
  }
  if (setup.lateralMarginMm < 0.3) {
    notes.push(
      `Lateral movement margin is only ${setup.lateralMarginMm.toFixed(2)} mm. A small radial shift can still let the rotor cone→flat corner hit the stator cone — increase the margin relative to guide-pin play.`,
    );
  }
  const radialLandMm = (geo.rOuter - geo.rInner) * 1e3;
  const lipShare = (setup.lipInnerMm + setup.lipOuterMm) / Math.max(radialLandMm, 1e-6);
  if (lipShare > 0.5) {
    notes.push(
      `The two stator lips use ${(lipShare * 100).toFixed(0)}% of the radial land. That still works, but most of the face is seal rather than pocket — lift efficiency drops toward a continuous thin-film bearing.`,
    );
  }
  return notes;
}

function withSupply(setup: Setup, supplyBar: number): SuppliedSetup {
  return { ...setup, supplyBar };
}

function solvePocket(hLip: number, setup: SuppliedSetup, geo: Geometry, air: Air): number {
  const pO = air.pAtm + setup.supplyBar * 1e5;
  const residual = (pD: number) =>
    setup.nOrifices * orificeMassFlow(pO, pD, setup.orificeMm * 1e-3, setup.cd, air) -
    filmOutflow(hLip, pD, setup, geo, air);
  let lo = air.pAtm * 1.0001;
  let hi = pO * 0.9999;
  let fLo = residual(lo);
  const fHi = residual(hi);
  if (fLo > 0 && fHi > 0) return hi;
  if (fLo < 0 && fHi < 0) return lo;
  for (let i = 0; i < 60; i += 1) {
    const mid = 0.5 * (lo + hi);
    const fMid = residual(mid);
    if (fLo * fMid <= 0) hi = mid;
    else {
      lo = mid;
      fLo = fMid;
    }
    if (Math.abs(hi - lo) < 1) break;
  }
  return 0.5 * (lo + hi);
}

/**
 * Axial lift from gauge pressure. Pocket (+ margin strips) at nearly uniform pD;
 * flat–flat overlap lands carry the isothermal p² log drop to atmosphere.
 */
function liftAt(pD: number, setup: Setup, geo: Geometry, air: Air): [number, number] {
  const lands = landRadiiOf(setup, geo);
  if (!lands) return [0, 0];
  const n = 400;
  const lnIn = Math.log(lands.rSealIn / lands.rInner);
  const lnOut = Math.log(lands.rOuter / lands.rSealOut);
  let sum = 0;
  let prevR = lands.rInner;
  let prevDp = 0;
  for (let i = 0; i < n; i += 1) {
    const r = lands.rInner + ((lands.rOuter - lands.rInner) * i) / (n - 1);
    let p2: number;
    if (r <= lands.rSealIn) {
      const t = Math.abs(lnIn) < 1e-12 ? 1 : Math.log(r / lands.rInner) / lnIn;
      p2 = air.pAtm ** 2 + t * (pD ** 2 - air.pAtm ** 2);
    } else if (r >= lands.rSealOut) {
      const t = Math.abs(lnOut) < 1e-12 ? 1 : Math.log(r / lands.rSealOut) / lnOut;
      p2 = pD ** 2 + t * (air.pAtm ** 2 - pD ** 2);
    } else {
      p2 = pD ** 2;
    }
    const dp = Math.sqrt(Math.max(p2, 0)) - air.pAtm;
    if (i > 0) sum += Math.PI * (dp * r + prevDp * prevR) * (r - prevR);
    prevR = r;
    prevDp = dp;
  }
  // Axial lift uses projected horizontal area; cone angle does not rescale that integral.
  return [sum, sum / Math.cos(geo.angleRad)];
}

function axialStiffness(hLip: number, setup: SuppliedSetup, geo: Geometry, air: Air): number {
  const h1 = hLip * 0.98;
  const h2 = hLip * 1.02;
  const w1 = liftAt(solvePocket(h1, setup, geo, air), setup, geo, air)[0];
  const w2 = liftAt(solvePocket(h2, setup, geo, air), setup, geo, air)[0];
  return -((w2 - w1) / (h2 - h1));
}

function liftForOrifice(
  hLip: number,
  setup: Omit<Setup, "orificeMm"> & { supplyBar: number },
  orificeMm: number,
  geo: Geometry,
): number {
  const fed: SuppliedSetup = { ...setup, orificeMm };
  return liftAt(solvePocket(hLip, fed, geo, AIR), fed, geo, AIR)[0];
}

/** Orifice diameter that makes lift equal disk weight at the design lip gap, for a known supply. */
export function solveOrificeMm(setup: Omit<Setup, "orificeMm"> & { supplyBar: number }): number | null {
  const hLip = Math.max(setup.gapUm, 1) * 1e-6;
  const geo = geometryOf(setup);
  if (!landRadiiOf({ ...setup, orificeMm: ORIFICE_MIN_MM }, geo)) return null;
  const lift = (d: number) => liftForOrifice(hLip, setup, d, geo);
  if (lift(ORIFICE_MAX_MM) < geo.weightN) return null;
  if (lift(ORIFICE_MIN_MM) >= geo.weightN) return ORIFICE_MIN_MM;
  let lo = ORIFICE_MIN_MM;
  let hi = ORIFICE_MAX_MM;
  for (let i = 0; i < 48; i += 1) {
    const mid = 0.5 * (lo + hi);
    if (lift(mid) < geo.weightN) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/** Pocket pressure whose film lift equals the disk weight (pressure field only; independent of holes). */
function pocketForWeight(setup: Setup, geo: Geometry): number | null {
  const target = geo.weightN;
  if (!(target > 0)) return AIR.pAtm;
  if (!landRadiiOf(setup, geo)) return null;
  const lift = (pD: number) => liftAt(pD, setup, geo, AIR)[0];
  let lo = AIR.pAtm;
  let hi = AIR.pAtm + 1000;
  for (let i = 0; i < 40 && lift(hi) < target; i += 1) hi = AIR.pAtm + (hi - AIR.pAtm) * 2;
  if (lift(hi) < target) return null;
  for (let i = 0; i < 50; i += 1) {
    const mid = 0.5 * (lo + hi);
    if (lift(mid) < target) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/**
 * Supply gauge pressure that feeds exactly the lip leak at `pD`.
 * Choked flow scales with absolute supply pressure; below choke the pressure ratio is solved from the isentropic flow function.
 */
function supplyBarForPocket(setup: Setup, hLip: number, pD: number, geo: Geometry): number | null {
  const diameterM = setup.orificeMm * 1e-3;
  if (!(diameterM > 0) || setup.nOrifices <= 0 || setup.cd <= 0 || !(pD > AIR.pAtm)) return null;
  const k =
    (setup.nOrifices * setup.cd * 0.25 * Math.PI * diameterM ** 2) /
    Math.sqrt(AIR.rSpecific * AIR.temperatureK);
  const mReq = filmOutflow(hLip, pD, setup, geo, AIR);
  if (!(mReq > 0) || !(k > 0)) return (pD - AIR.pAtm) / 1e5;

  const { gamma } = AIR;
  const crit = (2 / (gamma + 1)) ** (gamma / (gamma - 1));
  const phiChoke = Math.sqrt(gamma) * (2 / (gamma + 1)) ** ((gamma + 1) / (2 * (gamma - 1)));
  const pOChoked = mReq / (k * phiChoke);
  if (pOChoked >= pD / crit) return (pOChoked - AIR.pAtm) / 1e5;

  const target = mReq / (k * pD);
  let lo = crit;
  let hi = 1 - 1e-12;
  for (let i = 0; i < 60; i += 1) {
    const mid = 0.5 * (lo + hi);
    const flowPerPressure = flowFunction(mid, gamma) / mid;
    if (flowPerPressure > target) lo = mid;
    else hi = mid;
  }
  const pO = pD / (0.5 * (lo + hi));
  if (!(pO > pD)) return null;
  return (pO - AIR.pAtm) / 1e5;
}

/** Supply gauge pressure that makes lift equal disk weight at the design lip gap. */
export function solveSupplyBar(setup: Setup): number | null {
  const hLip = Math.max(setup.gapUm, 1) * 1e-6;
  const geo = geometryOf(setup);
  const pD = pocketForWeight(setup, geo);
  if (pD === null) return null;
  const guess = supplyBarForPocket(setup, hLip, pD, geo);
  if (guess === null || !Number.isFinite(guess) || guess < 0) return null;
  const lift = (bar: number) => {
    const fed = withSupply(setup, bar);
    return liftAt(solvePocket(hLip, fed, geo, AIR), fed, geo, AIR)[0];
  };
  let lo = 0;
  let hi = Math.max(guess * 4, guess + 1e-4);
  if (lift(hi) < geo.weightN) {
    for (let i = 0; i < 24 && lift(hi) < geo.weightN; i += 1) hi *= 2;
    if (lift(hi) < geo.weightN) return null;
  }
  for (let i = 0; i < 40; i += 1) {
    const mid = 0.5 * (lo + hi);
    if (lift(mid) < geo.weightN) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/** Hover lip gap for a known orifice and supply — used when migrating older saved setups. */
export function hoverGapUmForOrifice(
  setup: Omit<Setup, "gapUm"> & { supplyBar: number; gapUm?: number },
): number | null {
  // Hold the geometric recess fixed while searching the lip gap.
  const tipUm = typeof setup.gapUm === "number" && setup.gapUm > 0 ? setup.gapUm : 150;
  const recess = Math.max(setup.pocketGapMm * 1e-3 - tipUm * 1e-6, 0);
  const withRecess = (hUm: number): SuppliedSetup => ({
    ...setup,
    gapUm: hUm,
    pocketGapMm: hUm * 1e-3 + recess * 1e3,
    supplyBar: setup.supplyBar,
  });
  const geo = geometryOf(withRecess(tipUm));
  if (!landRadiiOf(withRecess(tipUm), geo)) return null;
  const lift = (h: number) => {
    const s = withRecess(h * 1e6);
    return liftAt(solvePocket(h, s, geo, AIR), s, geo, AIR)[0];
  };
  const hMin = 5e-6;
  const hMax = 400e-6;
  if (lift(hMin) < geo.weightN) return null;
  if (lift(hMax) > geo.weightN) return hMax * 1e6;
  let lo = hMin;
  let hi = hMax;
  for (let i = 0; i < 40; i += 1) {
    const mid = 0.5 * (lo + hi);
    if (lift(mid) > geo.weightN) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi) * 1e6;
}

function evaluateAt(hLip: number, setup: SuppliedSetup, withStiffness: boolean, willFloat: boolean): BearingState {
  const geo = geometryOf(setup);
  const air = AIR;
  const recess = recessDepthM(setup);
  const hPocket = hLip + recess;
  const lands = landRadiiOf(setup, geo);
  const pD = lands ? solvePocket(hLip, setup, geo, air) : air.pAtm;
  const [liftZ, liftN] = liftAt(pD, setup, geo, air);
  const kZ = withStiffness && lands ? axialStiffness(hLip, setup, geo, air) : 0;
  const alpha = geo.angleRad;
  const kR = kZ * Math.sin(alpha) ** 2 + (liftZ / Math.max(hLip, 1e-9)) * Math.sin(alpha);
  const mDot = lands ? filmOutflow(hLip, pD, setup, geo, air) : 0;
  const nlpm = (mDot / rhoAtm(air)) * 1000 * 60;
  const radius = feedRadiusM(setup);
  const notes: string[] = [];
  notes.push(...geometryNotes(setup, geo, hLip));
  if (!willFloat) {
    notes.push(
      "No supply pressure can hold this lip gap with these holes. Increase the orifice diameter, add holes, widen the lips, or lower the lip gap.",
    );
  }
  // Clearance warning — see soft-film-warning.md (applies to sealing lips only).
  if (willFloat && hLip < HOVER_RUB_GAP_M) {
    notes.push(
      `A ${(hLip * 1e6).toFixed(0)} µm lip gap sits inside typical resin face error on the seal rings (about ${HOVER_RUB_GAP_M * 1e6} µm until the lips are precision-lapped). High spots on the lips will rub before the disc can fly at this height. The deep pocket does not protect the lip rings.`,
    );
  }
  if (6.5e-8 / hLip > 0.01) {
    notes.push("The lip gap is close to the mean free path, so this continuum lip model is optimistic.");
  }
  // Orifice warning — curtain vs pocket height; see orifice-warning.md.
  if (willFloat && lands) {
    const limit = orificeWarnLimit(setup, hLip, geo);
    if (setup.orificeMm > limit.mm) notes.push(orificeWarnNote(setup.orificeMm, limit, hPocket));
  }
  // Hole-spacing warning — see hole-spacing-warning.md.
  notes.push(...holeSpacingNotes(setup, geo));
  return {
    gapM: hLip,
    pocketGapM: hPocket,
    recessM: recess,
    lipInnerM: setup.lipInnerMm * 1e-3,
    lipOuterM: setup.lipOuterMm * 1e-3,
    lateralMarginM: setup.lateralMarginMm * 1e-3,
    sealInnerM: lands ? lands.rSealIn - lands.rInner : 0,
    sealOuterM: lands ? lands.rOuter - lands.rSealOut : 0,
    orificeMm: setup.orificeMm,
    supplyBar: willFloat ? setup.supplyBar : null,
    pocketPressurePa: pD,
    liftAxialN: liftZ,
    liftNormalN: liftN,
    stiffnessAxial: kZ,
    radialStiffness: kR,
    massFlowKgS: mDot,
    volumeFlowNlpm: nlpm,
    floatMarginN: liftZ - geo.weightN,
    naturalFreqHz: Math.sqrt(Math.max(kZ, 0) / Math.max(geo.massKg, 1e-9)) / (2 * Math.PI),
    knudsen: 6.5e-8 / hLip,
    notes,
    weightN: geo.weightN,
    massKg: geo.massKg,
    areaM2: geo.areaM2,
    coneRiseM: geo.coneRiseM,
    feedRadiusM: radius,
    rInnerM: geo.rInner,
    rOuterM: geo.rOuter,
  };
}

export function evaluateBearing(setup: Setup): BearingState {
  const hLip = Math.max(setup.gapUm, 1) * 1e-6;
  const supplyBar = solveSupplyBar(setup);
  if (supplyBar === null) return evaluateAt(hLip, withSupply(setup, 0), true, false);
  return evaluateAt(hLip, withSupply(setup, supplyBar), true, true);
}

export function gapSweep(setup: Setup, supplyBar: number): Sweep {
  const recess = recessDepthM(setup);
  const geo = geometryOf(setup);
  const gaps = geomspace(12e-6, 400e-6, 40);
  const liftN: number[] = [];
  const stiffnessPerUm: number[] = [];
  const flowNlpm: number[] = [];
  for (const hLip of gaps) {
    // Hold geometric recess fixed while the lip gap sweeps.
    const fed = withSupply({ ...setup, gapUm: hLip * 1e6, pocketGapMm: hLip * 1e3 + recess * 1e3 }, supplyBar);
    const pD = solvePocket(hLip, fed, geo, AIR);
    liftN.push(liftAt(pD, fed, geo, AIR)[0]);
    const h1 = hLip * 0.98;
    const h2 = hLip * 1.02;
    const s1 = withSupply({ ...setup, gapUm: h1 * 1e6, pocketGapMm: h1 * 1e3 + recess * 1e3 }, supplyBar);
    const s2 = withSupply({ ...setup, gapUm: h2 * 1e6, pocketGapMm: h2 * 1e3 + recess * 1e3 }, supplyBar);
    const w1 = liftAt(solvePocket(h1, s1, geo, AIR), s1, geo, AIR)[0];
    const w2 = liftAt(solvePocket(h2, s2, geo, AIR), s2, geo, AIR)[0];
    stiffnessPerUm.push((-((w2 - w1) / (h2 - h1)) * 1e-6));
    flowNlpm.push((filmOutflow(hLip, pD, fed, geo, AIR) / rhoAtm(AIR)) * 1000 * 60);
  }
  return { gapUm: gaps.map((h) => h * 1e6), liftN, stiffnessPerUm, flowNlpm };
}

export function pressureCurve(setup: Setup, supplyBar: number, gapM: number): PressureCurve {
  const recess = recessDepthM(setup);
  const fed = withSupply(
    { ...setup, gapUm: gapM * 1e6, pocketGapMm: gapM * 1e3 + recess * 1e3 },
    supplyBar,
  );
  const geo = geometryOf(fed);
  const lands = landRadiiOf(fed, geo);
  const pD = lands ? solvePocket(gapM, fed, geo, AIR) : AIR.pAtm;
  const radiusMm: number[] = [];
  const gaugeBar: number[] = [];
  const n = 80;
  if (!lands) {
    return { radiusMm, gaugeBar };
  }
  const lnIn = Math.log(lands.rSealIn / lands.rInner);
  const lnOut = Math.log(lands.rOuter / lands.rSealOut);
  for (let i = 0; i < n; i += 1) {
    const r = lands.rInner + ((lands.rOuter - lands.rInner) * i) / (n - 1);
    let p2: number;
    if (r <= lands.rSealIn) {
      const t = Math.abs(lnIn) < 1e-12 ? 1 : Math.log(r / lands.rInner) / lnIn;
      p2 = AIR.pAtm ** 2 + t * (pD ** 2 - AIR.pAtm ** 2);
    } else if (r >= lands.rSealOut) {
      const t = Math.abs(lnOut) < 1e-12 ? 1 : Math.log(r / lands.rSealOut) / lnOut;
      p2 = pD ** 2 + t * (AIR.pAtm ** 2 - pD ** 2);
    } else {
      p2 = pD ** 2;
    }
    radiusMm.push(r * 1e3);
    gaugeBar.push((Math.sqrt(Math.max(p2, 0)) - AIR.pAtm) / 1e5);
  }
  return { radiusMm, gaugeBar };
}

function geomspace(start: number, end: number, count: number): number[] {
  const logStart = Math.log(start);
  const step = (Math.log(end) - logStart) / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.exp(logStart + step * i));
}

const PROTOTYPE_SCALE = 210 / 225;

const SMALL_CORE: Omit<Setup, "orificeMm"> = {
  outerMm: 225 * PROTOTYPE_SCALE,
  innerMm: 125 * PROTOTYPE_SCALE,
  angleDeg: 5,
  thicknessMm: 8 * PROTOTYPE_SCALE,
  statorMm: 1,
  density: 1200,
  nOrifices: 12,
  gapUm: 150,
  pocketGapMm: 1.5,
  lipInnerMm: 5,
  lipOuterMm: 5,
  lateralMarginMm: 1,
  feedFrac: 0.5,
  cd: 0.7,
  washerMm: 20,
};

/** Same disk family as before, orifice sized for 2 bar at the design lip gap. */
export const SMALL_DISK: Setup = {
  ...SMALL_CORE,
  orificeMm: solveOrificeMm({ ...SMALL_CORE, supplyBar: 2 }) ?? ORIFICE_MAX_MM,
};

const GRAPHITE_CORE: Omit<Setup, "orificeMm"> = {
  ...SMALL_CORE,
  outerMm: 8000,
  innerMm: 6550,
  thicknessMm: 8,
  statorMm: 1,
  gapUm: 150,
  pocketGapMm: 1.5,
  lipInnerMm: 40,
  lipOuterMm: 40,
  lateralMarginMm: 5,
  density: 1770,
};

export const GRAPHITE_DISK: Setup = {
  ...GRAPHITE_CORE,
  orificeMm: solveOrificeMm({ ...GRAPHITE_CORE, supplyBar: 2 }) ?? ORIFICE_MAX_MM,
};

export function massLabel(massKg: number): string {
  return massKg >= 1 ? `${massKg.toFixed(1)} kg` : `${Math.round(massKg * 1000)} g`;
}
