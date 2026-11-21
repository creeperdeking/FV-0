/**
 * One distributor orifice cone for resin test-print.
 * Dimensions match the fused stator cone for the "Small prototype" save.
 *
 * Axis +Z toward the flying face; tip flush at z = H with Ø0.3 mm hole.
 * Wider open end at z = 0 (tube-junction end).
 */
import fs from "node:fs";
import path from "node:path";
import { booleans, primitives } from "@jscad/modeling";
import { serialize } from "@jscad/stl-serializer";
import {
  DISK_SKIN_MM,
  DISTRIBUTOR_BORE_MM,
  DISTRIBUTOR_WALL_MM,
  distributorConeLayoutAtHeight,
  distributorTipHeightMm,
  segmentsForRadiusMm,
} from "../src/cad/assembly";

const setup = JSON.parse(fs.readFileSync(path.resolve("save/setups.json"), "utf8"))["Small prototype"] as {
  orificeMm: number;
  angleDeg: number;
};

const orificeMm = setup.orificeMm;
const boreR = DISTRIBUTOR_BORE_MM / 2;
const tubeOuterR = boreR + DISTRIBUTOR_WALL_MM;
const holeR = Math.max(orificeMm / 2, 0.05);
const wall = Math.max(DISK_SKIN_MM, DISTRIBUTOR_WALL_MM);
const outerTipR = holeR + wall;
const tipHeight = distributorTipHeightMm();
const layout = distributorConeLayoutAtHeight(tubeOuterR, outerTipR, tipHeight);
const tanHalf = Math.tan(layout.halfAngle);

function coneRadiusAt(rAtRef: number, zRef: number, z: number): number {
  return rAtRef + (zRef - z) * tanHalf;
}

// Same extents as buildFusedStator, tip trimmed flush at the face (zRef).
const coneLen = layout.coneHeight + Math.min(0.25, DISTRIBUTOR_WALL_MM * 0.2);
const zRef = 0;
const zConeBot = zRef - coneLen;
const rConeBot = coneRadiusAt(outerTipR, zRef, zConeBot);

// Print orientation: base (wide) on bed at z=0, tip up at z=H.
const H = coneLen;
const rOuterBase = rConeBot;
const rOuterTip = outerTipR;
const rAirBase = coneRadiusAt(holeR, zRef, zConeBot);
const rAirTip = holeR;

const segments = Math.max(64, segmentsForRadiusMm(rOuterBase, 0.01));

const outer = primitives.cylinderElliptic({
  height: H,
  startRadius: [rOuterBase, rOuterBase],
  endRadius: [rOuterTip, rOuterTip],
  segments,
  center: [0, 0, H / 2],
});
// Exact tip Ø at z=H / base airway at z=0. Tiny over-travel keeps the hole open.
const airOver = 0.05;
const L = H + 2 * airOver;
const dr = rAirTip - rAirBase;
const rAirStart = rAirBase - (airOver / H) * dr; // radius at z = -airOver
const rAirEnd = rAirTip + (airOver / H) * dr; // radius at z = H+airOver
const airway = primitives.cylinderElliptic({
  height: L,
  startRadius: [Math.max(rAirStart, 0.05), Math.max(rAirStart, 0.05)],
  endRadius: [Math.max(rAirEnd, 0.05), Math.max(rAirEnd, 0.05)],
  segments,
  center: [0, 0, H / 2],
});
const part = booleans.subtract(outer, airway);

const raw = serialize({ binary: false }, part);
const text = (Array.isArray(raw) ? raw : [raw]).join("");
const outName = `fv0-orifice-cone-small-prototype-${orificeMm}mm.stl`;
const out = path.resolve("save", outName);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, text);

const halfDeg = (layout.halfAngle * 180) / Math.PI;
console.log(
  [
    `wrote ${out}`,
    `orifice tip Ø ${orificeMm} mm (ID), outer tip Ø ${(2 * rOuterTip).toFixed(3)} mm`,
    `half-angle ${halfDeg.toFixed(2)}°, height ${H.toFixed(3)} mm`,
    `base OD ${(2 * rOuterBase).toFixed(3)} mm, segments ${segments}`,
  ].join("\n"),
);
