import { SMALL_DISK, evaluateBearing, AIR, feedRadiusM, type Setup } from "../src/physics.ts";

function filmC(setup: Setup, h: number) {
  const feed = feedRadiusM(setup);
  const rI = (setup.innerMm / 2) * 1e-3;
  const rO = (setup.outerMm / 2) * 1e-3;
  const k = (Math.PI * h ** 3) / (12 * AIR.mu * AIR.rSpecific * AIR.temperatureK);
  return k * (1 / Math.log(rO / feed) + 1 / Math.log(feed / rI));
}

function phiCrit() {
  const g = AIR.gamma;
  return Math.sqrt(g) * (2 / (g + 1)) ** ((g + 1) / (2 * (g - 1)));
}

function phi(pr: number) {
  const g = AIR.gamma;
  const p = Math.min(1, Math.max(0, pr));
  const crit = (2 / (g + 1)) ** (g / (g - 1));
  if (p <= crit) return phiCrit();
  return Math.sqrt(((2 * g) / (g - 1)) * (p ** (2 / g) - p ** ((g + 1) / g)));
}

/** Choked-capacity diameter matching kappa * film leak at pD = pO. */
function dMaxMm(setup: Setup, h: number, kappa: number) {
  const pO = AIR.pAtm + setup.supplyBar * 1e5;
  const mFilm = filmC(setup, h) * (pO ** 2 - AIR.pAtm ** 2);
  const A =
    (kappa * mFilm * Math.sqrt(AIR.rSpecific * AIR.temperatureK)) /
    (setup.nOrifices * setup.cd * pO * phiCrit());
  return Math.sqrt((4 * A) / Math.PI) * 1e3;
}

/**
 * Diameter for which orifice inflow at (pO, pD*) equals film outflow,
 * with pD* from a chosen beta. Used to see "large orifice" at high beta.
 */
function dForBeta(setup: Setup, h: number, beta: number) {
  const pO = AIR.pAtm + setup.supplyBar * 1e5;
  const pD = AIR.pAtm + beta * (pO - AIR.pAtm);
  const mFilm = filmC(setup, h) * (pD ** 2 - AIR.pAtm ** 2);
  const A =
    (mFilm * Math.sqrt(AIR.rSpecific * AIR.temperatureK)) /
    (setup.nOrifices * setup.cd * pO * phi(pD / pO));
  return Math.sqrt((4 * A) / Math.PI) * 1e3;
}

function report(setup: Setup, label: string) {
  const st = evaluateBearing(setup);
  const pO = AIR.pAtm + setup.supplyBar * 1e5;
  const beta = (st.pocketPressurePa - AIR.pAtm) / (pO - AIR.pAtm);
  const h = Math.max(setup.gapUm, 1) * 1e-6;
  const dMax = dMaxMm(setup, h, 1);
  console.log({
    label,
    gap: setup.gapUm,
    N: setup.nOrifices,
    supply: setup.supplyBar,
    density: setup.density,
    d: st.orificeMm,
    Kz: st.stiffnessAxial * 1e-6,
    beta,
    dMax,
    ratio: st.orificeMm ? st.orificeMm / dMax : null,
    dAtBeta05: dForBeta(setup, h, 0.5),
    dAtBeta08: dForBeta(setup, h, 0.8),
    dAtBeta09: dForBeta(setup, h, 0.9),
    notes: st.notes,
  });
}

report(SMALL_DISK, "default small");

for (const density of [1200, 5000, 20000, 80000]) {
  report({ ...SMALL_DISK, density, gapUm: 50 }, `rho=${density} gap50`);
}

for (const density of [1200, 20000, 80000, 200000]) {
  report({ ...SMALL_DISK, density, gapUm: 20, nOrifices: 6, supplyBar: 1 }, `heavy few holes`);
}

for (const n of [3, 6, 12]) {
  report({ ...SMALL_DISK, density: 50000, gapUm: 30, nOrifices: n, supplyBar: 1.5 }, `N=${n}`);
}

// Stiffness vs beta at fixed geometry by varying density (changes required pD)
console.log("\n--- stiffness vs beta at gap 30 µm ---");
for (const density of [2000, 5000, 10000, 20000, 40000, 60000, 80000, 100000, 120000]) {
  const s = { ...SMALL_DISK, density, gapUm: 30, supplyBar: 2 };
  const st = evaluateBearing(s);
  const pO = AIR.pAtm + s.supplyBar * 1e5;
  const beta = (st.pocketPressurePa - AIR.pAtm) / (pO - AIR.pAtm);
  console.log({
    density,
    d: st.orificeMm?.toFixed(3),
    beta: beta.toFixed(3),
    Kz: (st.stiffnessAxial * 1e-6).toFixed(3),
    lift: st.liftAxialN.toFixed(1),
    W: st.weightN.toFixed(1),
  });
}
