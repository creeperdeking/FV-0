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
  density: number;
  supplyBar: number;
  nOrifices: number;
  orificeMm: number;
  feedFrac: number;
  cd: number;
  gapUm: number;
  rpm: number;
  nozzleAngle: number;
  eta: number;
};

export type BearingState = {
  gapM: number;
  pocketPressurePa: number;
  liftAxialN: number;
  liftNormalN: number;
  stiffnessAxial: number;
  radialStiffness: number;
  massFlowKgS: number;
  volumeFlowNlpm: number;
  viscousTorqueNm: number;
  spinPowerW: number;
  tipSpeedMs: number;
  floatMarginN: number;
  naturalFreqHz: number;
  knudsen: number;
  centrifugalDpPa: number;
  jetSpeedMs: number;
  driveTorqueNm: number;
  freeSpinRpm: number;
  notes: string[];
  weightN: number;
  massKg: number;
  areaM2: number;
  coneRiseM: number;
  feedRadiusM: number;
  rInnerM: number;
  rOuterM: number;
};

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

function geometryOf(setup: Setup): Geometry {
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

function solvePocket(h: number, setup: Setup, geo: Geometry, air: Air): number {
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

function axialStiffness(h: number, setup: Setup, geo: Geometry, air: Air): number {
  const h1 = h * 0.98;
  const h2 = h * 1.02;
  const w1 = liftAt(solvePocket(h1, setup, geo, air), setup, geo, air)[0];
  const w2 = liftAt(solvePocket(h2, setup, geo, air), setup, geo, air)[0];
  return -((w2 - w1) / (h2 - h1));
}

function jetSpeed(pSupply: number, pDown: number, air: Air): number {
  const pr = Math.min(1, Math.max(1e-6, pDown / pSupply));
  const crit = (2 / (air.gamma + 1)) ** (air.gamma / (air.gamma - 1));
  if (pr <= crit) {
    const tThroat = (air.temperatureK * 2) / (air.gamma + 1);
    return Math.sqrt(air.gamma * air.rSpecific * tThroat);
  }
  const factor = 1 - pr ** ((air.gamma - 1) / air.gamma);
  return Math.sqrt((2 * air.gamma * air.rSpecific * air.temperatureK * Math.max(factor, 0)) / (air.gamma - 1));
}

function dragPerOmega(h: number, geo: Geometry, air: Air): number {
  return ((Math.PI * air.mu) / (2 * h)) * (geo.rOuter ** 4 - geo.rInner ** 4) / Math.cos(geo.angleRad);
}

function evaluateAt(h: number, setup: Setup, withStiffness: boolean): BearingState {
  const geo = geometryOf(setup);
  const air = AIR;
  const pD = solvePocket(h, setup, geo, air);
  const [liftZ, liftN] = liftAt(pD, setup, geo, air);
  const kZ = withStiffness ? axialStiffness(h, setup, geo, air) : 0;
  const alpha = geo.angleRad;
  const kR = kZ * Math.sin(alpha) ** 2 + (liftZ / Math.max(h, 1e-9)) * Math.sin(alpha);
  const mDot = filmOutflow(h, pD, setup, geo, air);
  const nlpm = (mDot / rhoAtm(air)) * 1000 * 60;
  const omega = (setup.rpm * 2 * Math.PI) / 60;
  const torque = omega === 0 ? 0 : dragPerOmega(h, geo, air) * omega;
  const vJet = jetSpeed(air.pAtm + setup.supplyBar * 1e5, pD, air);
  const vTangential = vJet * Math.sin((setup.nozzleAngle * Math.PI) / 180);
  const radius = feedRadiusM(setup);
  const stall = setup.eta * mDot * vTangential * radius;
  const coupling = setup.eta * mDot * radius ** 2;
  const freeOmega = stall / (dragPerOmega(h, geo, air) + coupling);
  const dpCent = omega === 0 ? 0 : (3 / 20) * rhoAtm(air) * omega ** 2 * (geo.rOuter ** 2 - geo.rInner ** 2);
  const notes: string[] = [];
  if (liftZ < geo.weightN) notes.push("Lift is below the disk weight at this gap, so the disk will not float.");
  if (h > 150e-6) notes.push("Above 150 µm the film is soft. A loaded bearing usually flies at 5–30 µm.");
  if (h < 10e-6) notes.push("Below 10 µm is hard to hold with a printed face. Lap the cone or shim it.");
  if (6.5e-8 / h > 0.01) notes.push("The gap is close to the mean free path, so this continuum model is optimistic.");
  if (setup.orificeMm > 1) notes.push("Large orifices raise the air use and often cut the stiffness. Try 0.2–0.5 mm.");
  if (setup.orificeMm > 0.8 && h < 40e-6) notes.push("Avoid a deep pocket under each hole. Stored air invites pneumatic hammer.");
  if (dpCent > 0.1 * Math.max(pD - air.pAtm, 1)) {
    notes.push("Centrifugal pumping is more than 10% of the pocket pressure, so spin will shift the pressure outward.");
  }
  return {
    gapM: h,
    pocketPressurePa: pD,
    liftAxialN: liftZ,
    liftNormalN: liftN,
    stiffnessAxial: kZ,
    radialStiffness: kR,
    massFlowKgS: mDot,
    volumeFlowNlpm: nlpm,
    viscousTorqueNm: torque,
    spinPowerW: Math.abs(torque * omega),
    tipSpeedMs: omega * geo.rOuter,
    floatMarginN: liftZ - geo.weightN,
    naturalFreqHz: Math.sqrt(Math.max(kZ, 0) / Math.max(geo.massKg, 1e-9)) / (2 * Math.PI),
    knudsen: 6.5e-8 / h,
    centrifugalDpPa: dpCent,
    jetSpeedMs: vJet,
    driveTorqueNm: stall,
    freeSpinRpm: (freeOmega * 60) / (2 * Math.PI),
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
  return evaluateAt(setup.gapUm * 1e-6, setup, true);
}

export function equilibriumGapM(setup: Setup): number | null {
  const geo = geometryOf(setup);
  const lift = (h: number) => liftAt(solvePocket(h, setup, geo, AIR), setup, geo, AIR)[0];
  const hMin = 5e-6;
  const hMax = 400e-6;
  if (lift(hMin) < geo.weightN) return null;
  if (lift(hMax) > geo.weightN) return hMax;
  let lo = hMin;
  let hi = hMax;
  for (let i = 0; i < 40; i += 1) {
    const mid = 0.5 * (lo + hi);
    if (lift(mid) > geo.weightN) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

export function gapSweep(setup: Setup): Sweep {
  const geo = geometryOf(setup);
  const gaps = geomspace(12e-6, 220e-6, 32);
  const liftN: number[] = [];
  const stiffnessPerUm: number[] = [];
  const flowNlpm: number[] = [];
  for (const h of gaps) {
    const pD = solvePocket(h, setup, geo, AIR);
    liftN.push(liftAt(pD, setup, geo, AIR)[0]);
    const h1 = h * 0.98;
    const h2 = h * 1.02;
    const w1 = liftAt(solvePocket(h1, setup, geo, AIR), setup, geo, AIR)[0];
    const w2 = liftAt(solvePocket(h2, setup, geo, AIR), setup, geo, AIR)[0];
    stiffnessPerUm.push((-((w2 - w1) / (h2 - h1)) * 1e-6));
    flowNlpm.push((filmOutflow(h, pD, setup, geo, AIR) / rhoAtm(AIR)) * 1000 * 60);
  }
  return { gapUm: gaps.map((h) => h * 1e6), liftN, stiffnessPerUm, flowNlpm };
}

export function pressureCurve(setup: Setup): PressureCurve {
  const geo = geometryOf(setup);
  const h = setup.gapUm * 1e-6;
  const pD = solvePocket(h, setup, geo, AIR);
  const feed = feedRadiusM(setup);
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

export function angleForOneRev(setup: Setup, hoverGapM: number): number {
  const geo = geometryOf(setup);
  const pD = solvePocket(hoverGapM, setup, geo, AIR);
  const mDot = filmOutflow(hoverGapM, pD, setup, geo, AIR);
  const vJet = jetSpeed(AIR.pAtm + setup.supplyBar * 1e5, pD, AIR);
  const radius = feedRadiusM(setup);
  const omega = 2 * Math.PI;
  const coupling = setup.eta * mDot * radius ** 2;
  const stallNeeded = omega * (dragPerOmega(hoverGapM, geo, AIR) + coupling);
  const sinTheta = Math.min(1, Math.max(0, stallNeeded / (setup.eta * mDot * vJet * radius)));
  return (Math.asin(sinTheta) * 180) / Math.PI;
}

function geomspace(start: number, end: number, count: number): number[] {
  const logStart = Math.log(start);
  const step = (Math.log(end) - logStart) / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.exp(logStart + step * i));
}

export const SMALL_DISK: Setup = {
  outerMm: 225,
  innerMm: 125,
  angleDeg: 5,
  thicknessMm: 8,
  density: 1200,
  supplyBar: 2,
  nOrifices: 12,
  orificeMm: 0.4,
  feedFrac: 0.5,
  cd: 0.7,
  gapUm: 50,
  rpm: 60,
  nozzleAngle: 0,
  eta: 0.5,
};

export const GRAPHITE_DISK: Setup = {
  ...SMALL_DISK,
  outerMm: 8000,
  innerMm: 6550,
  density: 1770,
};

export function massLabel(massKg: number): string {
  return massKg >= 1 ? `${massKg.toFixed(1)} kg` : `${Math.round(massKg * 1000)} g`;
}
