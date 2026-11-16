import fs from "node:fs";
import path from "node:path";
import { booleans, primitives, transforms } from "@jscad/modeling";
import { serialize } from "@jscad/stl-serializer";

/**
 * Vertical 2×2 mm square plate, 2 mm thick, on a 2×4×1 mm base
 * that sticks out front and back as feet,
 * with a 0.3 mm diameter horizontal hole through the plate center.
 */
const baseH = 1;
const plateW = 2;
const plateT = 2;
const plateH = 2;
const plateZ = baseH + plateH / 2;
const plate = primitives.cuboid({ size: [plateW, plateT, plateH], center: [0, 0, plateZ] });
// 4 mm deep vs 2 mm plate → 1 mm foot front and back.
const base = primitives.cuboid({ size: [plateW, 4, baseH], center: [0, 0, baseH / 2] });
const body = booleans.union(base, plate);
const hole = transforms.translate(
  [0, 0, plateZ],
  transforms.rotate([Math.PI / 2, 0, 0], primitives.cylinder({ height: 4, radius: 0.15, segments: 64 })),
);
const part = booleans.subtract(body, hole);

const raw = serialize({ binary: false }, part);
const text = (Array.isArray(raw) ? raw : [raw]).join("");
const out = path.resolve("save/square-plate-0p3hole.stl");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, text);
console.log(`wrote ${out} (${text.length} chars)`);
