import React, { useMemo } from "react";
import { landRadiiOf, type Setup } from "../physics";

type Props = { setup: Setup };

const W = 680;
const H = 300;
const PAD = 28;

type Pt = [number, number];

function poly(pts: Pt[]): string {
  return pts.map(([x, y]) => `${x},${y}`).join(" ");
}

/**
 * True-scale radial section (same px/mm on radius and axial).
 *
 * Topology (y down, ID→OD): flat lip → sloping pocket → flat lip.
 * Lateral margin = same-direction translation of the rotor breaks toward the OD.
 */
const BearingSectionDiagram: React.FC<Props> = ({ setup }) => {
  const drawing = useMemo(() => {
    const lands = landRadiiOf(setup);
    if (!lands) return { valid: false as const };

    const rInner = lands.rInner * 1e3;
    const rOuter = lands.rOuter * 1e3;
    const rSI = lands.rStatorLipIn * 1e3;
    const rSO = lands.rStatorLipOut * 1e3;
    const rRI = lands.rRotorLipIn * 1e3;
    const rRO = lands.rRotorLipOut * 1e3;
    const feed = lands.feed * 1e3;

    const angleRad = (setup.angleDeg * Math.PI) / 180;
    const hLip = Math.max(setup.gapUm, 0) * 1e-3; // mm
    const hPocket = Math.max(setup.pocketGapMm, hLip); // mm
    const rotorTh = Math.max(setup.thicknessMm, 0.1);
    const statorTh = Math.max(setup.statorMm, 0.1);
    const coneDrop = (rSO - rSI) * Math.tan(angleRad); // mm

    // Model coordinates in mm: x = radius, y increases downward (SVG sense).
    // Stator ID flat at y = 0; cone drops toward OD.
    const statorY = (r: number) => {
      if (r <= rSI) return 0;
      if (r >= rSO) return coneDrop;
      return ((r - rSI) / Math.max(rSO - rSI, 1e-9)) * coneDrop;
    };

    const yLipIn = -hLip;
    const yLipOut = coneDrop - hLip;
    const yOpenIn = statorY(rRI) - hPocket;
    const yOpenOut = statorY(rRO) - hPocket;
    const rotorSlope = (yOpenOut - yOpenIn) / Math.max(rRO - rRI, 1e-9);
    const yROpen = (r: number) => yOpenIn + (r - rRI) * rotorSlope;

    const rBottom: Pt[] = [
      [rInner, yLipIn],
      [rRI, yLipIn],
      [rRI, yOpenIn],
      [rRO, yOpenOut],
      [rRO, yLipOut],
      [rOuter, yLipOut],
    ];
    const sTop: Pt[] = [
      [rInner, statorY(rInner)],
      [rSI, statorY(rSI)],
      [rSO, statorY(rSO)],
      [rOuter, statorY(rOuter)],
    ];
    const rotorTop: Pt[] = [
      [rInner, yOpenIn - rotorTh],
      [rRI, yOpenIn - rotorTh],
      [rRO, yOpenOut - rotorTh],
      [rOuter, yOpenOut - rotorTh],
    ];
    const statorBot = sTop.map(([x, y]) => [x, y + statorTh] as Pt);

    const allY = [
      ...rotorTop.map((p) => p[1]),
      ...rBottom.map((p) => p[1]),
      ...sTop.map((p) => p[1]),
      ...statorBot.map((p) => p[1]),
    ];
    const yMin = Math.min(...allY);
    const yMax = Math.max(...allY);
    const xSpan = Math.max(rOuter - rInner, 1e-6);
    const ySpan = Math.max(yMax - yMin, 1e-6);
    const scale = Math.min((W - 2 * PAD) / xSpan, (H - 2 * PAD - 18) / ySpan);
    const drawnW = xSpan * scale;
    const drawnH = ySpan * scale;
    const x0 = (W - drawnW) / 2 - rInner * scale;
    const y0 = PAD + ((H - 2 * PAD - 18) - drawnH) / 2 - yMin * scale;

    const X = (r: number) => x0 + r * scale;
    const Y = (y: number) => y0 + y * scale;
    const mapPts = (pts: Pt[]): Pt[] => pts.map(([r, y]) => [X(r), Y(y)]);

    const xI = X(rInner);
    const xO = X(rOuter);
    const xF = X(feed);
    const xSI = X(rSI);
    const xSO = X(rSO);
    const xRI = X(rRI);
    const xRO = X(rRO);
    const yMarg = Y((statorY(rSO) + yROpen((rSO + rRO) / 2)) / 2);
    const yFeedS = Y(statorY(feed));
    const yFeedR = Y(yROpen(feed));
    const rotorTopM = mapPts(rotorTop);
    const rBottomM = mapPts(rBottom);
    const sTopM = mapPts(sTop);
    const statorBotM = mapPts(statorBot);

    return {
      valid: true as const,
      scale,
      rotorBody: poly([...rotorTopM, ...[...rBottomM].reverse()]),
      statorBody: poly([...sTopM, ...[...statorBotM].reverse()]),
      airBody: poly([...rBottomM, ...[...sTopM].reverse()]),
      xI,
      xO,
      xF,
      xSI,
      xSO,
      xRI,
      xRO,
      yMarg,
      yFeedS,
      yFeedR,
      yRotorLabel: rotorTopM[0]![1] + Math.max(10, rotorTh * scale * 0.35),
      yStatorLabel: statorBotM[0]![1] - Math.max(6, statorTh * scale * 0.35),
      lipStroke: Math.max(0.6, hLip * scale),
      labels: {
        lips: `stator lips ${setup.lipInnerMm.toFixed(1)} / ${setup.lipOuterMm.toFixed(1)} mm`,
        seal: `seal ${((lands.rSealIn - lands.rInner) * 1e3).toFixed(1)} / ${((lands.rOuter - lands.rSealOut) * 1e3).toFixed(1)} mm`,
        margin: `lateral margin ${setup.lateralMarginMm.toFixed(1)} mm`,
        gaps: `lip ${setup.gapUm.toFixed(0)} µm · pocket ${setup.pocketGapMm.toFixed(2)} mm · ${setup.angleDeg.toFixed(1)}°`,
        scale: `true scale (${scale.toFixed(1)} px/mm)`,
      },
    };
  }, [setup]);

  return (
    <div>
      <h2 className="h6 mb-2">Bearing section (flat lips + parallel conical pocket)</h2>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="True-scale rotor and stator section">
        <rect x={0} y={0} width={W} height={H} fill="#f7f5f0" rx={4} />
        {!drawing.valid ? (
          <text x={W / 2} y={H / 2} textAnchor="middle" fill="#8a4b2d" fontSize={13}>
            Outer lip must exceed the lateral margin, and the feed must sit in the pocket
          </text>
        ) : (
          <>
            <polygon points={drawing.statorBody} fill="#e8b4bc" stroke="#8a4b5c" strokeWidth={1.2} />
            <polygon points={drawing.airBody} fill="#8ec4d4" opacity={0.55} stroke="#1f6f8b" strokeWidth={drawing.lipStroke} />
            <polygon points={drawing.rotorBody} fill="#9aa3ad" stroke="#2f3640" strokeWidth={1.2} />

            <line
              x1={drawing.xF}
              y1={drawing.yFeedS}
              x2={drawing.xF}
              y2={drawing.yFeedR}
              stroke="#1f6f8b"
              strokeWidth={Math.max(1.2, drawing.lipStroke)}
              strokeDasharray="3 2"
            />
            <polygon
              points={`${drawing.xF},${drawing.yFeedR + 1} ${drawing.xF - 4},${drawing.yFeedR + 9} ${drawing.xF + 4},${drawing.yFeedR + 9}`}
              fill="#1f6f8b"
            />

            <line x1={drawing.xSO} y1={drawing.yMarg - 16} x2={drawing.xSO} y2={drawing.yMarg + 16} stroke="#c45c26" strokeWidth={1.4} />
            <line x1={drawing.xRO} y1={drawing.yMarg - 16} x2={drawing.xRO} y2={drawing.yMarg + 16} stroke="#c45c26" strokeWidth={1.4} />
            <line x1={drawing.xSO} y1={drawing.yMarg} x2={drawing.xRO} y2={drawing.yMarg} stroke="#c45c26" strokeWidth={1.4} />
            <text x={(drawing.xSO + drawing.xRO) / 2} y={drawing.yMarg - 5} textAnchor="middle" fontSize={11} fill="#c45c26" fontWeight={650}>
              lateral movement margin
            </text>

            <line
              x1={drawing.xSI}
              y1={drawing.yRotorLabel + 2}
              x2={drawing.xSI}
              y2={drawing.yStatorLabel - 2}
              stroke="#c45c26"
              strokeWidth={1}
              strokeDasharray="3 2"
            />
            <line
              x1={drawing.xRI}
              y1={drawing.yRotorLabel + 2}
              x2={drawing.xRI}
              y2={drawing.yStatorLabel - 2}
              stroke="#c45c26"
              strokeWidth={1}
              strokeDasharray="3 2"
            />

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
          {drawing.labels.scale}. {drawing.labels.lips}. {drawing.labels.seal}. {drawing.labels.margin}.{" "}
          {drawing.labels.gaps}. Margin is a same-direction shift toward the OD. Rotor lip faces drop toward the stator
          so the seal is tighter than the open pocket gap.
        </p>
      ) : (
        <p className="small text-secondary mb-0 mt-2">Invalid lip / margin / feed combination.</p>
      )}
    </div>
  );
};

export default BearingSectionDiagram;
