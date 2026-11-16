/** First-order aerostatic model of a shallow conical annular disk. */

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
  gapUm: number;
  feedFrac: number;
  cd: number;
  /** Washer outer diameter for CAD bay sizing (mm). */
  washerMm: number;
};

/** Setup plus the supply pressure that holds the design gap. */
type SuppliedSetup = Setup & { supplyBar: number };

export type BearingState = {
  gapM: number;
  orificeMm: number;
  /** Gauge pressure that holds the disk at the design gap. Null when no pressure can. */
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
const ORIFICE_MAX_MM = 5;

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

function filmConductance(h: number, rA: number, rB: number, air: Air): number {
  const r1 = Math.min(rA, rB);
  const r2 = Math.max(rA, rB);
  return (Math.PI * h ** 3) / (12 * air.mu * air.rSpecific * air.temperatureK * Math.log(r2 / r1));
}

function filmOutflow(h: number, pD: number, setup: Setup, geo: Geometry, air: Air): number {
  const feed = feedRadiusM(setup);
  const cOut = filmConductance(h, feed, geo.rOuter, air);
  const cIn = filmConductance(h, geo.rInner, feed, air);
  return (cOut + cIn) * (pD ** 2 - air.pAtm ** 2);
}

// Clearance warning: keep in sync with soft-film-warning.md whenever you change
// HOVER_RUB_GAP_M or the evaluateAt branch that emits the banner.
// A hovering disc may be soft. Warn only when the flying height is inside typical resin face error.
const HOVER_RUB_GAP_M = 50e-6;

// Hole-spacing warning: keep in sync with hole-spacing-warning.md whenever you change
// HOLE_PITCH_WARN_LAND, HOLE_PITCH_NOTE_LAND, holeSpacingNotes, or the evaluateAt branch that emits them.
const HOLE_PITCH_WARN_LAND = 2;
const HOLE_PITCH_NOTE_LAND = 1;

// Orifice-size warning: keep in sync with orifice-warning.md whenever you change
// POCKET_RATIO_WARN, curtainOrificeMm, orificeMmAtPocketRatio, orificeWarnLimit,
// orificeWarnNote, or the evaluateAt branch that emits the banner.

/** Past this pocket gauge ratio the axial stiffness is already down the far side of its peak (~0.62 on this cone). See orifice-warning.md. */
const POCKET_RATIO_WARN = 0.8;

/**
 * Warning diameter for the inlet curtain (mm). Crossover is d = 4h; warn at d = 2h.
 * Update orifice-warning.md if you change the factor or the series-area argument.
 */
function curtainOrificeMm(h: number): number {
  return 2 * h * 1e3;
}

/**
 * Hole diameter that sets the pocket gauge ratio to `beta` at gap `h`, assuming the throat is the restrictor.
 * Update orifice-warning.md if the target beta or this closed form changes.
 */
function orificeMmAtPocketRatio(setup: SuppliedSetup, h: number, geo: Geometry, beta: number): number {
  const pO = AIR.pAtm + setup.supplyBar * 1e5;
  const pD = AIR.pAtm + beta * (pO - AIR.pAtm);
  const phi = flowFunction(pD / pO, AIR.gamma);
  if (phi <= 1e-12 || setup.nOrifices <= 0 || setup.cd <= 0) return Number.POSITIVE_INFINITY;
  const mOne = filmOutflow(h, pD, setup, geo, AIR) / setup.nOrifices;
  const area = (mOne * Math.sqrt(AIR.rSpecific * AIR.temperatureK)) / (setup.cd * pO * phi);
  return Math.sqrt((4 * Math.max(area, 0)) / Math.PI) * 1e3;
}

type OrificeLimit = { mm: number; kind: "curtain" | "stiffness" | "land" };

/**
 * Tightest diameter that still matches the assumptions of this orifice model.
 * Update orifice-warning.md if you add, remove, or retune a limit.
 */
function orificeWarnLimit(setup: SuppliedSetup, h: number, geo: Geometry): OrificeLimit {
  const feed = feedRadiusM(setup);
  const landM = Math.min(feed - geo.rInner, geo.rOuter - feed);
  const pitchM = (2 * Math.PI * feed) / Math.max(setup.nOrifices, 1);
  const limits: OrificeLimit[] = [
    { mm: curtainOrificeMm(h), kind: "curtain" },
    { mm: orificeMmAtPocketRatio(setup, h, geo, POCKET_RATIO_WARN), kind: "stiffness" },
    { mm: 0.2 * Math.min(landM, pitchM) * 1e3, kind: "land" },
  ];
  return limits.reduce((tightest, limit) => (limit.mm < tightest.mm ? limit : tightest));
}

/** Banner copy for the orifice warning. Keep wording aligned with orifice-warning.md. */
function orificeWarnNote(orificeMm: number, limit: OrificeLimit, h: number): string {
  const hole = orificeMm.toFixed(2);
  const cap = limit.mm.toFixed(2);
  if (limit.kind === "curtain") {
    const crossover = (limit.mm * 2).toFixed(2);
    const hammer = h < 40e-6 ? " A recess at this gap can store enough air to hammer." : "";
    return `Each hole is ${hole} mm. The orifice cross section matches the inlet curtain at ${crossover} mm diameter (4× the gap). Above ${cap} mm little margin is left before the film entrance, rather than the orifice, sets the flow.${hammer}`;
  }
  if (limit.kind === "stiffness") {
    return `Each hole is ${hole} mm. Above ${cap} mm at this gap the pocket pressure is past the stiffness peak, so a larger hole mostly adds air use.`;
  }
  return `Each hole is ${hole} mm. Above ${cap} mm the hole is a large fraction of the land or the hole spacing, so the feed is no longer a ring of small sources.`;
}

/**
 * Circumferential spacing vs radial land. Update hole-spacing-warning.md if the ratios or copy change.
 * The axisymmetric film model assumes a continuous feed ring, so sparse holes need this geometric check.
 */
function holeSpacingNotes(setup: Setup, geo: Geometry): string[] {
  const feed = feedRadiusM(setup);
  const landM = Math.min(feed - geo.rInner, geo.rOuter - feed);
  if (landM <= 0 || setup.nOrifices <= 0) return [];
  const pitchM = (2 * Math.PI * feed) / setup.nOrifices;
  const ratio = pitchM / landM;
  const nEven = Math.max(1, Math.ceil((2 * Math.PI * feed) / landM));
  const pitchMm = (pitchM * 1e3).toFixed(0);
  const landMm = (landM * 1e3).toFixed(0);
  if (ratio > HOLE_PITCH_WARN_LAND) {
    return [
      `Hole spacing is ${pitchMm} mm on the feed ring, more than ${HOLE_PITCH_WARN_LAND}× the ${landMm} mm land. Soft sectors between the jets can tip the disk; aim near ${nEven} holes so the pitch matches the land. This model averages the ring and will not show that rocking.`,
    ];
  }
  if (ratio > HOLE_PITCH_NOTE_LAND) {
    return [
      `Hole spacing is ${pitchMm} mm vs a ${landMm} mm land (${setup.nOrifices} holes). Fine for a first static hover; about ${nEven} holes would let the high-pressure zones meet before you rely on even pressure.`,
    ];
  }
  return [];
}

function withSupply(setup: Setup, supplyBar: number): SuppliedSetup {
  return { ...setup, supplyBar };
}

function solvePocket(h: number, setup: SuppliedSetup, geo: Geometry, air: Air): number {
  const pO = air.pAtm + setup.supplyBar * 1e5;
  const residual = (pD: number) =>
    setup.nOrifices * orificeMassFlow(pO, pD, setup.orificeMm * 1e-3, setup.cd, air) - filmOutflow(h, pD, setup, geo, air);
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

function liftAt(pD: number, setup: Setup, geo: Geometry, air: Air): [number, number] {
  const n = 400;
  const feed = feedRadiusM(setup);
  const lnIn = Math.log(feed / geo.rInner);
  const lnOut = Math.log(geo.rOuter / feed);
  let sum = 0;
  let prevR = geo.rInner;
  let prevDp = 0;
  for (let i = 0; i < n; i += 1) {
    const r = geo.rInner + ((geo.rOuter - geo.rInner) * i) / (n - 1);
    let p2: number;
    if (r <= feed) {
      const t = Math.abs(lnIn) < 1e-12 ? 1 : Math.log(r / geo.rInner) / lnIn;
      p2 = air.pAtm ** 2 + t * (pD ** 2 - air.pAtm ** 2);
    } else {
      const t = Math.abs(lnOut) < 1e-12 ? 1 : Math.log(r / feed) / lnOut;
      p2 = pD ** 2 + t * (air.pAtm ** 2 - pD ** 2);
    }
    const dp = Math.sqrt(Math.max(p2, 0)) - air.pAtm;
    if (i > 0) sum += Math.PI * (dp * r + prevDp * prevR) * (r - prevR);
    prevR = r;
    prevDp = dp;
  }
  return [sum, sum / Math.cos(geo.angleRad)];
}

function axialStiffness(h: number, setup: SuppliedSetup, geo: Geometry, air: Air): number {
  const h1 = h * 0.98;
  const h2 = h * 1.02;
  const w1 = liftAt(solvePocket(h1, setup, geo, air), setup, geo, air)[0];
  const w2 = liftAt(solvePocket(h2, setup, geo, air), setup, geo, air)[0];
  return -((w2 - w1) / (h2 - h1));
}

function liftForOrifice(
  h: number,
  setup: Omit<Setup, "orificeMm"> & { supplyBar: number },
  orificeMm: number,
  geo: Geometry,
): number {
  const fed: SuppliedSetup = { ...setup, orificeMm };
  return liftAt(solvePocket(h, fed, geo, AIR), fed, geo, AIR)[0];
}

/** Orifice diameter that makes lift equal disk weight at the design gap, for a known supply. Used to migrate older saved setups. */
export function solveOrificeMm(setup: Omit<Setup, "orificeMm"> & { supplyBar: number }): number | null {
  const h = Math.max(setup.gapUm, 1) * 1e-6;
  const geo = geometryOf(setup);
  const lift = (d: number) => liftForOrifice(h, setup, d, geo);
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

/** Pocket pressure whose film lift equals the disk weight. The radial shape is fixed, so this does not depend on the holes or the supply. */
function pocketForWeight(setup: Setup, geo: Geometry): number | null {
  const target = geo.weightN;
  if (!(target > 0)) return AIR.pAtm;
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
 * Supply gauge pressure that feeds exactly the film flow at `pD`.
 * Choked flow scales with absolute supply pressure; below choke the pressure ratio is solved from the isentropic flow function.
 */
function supplyBarForPocket(setup: Setup, h: number, pD: number, geo: Geometry): number | null {
  const diameterM = setup.orificeMm * 1e-3;
  if (!(diameterM > 0) || setup.nOrifices <= 0 || setup.cd <= 0 || !(pD > AIR.pAtm)) return null;
  const k =
    (setup.nOrifices * setup.cd * 0.25 * Math.PI * diameterM ** 2) /
    Math.sqrt(AIR.rSpecific * AIR.temperatureK);
  const mReq = filmOutflow(h, pD, setup, geo, AIR);
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

/** Supply gauge pressure that makes lift equal disk weight at the design gap. */
export function solveSupplyBar(setup: Setup): number | null {
  const h = Math.max(setup.gapUm, 1) * 1e-6;
  const geo = geometryOf(setup);
  const pD = pocketForWeight(setup, geo);
  if (pD === null) return null;
  const guess = supplyBarForPocket(setup, h, pD, geo);
  if (guess === null || !Number.isFinite(guess) || guess < 0) return null;
  const lift = (bar: number) => {
    const fed = withSupply(setup, bar);
    return liftAt(solvePocket(h, fed, geo, AIR), fed, geo, AIR)[0];
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

/** Hover gap for a known orifice and supply — used when migrating older saved setups. */
export function hoverGapUmForOrifice(setup: Omit<Setup, "gapUm"> & { supplyBar: number }): number | null {
  const fed: SuppliedSetup = { ...setup, gapUm: 0 };
  const geo = geometryOf(fed);
  const lift = (h: number) => liftAt(solvePocket(h, fed, geo, AIR), fed, geo, AIR)[0];
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

function evaluateAt(h: number, setup: SuppliedSetup, withStiffness: boolean, willFloat: boolean): BearingState {
  const geo = geometryOf(setup);
  const air = AIR;
  const pD = solvePocket(h, setup, geo, air);
  const [liftZ, liftN] = liftAt(pD, setup, geo, air);
  const kZ = withStiffness ? axialStiffness(h, setup, geo, air) : 0;
  const alpha = geo.angleRad;
  const kR = kZ * Math.sin(alpha) ** 2 + (liftZ / Math.max(h, 1e-9)) * Math.sin(alpha);
  const mDot = filmOutflow(h, pD, setup, geo, air);
  const nlpm = (mDot / rhoAtm(air)) * 1000 * 60;
  const radius = feedRadiusM(setup);
  const notes: string[] = [];
  if (!willFloat) {
    notes.push(
      "No supply pressure can hold this gap with these holes. Increase the orifice diameter, add holes, or lower the gap.",
    );
  }
  // Clearance warning — see soft-film-warning.md; update that file when this branch or its constant change.
  if (willFloat && h < HOVER_RUB_GAP_M) {
    notes.push(
      `A ${(h * 1e6).toFixed(0)} µm hover sits inside typical resin face error (about ${HOVER_RUB_GAP_M * 1e6} µm until the cones are precision-lapped). High spots will touch before the disc can fly at this height.`,
    );
  }
  if (6.5e-8 / h > 0.01) notes.push("The gap is close to the mean free path, so this continuum model is optimistic.");
  // Orifice warning — see orifice-warning.md; update that file when this branch or its helpers change.
  if (willFloat) {
    const limit = orificeWarnLimit(setup, h, geo);
    if (setup.orificeMm > limit.mm) notes.push(orificeWarnNote(setup.orificeMm, limit, h));
  }
  // Hole-spacing warning — see hole-spacing-warning.md; update that file when this branch or its helpers change.
  notes.push(...holeSpacingNotes(setup, geo));
  return {
    gapM: h,
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
    knudsen: 6.5e-8 / h,
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
  const h = Math.max(setup.gapUm, 1) * 1e-6;
  const supplyBar = solveSupplyBar(setup);
  if (supplyBar === null) return evaluateAt(h, withSupply(setup, 0), true, false);
  return evaluateAt(h, withSupply(setup, supplyBar), true, true);
}

export function gapSweep(setup: Setup, supplyBar: number): Sweep {
  const fed = withSupply(setup, supplyBar);
  const geo = geometryOf(fed);
  const gaps = geomspace(12e-6, 500e-6, 40);
  const liftN: number[] = [];
  const stiffnessPerUm: number[] = [];
  const flowNlpm: number[] = [];
  for (const h of gaps) {
    const pD = solvePocket(h, fed, geo, AIR);
    liftN.push(liftAt(pD, fed, geo, AIR)[0]);
    const h1 = h * 0.98;
    const h2 = h * 1.02;
    const w1 = liftAt(solvePocket(h1, fed, geo, AIR), fed, geo, AIR)[0];
    const w2 = liftAt(solvePocket(h2, fed, geo, AIR), fed, geo, AIR)[0];
    stiffnessPerUm.push((-((w2 - w1) / (h2 - h1)) * 1e-6));
    flowNlpm.push((filmOutflow(h, pD, fed, geo, AIR) / rhoAtm(AIR)) * 1000 * 60);
  }
  return { gapUm: gaps.map((h) => h * 1e6), liftN, stiffnessPerUm, flowNlpm };
}

export function pressureCurve(setup: Setup, supplyBar: number, gapM: number): PressureCurve {
  const fed = withSupply(setup, supplyBar);
  const geo = geometryOf(fed);
  const h = gapM;
  const pD = solvePocket(h, fed, geo, AIR);
  const feed = feedRadiusM(fed);
  const lnIn = Math.log(feed / geo.rInner);
  const lnOut = Math.log(geo.rOuter / feed);
  const radiusMm: number[] = [];
  const gaugeBar: number[] = [];
  const n = 80;
  for (let i = 0; i < n; i += 1) {
    const r = geo.rInner + ((geo.rOuter - geo.rInner) * i) / (n - 1);
    let p2: number;
    if (r <= feed) {
      const t = Math.abs(lnIn) < 1e-12 ? 1 : Math.log(r / geo.rInner) / lnIn;
      p2 = AIR.pAtm ** 2 + t * (pD ** 2 - AIR.pAtm ** 2);
    } else {
      const t = Math.abs(lnOut) < 1e-12 ? 1 : Math.log(r / feed) / lnOut;
      p2 = pD ** 2 + t * (AIR.pAtm ** 2 - pD ** 2);
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
  gapUm: 250,
  feedFrac: 0.5,
  cd: 0.7,
  washerMm: 20,
};

/** Same disk as before, with the orifice that hovered it at 2 bar on the design gap. */
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
  gapUm: 157,
  density: 1770,
};

export const GRAPHITE_DISK: Setup = {
  ...GRAPHITE_CORE,
  orificeMm: solveOrificeMm({ ...GRAPHITE_CORE, supplyBar: 2 }) ?? ORIFICE_MAX_MM,
};

export function massLabel(massKg: number): string {
  return massKg >= 1 ? `${massKg.toFixed(1)} kg` : `${Math.round(massKg * 1000)} g`;
}
