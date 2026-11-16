/** Shop-air chain sizing from the bearing demand. */

import { AIR, type BearingState, type Setup } from "./physics";

const COMPRESSOR_KW = [0.55, 0.75, 1.1, 1.5, 2.2, 3, 4, 5.5, 7.5, 11, 15];
const OVERALL_ETA = 0.55;
const FLOW_MARGIN = 1.5;
const MAX_LINE_SPEED = 12;

// Aquarium-pump budget envelope — update SetupDiagram copy if these change.
const AQUARIUM_MAX_SUPPLY_BAR = 0.3;
const AQUARIUM_MAX_POWER_W = 10;
const AQUARIUM_MAX_NLPM = 10;

export type PneumaticSizing = {
  demandNlpm: number;
  designNlpm: number;
  supplyGaugeBar: number;
  supplyAbsBar: number;
  isothermalPowerW: number;
  electricPowerW: number;
  recommendedKw: number;
  aquariumOk: boolean;
  aquariumWarning: string | null;
  sourceLabel: string;
  receiverL: number;
  mainTubeOdMm: number;
  mainTubeIdMm: number;
  branchTubeOdMm: number;
  branchTubeIdMm: number;
  shutoff: string;
  regulator: string;
  needleValve: string;
  filter: string;
  dryer: string;
  manifold: string;
  fittings: string;
  notes: string[];
};

function nextCompressorKw(powerKw: number): number {
  for (const size of COMPRESSOR_KW) {
    if (size >= powerKw * 1.15) return size;
  }
  return Math.ceil(powerKw * 1.15 * 10) / 10;
}

function tubeForNlpm(nlpm: number, absBar: number): { odMm: number; idMm: number } {
  const actualM3s = (nlpm / 1000 / 60) * (AIR.pAtm / (absBar * 1e5));
  const candidates = [
    { odMm: 4, idMm: 2.5 },
    { odMm: 6, idMm: 4 },
    { odMm: 8, idMm: 5.5 },
    { odMm: 10, idMm: 6.5 },
    { odMm: 12, idMm: 8 },
  ];
  for (const tube of candidates) {
    const area = Math.PI * (tube.idMm * 1e-3 * 0.5) ** 2;
    if (actualM3s / area <= MAX_LINE_SPEED) return tube;
  }
  return candidates[candidates.length - 1]!;
}

function needleSize(designNlpm: number): string {
  if (designNlpm <= 40) return "G1/8 precision needle valve (fine pitch)";
  if (designNlpm <= 120) return "G1/4 precision needle valve";
  if (designNlpm <= 300) return "G3/8 needle / metering valve";
  return "G1/2 metering valve with bypass ball valve";
}

function regulatorSize(designNlpm: number, supplyGaugeBar: number): string {
  const setBar = Math.ceil(supplyGaugeBar * 10) / 10;
  const maxBar = Math.max(4, Math.ceil(supplyGaugeBar + 1));
  if (designNlpm <= 80) return `0–${maxBar} bar regulator, ≥ ${Math.ceil(designNlpm)} NL/min, set to ${setBar} bar`;
  if (designNlpm <= 250) return `0–${maxBar} bar regulator, G1/4, ≥ ${Math.ceil(designNlpm)} NL/min, set to ${setBar} bar`;
  return `0–${maxBar} bar regulator, G3/8 or larger, ≥ ${Math.ceil(designNlpm)} NL/min, set to ${setBar} bar`;
}

