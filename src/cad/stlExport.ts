import { serialize } from "@jscad/stl-serializer";
import type { Geom3 } from "@jscad/modeling/src/geometries/types";
import type { Setup } from "../physics";
import {
  buildDiskForExport,
  buildStatorForExport,
  exportFaceSegmentsForSetup,
  previewSegmentsForSetup,
  STL_FORM_ERROR_MM,
} from "./assembly";

export type StlPart = "disk" | "stator";

function downloadBlob(filename: string, data: BlobPart, mime: string): void {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function solidToBinaryStl(solid: Geom3): Uint8Array {
  // Binary mode returns [80-byte header, 4-byte count, triangle payload] — join them.
  const chunks = serialize({ binary: true }, solid) as ArrayBuffer[];
  if (!chunks.length) throw new Error("STL serializer returned no data");
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(new Uint8Array(chunk), offset);
    offset += chunk.byteLength;
  }
  if (total < 84) throw new Error(`STL output too small (${total} bytes)`);
  const triangles = new DataView(out.buffer, out.byteOffset, out.byteLength).getUint32(80, true);
  const expected = 84 + triangles * 50;
  if (total !== expected) {
    throw new Error(`STL size mismatch: got ${total} bytes, expected ${expected} for ${triangles} triangles`);
  }
  if (triangles < 1) throw new Error("STL has zero triangles — solid may be empty");
  return out;
}

export type ExportProgress = {
  phase: "building" | "serializing" | "done";
  faceSegments: number;
  bodySegments: number;
};

/** Rebuild one part and download STL. Contact faces use ≤5 µm segments; the rest stay at preview res. */
export async function exportPartStl(
  part: StlPart,
  args: { setup: Setup; orificeMm: number; washerMm: number },
  onProgress?: (progress: ExportProgress) => void,
): Promise<{ faceSegments: number; bodySegments: number; formErrorUm: number }> {
  const faceSegments = exportFaceSegmentsForSetup(args.setup);
  const bodySegments = previewSegmentsForSetup(args.setup);
  const formErrorUm = STL_FORM_ERROR_MM * 1e3;
  onProgress?.({ phase: "building", faceSegments, bodySegments });
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  const solid =
    part === "disk"
      ? await buildDiskForExport({
          setup: args.setup,
          orificeMm: args.orificeMm,
          washerMm: args.washerMm,
          faceSegments,
          bodySegments,
        })
      : await buildStatorForExport({
          setup: args.setup,
          orificeMm: args.orificeMm,
          washerMm: args.washerMm,
          faceSegments,
          bodySegments,
        });

  onProgress?.({ phase: "serializing", faceSegments, bodySegments });
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  const buffer = solidToBinaryStl(solid);
  const name = part === "disk" ? "fv0-disk" : "fv0-stator-distributor";
  downloadBlob(`${name}-face${faceSegments}seg.stl`, buffer, "application/sla");
  onProgress?.({ phase: "done", faceSegments, bodySegments });
  return { faceSegments, bodySegments, formErrorUm };
}
