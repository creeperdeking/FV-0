import React, { useMemo } from "react";
import { landRadiiOf, type Setup } from "../physics";

type Props = { setup: Setup };

const W = 680;
const H = 300;
const PAD_L = 28;
const PAD_R = 14;
const PAD_T = 14;
const PAD_B = 38;

type Pt = [number, number];

function poly(pts: Pt[]): string {
  return pts.map(([x, y]) => `${x},${y}`).join(" ");
}

/**
 * Hand-sketch topology (y down, ID→OD):
 *   flat lip → sloping pocket → flat lip
 *
 * Lateral margin = same-direction translation of the rotor breaks toward the OD:
 *   ID: rRI = rSI + margin → flat rotor over conical stator (upper into cone)
 *   OD: rRO = rSO + margin → conical rotor over flat stator (lower lip reaches outward)
 *
 * Continuous underside + constant thickness → flush rotor top.
 */
const BearingSectionDiagram: React.FC<Props> = ({ setup }) => {
  const drawing = useMemo(() => {
    const lands = landRadiiOf(setup);
    if (!lands) return { valid: false as const };

    const rInner = lands.rInner * 1e3;
    const rOuter = lands.rOuter * 1e3;
    const rSI = lands.rStatorLipIn * 1e3;
    const rSO = lands.rStatorLipOut * 1e3;
    const rRI = lands.rRotorLipIn * 1e3; // = rSI + margin
    const rRO = lands.rRotorLipOut * 1e3; // = rSO + margin
    const feed = lands.feed * 1e3;

    const gap = 11;
    const rotorTh = 26;
    const statorTh = 34;
    const coneDrop = 52;

    const xOf = (r: number) => PAD_L + ((r - rInner) / Math.max(rOuter - rInner, 1e-6)) * (W - PAD_L - PAD_R);

    const y0 = PAD_T + rotorTh + gap + 6;
    const y1 = y0 + coneDrop;

    const statorY = (r: number) => {
      if (r <= rSI) return y0;
      if (r >= rSO) return y1;
      return y0 + ((r - rSI) / (rSO - rSI)) * (y1 - y0);
    };

    // Rotor flats at seal-plane height; cone between the translated breaks.
    const yRInner = y0 - gap;
    const yROuter = y1 - gap;
    const rotorSlope = (yROuter - yRInner) / Math.max(rRO - rRI, 1e-6);
    const yRSlope = (r: number) => yRInner + (r - rRI) * rotorSlope;

    const rPts: Pt[] = [
      [xOf(rInner), yRInner],
      [xOf(rRI), yRInner],
      [xOf(rRO), yROuter],
      [xOf(rOuter), yROuter],
    ];

    const sPts: Pt[] = [
      [xOf(rInner), statorY(rInner)],
      [xOf(rSI), statorY(rSI)],
      [xOf(rSO), statorY(rSO)],
      [xOf(rOuter), statorY(rOuter)],
    ];

    const rotorTop = rPts.map(([x, y]) => [x, y - rotorTh] as Pt);
    const statorBot = sPts.map(([x, y]) => [x, y + statorTh] as Pt);

    const xI = xOf(rInner);
    const xO = xOf(rOuter);
    const xF = xOf(feed);
    const xSI = xOf(rSI);
    const xSO = xOf(rSO);
    const xRI = xOf(rRI);
    const xRO = xOf(rRO);

    // OD margin callout: stator flat start → rotor flat start.
    const yMarg = (statorY(rSO) + yRSlope((rSO + rRO) / 2)) / 2;

    return {
      valid: true as const,
      rotorBody: poly([...rotorTop, ...[...rPts].reverse()]),
      statorBody: poly([...sPts, ...[...statorBot].reverse()]),
      airBody: poly([...rPts, ...[...sPts].reverse()]),
      xI,
      xO,
      xF,
      xSI,
      xSO,
      xRI,
      xRO,
      yMarg,
      yFeedS: statorY(feed),
      yFeedR: yRSlope(feed),
      yRotorLabel: rotorTop[0]![1] + 11,
      yStatorLabel: statorBot[0]![1] - 8,
      labels: {
        lips: `stator lips ${setup.lipInnerMm.toFixed(1)} / ${setup.lipOuterMm.toFixed(1)} mm`,
        seal: `seal ${((lands.rSealIn - lands.rInner) * 1e3).toFixed(1)} / ${((lands.rOuter - lands.rSealOut) * 1e3).toFixed(1)} mm`,
        margin: `lateral margin ${setup.lateralMarginMm.toFixed(1)} mm`,
        gaps: `lip ${setup.gapUm.toFixed(0)} µm · pocket ${setup.pocketGapMm.toFixed(2)} mm · ${setup.angleDeg.toFixed(1)}°`,
      },
    };
  }, [setup]);

  return (
    <div>
      <h2 className="h6 mb-2">Bearing section (flat lips + parallel conical pocket)</h2>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Rotor and stator section matching the hand sketch">
        <rect x={0} y={0} width={W} height={H} fill="#f7f5f0" rx={4} />
        {!drawing.valid ? (
          <text x={W / 2} y={H / 2} textAnchor="middle" fill="#8a4b2d" fontSize={13}>
            Inner lip must exceed the lateral margin, and the feed must sit in the pocket
          </text>
        ) : (
          <>
            <polygon points={drawing.statorBody} fill="#e8b4bc" stroke="#8a4b5c" strokeWidth={1.4} />
            <polygon points={drawing.airBody} fill="#8ec4d4" opacity={0.55} />
            <polygon points={drawing.rotorBody} fill="#9aa3ad" stroke="#2f3640" strokeWidth={1.4} />

            <line x1={drawing.xF} y1={drawing.yFeedS} x2={drawing.xF} y2={drawing.yFeedR} stroke="#1f6f8b" strokeWidth={2} strokeDasharray="3 2" />
            <polygon
              points={`${drawing.xF},${drawing.yFeedR + 1} ${drawing.xF - 4},${drawing.yFeedR + 9} ${drawing.xF + 4},${drawing.yFeedR + 9}`}
              fill="#1f6f8b"
            />

            {/* OD margin: rotor flat (left) → stator flat (right) */}
            <line x1={drawing.xRO} y1={drawing.yMarg - 16} x2={drawing.xRO} y2={drawing.yMarg + 16} stroke="#c45c26" strokeWidth={1.4} />
            <line x1={drawing.xSO} y1={drawing.yMarg - 16} x2={drawing.xSO} y2={drawing.yMarg + 16} stroke="#c45c26" strokeWidth={1.4} />
            <line x1={drawing.xRO} y1={drawing.yMarg} x2={drawing.xSO} y2={drawing.yMarg} stroke="#c45c26" strokeWidth={1.4} />
            <text x={(drawing.xRO + drawing.xSO) / 2} y={drawing.yMarg - 5} textAnchor="middle" fontSize={11} fill="#c45c26" fontWeight={650}>
              lateral movement margin
            </text>

            {/* ID breaks: rotor (left of stator) — same translation direction */}
            <line x1={drawing.xRI} y1={drawing.yRotorLabel + 2} x2={drawing.xRI} y2={drawing.yStatorLabel - 2} stroke="#c45c26" strokeWidth={1} strokeDasharray="3 2" />
            <line x1={drawing.xSI} y1={drawing.yRotorLabel + 2} x2={drawing.xSI} y2={drawing.yStatorLabel - 2} stroke="#c45c26" strokeWidth={1} strokeDasharray="3 2" />

            <line x1={drawing.xI} y1={H - 16} x2={drawing.xO} y2={H - 16} stroke="#6b7280" strokeWidth={1} />
            {(
              [
                [drawing.xI, "ID"],
                [drawing.xF, "feed"],
                [drawing.xO, "OD"],
              ] as const
            ).map(([x, label]) => (
              <g key={label}>
                <line x1={x} y1={H - 20} x2={x} y2={H - 12} stroke="#6b7280" strokeWidth={1} />
                <text x={x} y={H - 3} textAnchor="middle" fontSize={10} fill="#4b5563">
                  {label}
                </text>
              </g>
            ))}

            <text x={drawing.xI + 6} y={drawing.yRotorLabel} fontSize={12} fill="#1f2933">
              rotor
            </text>
            <text x={drawing.xI + 6} y={drawing.yStatorLabel} fontSize={12} fill="#6b3038">
              stator
            </text>
            <text x={(drawing.xRO + drawing.xO) / 2} y={drawing.yRotorLabel} textAnchor="middle" fontSize={10} fill="#1f6f8b">
              flat lip
            </text>
            <text x={(drawing.xRI + drawing.xRO) / 2} y={drawing.yRotorLabel} textAnchor="middle" fontSize={10} fill="#1f6f8b">
              conical pocket
            </text>
          </>
        )}
      </svg>
      {drawing.valid ? (
        <p className="small text-secondary mb-0 mt-2">
          {drawing.labels.lips}. {drawing.labels.seal}. {drawing.labels.margin}. {drawing.labels.gaps}. Margin is a
          same-direction shift: OD flat into the cone, ID stator flat reaching inward past the rotor break.
        </p>
      ) : (
        <p className="small text-secondary mb-0 mt-2">Invalid lip / margin / feed combination.</p>
      )}
    </div>
  );
};

export default BearingSectionDiagram;