export function sizePneumatics(setup: Setup, state: BearingState): PneumaticSizing {
  const demandNlpm = Math.max(state.volumeFlowNlpm, 0.1);
  const designNlpm = demandNlpm * FLOW_MARGIN;
  const supplyGaugeBar = state.supplyBar ?? 0;
  const supplyAbsBar = AIR.pAtm / 1e5 + supplyGaugeBar;
  const mDot = state.massFlowKgS > 0 ? state.massFlowKgS : (demandNlpm / 1000 / 60) * (AIR.pAtm / (AIR.rSpecific * AIR.temperatureK));
  const isothermalPowerW = mDot * AIR.rSpecific * AIR.temperatureK * Math.log(Math.max(supplyAbsBar * 1e5 / AIR.pAtm, 1.01));
  const electricPowerW = (isothermalPowerW * FLOW_MARGIN) / OVERALL_ETA;
  const recommendedKw = nextCompressorKw(electricPowerW / 1000);
  const overPressure = supplyGaugeBar > AQUARIUM_MAX_SUPPLY_BAR;
  const overPower = electricPowerW > AQUARIUM_MAX_POWER_W;
  const overFlow = demandNlpm > AQUARIUM_MAX_NLPM;
  const aquariumOk = state.supplyBar !== null && !overPressure && !overPower && !overFlow;
  const aquariumParts: string[] = [];
  if (state.supplyBar !== null && overPressure) {
    aquariumParts.push(`supply ${supplyGaugeBar.toFixed(2)} bar (limit ${AQUARIUM_MAX_SUPPLY_BAR} bar)`);
  }
  if (overPower) aquariumParts.push(`power ${powerLabel(electricPowerW)} (limit ${AQUARIUM_MAX_POWER_W} W)`);
  if (overFlow) aquariumParts.push(`air use ${demandNlpm.toFixed(1)} NL/min (limit ${AQUARIUM_MAX_NLPM} NL/min)`);
  const aquariumWarning =
    state.supplyBar === null
      ? null
      : aquariumOk
        ? null
        : `Beyond a typical aquarium / pond air pump: ${aquariumParts.join(", ")}. Stay under ${AQUARIUM_MAX_SUPPLY_BAR} bar, ${AQUARIUM_MAX_POWER_W} W, and ${AQUARIUM_MAX_NLPM} NL/min for that budget source.`;
  const sourceLabel = aquariumOk
    ? "aquarium / pond air pump"
    : `shop compressor ≥ ${recommendedKw} kW`;
  const main = tubeForNlpm(aquariumOk ? demandNlpm : designNlpm, supplyAbsBar);
  const branch = tubeForNlpm((aquariumOk ? demandNlpm : designNlpm) / Math.max(setup.nOrifices, 1), supplyAbsBar);
  const receiverL = aquariumOk ? 0 : Math.max(10, Math.round(designNlpm * 0.35));
  const notes: string[] = [];
  if (aquariumOk) {
    notes.push(`Hover demand is ${demandNlpm.toFixed(1)} NL/min at ${supplyGaugeBar.toFixed(2)} bar gauge (~${powerLabel(electricPowerW)}).`);
    notes.push(
      `Aquarium / pond air pump is enough (≤ ${AQUARIUM_MAX_SUPPLY_BAR} bar, ≤ ${AQUARIUM_MAX_POWER_W} W, ≤ ${AQUARIUM_MAX_NLPM} NL/min). Match the pump curve at this pressure; trim with a needle valve.`,
    );
    notes.push("No receiver, dryer, or shop regulator. Print the distributor ring in the stator with short equal stubs.");
  } else {
    notes.push(`Demand is the hover air use (${demandNlpm.toFixed(1)} NL/min). Design flow is ×${FLOW_MARGIN} for leaks, regulator headroom, and a future drive jet.`);
    notes.push(`Electric power assumes isothermal compression at ${(OVERALL_ETA * 100).toFixed(0)}% overall efficiency (motor + compressor).`);
    if (aquariumWarning) {
      notes.push(aquariumWarning);
      notes.push("Shop compressors are usually rated higher than the electric estimate; pick the next common motor size.");
    }
    if (state.supplyBar === null) notes.push("No supply pressure holds this gap with the chosen holes, so the chain below is not sized.");
    else if (supplyGaugeBar < 1.5) notes.push("Below ~1.5 bar gauge the regulator needs a fine dial; cheap units hunt at low setpoints.");
    if (designNlpm > 200) notes.push("Above ~200 NL/min a small silent compressor is marginal. Prefer a tanked workshop unit with a dryer.");
  }
  if (setup.nOrifices >= 16) notes.push("With many holes, keep branch lengths matched so one sector does not starve.");

  return {
    demandNlpm,
    designNlpm,
    supplyGaugeBar,
    supplyAbsBar,
    isothermalPowerW,
    electricPowerW,
    recommendedKw,
    aquariumOk,
    aquariumWarning,
    sourceLabel,
    receiverL,
    mainTubeOdMm: main.odMm,
    mainTubeIdMm: main.idMm,
    branchTubeOdMm: Math.min(branch.odMm, main.odMm),
    branchTubeIdMm: Math.min(branch.idMm, main.idMm),
    shutoff: aquariumOk ? "not required" : designNlpm <= 120 ? "G1/4 ball valve" : "G3/8 ball valve",
    regulator: aquariumOk ? "not required" : regulatorSize(designNlpm, supplyGaugeBar),
    needleValve: aquariumOk ? "small fine-pitch needle valve (aquarium / lab)" : needleSize(designNlpm),
    filter: aquariumOk ? "not required" : "5 µm particulate filter, bowl drain",
    dryer: aquariumOk ? "not required" : designNlpm > 80 ? "refrigerated dryer or desiccant cartridge" : "water separator + desiccant cartridge",
    manifold: aquariumOk
      ? `Printed stator plenum, ${setup.nOrifices} short equal stubs`
      : `Ring distributor, ${setup.nOrifices} equal branches to the stator holes`,
    fittings: aquariumOk
      ? `Soft silicone / PU hose into a printed ring; no shop push-in manifold`
      : `${setup.nOrifices}× push-in tees or a printed ring with ${Math.min(branch.odMm, 6)} mm OD stubs`,
    notes,
  };
}

export function powerLabel(watts: number): string {
  if (watts >= 1000) return `${(watts / 1000).toFixed(2)} kW`;
  return `${Math.round(watts)} W`;
}
