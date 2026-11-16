import React from "react";
import { Alert } from "react-bootstrap";
import { powerLabel, type PneumaticSizing } from "../pneumatics";
import type { Setup } from "../physics";

type Props = {
  setup: Setup;
  orificeMm: number | null;
  sizing: PneumaticSizing;
};

type Node = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  lines: string[];
};

function Box(props: { node: Node; fill?: string }) {
  const { node, fill = "#fff" } = props;
  return (
    <g>
      <rect x={node.x} y={node.y} width={node.w} height={node.h} rx={8} fill={fill} stroke="#1f2933" strokeWidth={1.4} />
      <text x={node.x + node.w / 2} y={node.y + 18} textAnchor="middle" fontSize={12} fontWeight={700} fill="#1f2933">
        {node.title}
      </text>
      {node.lines.map((line, index) => (
        <text key={line} x={node.x + node.w / 2} y={node.y + 36 + index * 14} textAnchor="middle" fontSize={11} fill="#4d615b">
          {line}
        </text>
      ))}
    </g>
  );
}

function Pipe(props: { x1: number; y1: number; x2: number; y2: number; label?: string }) {
  const midX = (props.x1 + props.x2) / 2;
  const midY = (props.y1 + props.y2) / 2;
  return (
    <g>
      <line x1={props.x1} y1={props.y1} x2={props.x2} y2={props.y2} stroke="#1f6f8b" strokeWidth={3.2} strokeLinecap="round" />
      <polygon
        points={`${props.x2},${props.y2} ${props.x2 - 9},${props.y2 - 4.5} ${props.x2 - 9},${props.y2 + 4.5}`}
        fill="#1f6f8b"
      />
      {props.label ? (
        <text x={midX} y={midY - 8} textAnchor="middle" fontSize={10} fill="#1f6f8b">
          {props.label}
        </text>
      ) : null}
    </g>
  );
}

function mid(node: Node) {
  return { cx: node.x + node.w / 2, cy: node.y + node.h / 2, right: node.x + node.w, left: node.x, bottom: node.y + node.h, top: node.y };
}

function AquariumDiagram(props: { setup: Setup; orificeText: string; sizing: PneumaticSizing }) {
  const { setup, orificeText, sizing } = props;
  const nodes: Node[] = [
    {
      id: "pump",
      x: 40,
      y: 50,
      w: 170,
      h: 78,
      title: "Aquarium pump",
      lines: [`${sizing.demandNlpm.toFixed(1)} NL/min`, `${sizing.supplyGaugeBar.toFixed(2)} bar g`],
    },
    {
      id: "needle",
      x: 280,
      y: 50,
      w: 170,
      h: 78,
      title: "Needle valve",
      lines: ["fine flow trim", "open slowly"],
    },
    {
      id: "manifold",
      x: 520,
      y: 50,
      w: 200,
      h: 78,
      title: "Printed plenum",
      lines: [`${setup.nOrifices} equal stubs`, `Ø${sizing.mainTubeOdMm} mm hose`],
    },
    {
      id: "bearing",
      x: 790,
      y: 50,
      w: 130,
      h: 78,
      title: "Film",
      lines: [`${setup.nOrifices}× ${orificeText}`, `${sizing.demandNlpm.toFixed(1)} NL/min`],
    },
  ];
  const p = mid(nodes[0]!);
  const n = mid(nodes[1]!);
  const m = mid(nodes[2]!);
  const b = mid(nodes[3]!);
  return (
    <svg viewBox="0 0 940 160" role="img" aria-label="Aquarium pump air path">
      <text x={24} y={22} fontSize={13} fontWeight={700} fill="#1f2933">
        Air path — aquarium pump to film
      </text>
      <Pipe x1={p.right} y1={p.cy} x2={n.left} y2={n.cy} />
      <Pipe x1={n.right} y1={n.cy} x2={m.left} y2={m.cy} label="soft hose" />
      <Pipe x1={m.right} y1={m.cy} x2={b.left} y2={b.cy} label={`${setup.nOrifices} feeds`} />
      {nodes.map((node) => (
        <Box key={node.id} node={node} fill={node.id === "bearing" ? "#e8f2f5" : "#fff"} />
      ))}
    </svg>
  );
}

function ShopDiagram(props: { setup: Setup; orificeText: string; sizing: PneumaticSizing }) {
  const { setup, orificeText, sizing } = props;
  const nodes: Node[] = [
    {
      id: "compressor",
      x: 24,
      y: 36,
      w: 150,
      h: 78,
      title: "Compressor",
      lines: [`≥ ${sizing.recommendedKw} kW`, `${sizing.designNlpm.toFixed(0)} NL/min FAD`, `${sizing.supplyGaugeBar.toFixed(1)} bar g`],
    },
    {
      id: "tank",
      x: 214,
      y: 36,
      w: 120,
      h: 78,
      title: "Receiver",
      lines: [`~ ${sizing.receiverL} L`, "damps pulses"],
    },
    {
      id: "filter",
      x: 374,
      y: 36,
      w: 150,
      h: 78,
      title: "Filter + dryer",
      lines: [sizing.filter.split(",")[0] ?? "filter", sizing.dryer.includes("refrigerated") ? "refrigerated dryer" : "desiccant"],
    },
    {
      id: "regulator",
      x: 564,
      y: 36,
      w: 150,
      h: 78,
      title: "Regulator",
      lines: [`set ${sizing.supplyGaugeBar.toFixed(1)} bar g`, sizing.shutoff.replace(" ball valve", " shutoff")],
    },
    {
      id: "needle",
      x: 754,
      y: 36,
      w: 150,
      h: 78,
      title: "Needle valve",
      lines: [sizing.needleValve.replace(" precision needle valve", ""), "fine flow trim"],
    },
    {
      id: "manifold",
      x: 374,
      y: 168,
      w: 340,
      h: 86,
      title: "Distributor ring",
      lines: [
        `${setup.nOrifices} equal branches`,
        `main Ø${sizing.mainTubeOdMm}/${sizing.mainTubeIdMm} · branch Ø${sizing.branchTubeOdMm}/${sizing.branchTubeIdMm} mm`,
      ],
    },
    {
      id: "bearing",
      x: 754,
      y: 168,
      w: 150,
      h: 86,
      title: "Stator film",
      lines: [`${setup.nOrifices}× ${orificeText}`, `${sizing.demandNlpm.toFixed(1)} NL/min`],
    },
  ];
  const c = mid(nodes[0]!);
  const t = mid(nodes[1]!);
  const f = mid(nodes[2]!);
  const r = mid(nodes[3]!);
  const n = mid(nodes[4]!);
  const m = mid(nodes[5]!);
  const b = mid(nodes[6]!);
  return (
    <svg viewBox="0 0 940 290" role="img" aria-label="Shop compressor air path">
      <text x={24} y={22} fontSize={13} fontWeight={700} fill="#1f2933">
        Air path — compressor to film
      </text>
      <Pipe x1={c.right} y1={c.cy} x2={t.left} y2={t.cy} />
      <Pipe x1={t.right} y1={t.cy} x2={f.left} y2={f.cy} />
      <Pipe x1={f.right} y1={f.cy} x2={r.left} y2={r.cy} />
      <Pipe x1={r.right} y1={r.cy} x2={n.left} y2={n.cy} label={`${sizing.mainTubeOdMm} mm tube`} />
      <line x1={n.cx} y1={n.bottom} x2={n.cx} y2={m.top - 16} stroke="#1f6f8b" strokeWidth={3.2} strokeLinecap="round" />
      <line x1={n.cx} y1={m.top - 16} x2={m.cx} y2={m.top - 16} stroke="#1f6f8b" strokeWidth={3.2} strokeLinecap="round" />
      <line x1={m.cx} y1={m.top - 16} x2={m.cx} y2={m.top} stroke="#1f6f8b" strokeWidth={3.2} strokeLinecap="round" />
      <polygon points={`${m.cx},${m.top} ${m.cx - 4.5},${m.top - 9} ${m.cx + 4.5},${m.top - 9}`} fill="#1f6f8b" />
      <Pipe x1={m.right} y1={m.cy} x2={b.left} y2={b.cy} label={`${setup.nOrifices} feeds`} />
      {nodes.map((node) => (
        <Box key={node.id} node={node} fill={node.id === "bearing" ? "#e8f2f5" : "#fff"} />
      ))}
    </svg>
  );
}

const SetupDiagram: React.FC<Props> = ({ setup, orificeMm, sizing }) => {
  const orificeText = orificeMm === null ? "n/a" : `Ø${orificeMm.toFixed(2)} mm`;

  if (sizing.aquariumOk) {
    return (
      <div>
        <div className="setup-diagram border rounded bg-white p-3 mb-3">
          <AquariumDiagram setup={setup} orificeText={orificeText} sizing={sizing} />
        </div>
        <div className="row g-3 mb-3">
          <div className="col-md-4">
            <div className="border rounded p-3 h-100 bg-white">
              <div className="text-secondary small">Hover demand</div>
              <div className="fs-5 fw-semibold">{sizing.demandNlpm.toFixed(1)} NL/min</div>
            </div>
          </div>
          <div className="col-md-4">
            <div className="border rounded p-3 h-100 bg-white">
              <div className="text-secondary small">Supply pressure</div>
              <div className="fs-5 fw-semibold">{sizing.supplyGaugeBar.toFixed(2)} bar</div>
            </div>
          </div>
          <div className="col-md-4">
            <div className="border rounded p-3 h-100 bg-white">
              <div className="text-secondary small">Pump power</div>
              <div className="fs-5 fw-semibold">{powerLabel(sizing.electricPowerW)}</div>
              <div className="small text-secondary">{sizing.sourceLabel}</div>
            </div>
          </div>
        </div>
        <div className="border rounded p-3 bg-white mb-3">
          <h2 className="h6">What you need</h2>
          <ul className="mb-0 small">
            <li>
              <strong>Pump:</strong> aquarium / pond air pump that still delivers ~{sizing.demandNlpm.toFixed(0)} NL/min near {sizing.supplyGaugeBar.toFixed(2)} bar
            </li>
            <li>
              <strong>Trim:</strong> {sizing.needleValve}
            </li>
            <li>
              <strong>Hose:</strong> soft silicone or PU, about Ø{sizing.mainTubeOdMm} mm, into the stator
            </li>
            <li>
              <strong>Distributor:</strong> {sizing.manifold}
            </li>
            <li>
              <strong>Skip:</strong> receiver tank, dryer, particulate FRL, shop regulator, shutoff ball valve
            </li>
          </ul>
        </div>
        <div className="border rounded p-3 bg-white">
          <h2 className="h6">Notes</h2>
          <ul className="mb-0 small text-secondary">
            {sizing.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div>
      {sizing.aquariumWarning ? (
        <Alert variant="warning" className="mb-3">
          {sizing.aquariumWarning}
        </Alert>
      ) : null}
      <div className="setup-diagram border rounded bg-white p-3 mb-3">
        <ShopDiagram setup={setup} orificeText={orificeText} sizing={sizing} />
      </div>

      <div className="row g-3 mb-3">
        <div className="col-md-3">
          <div className="border rounded p-3 h-100 bg-white">
            <div className="text-secondary small">Hover demand</div>
            <div className="fs-5 fw-semibold">{sizing.demandNlpm.toFixed(1)} NL/min</div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="border rounded p-3 h-100 bg-white">
            <div className="text-secondary small">Design flow (×1.5)</div>
            <div className="fs-5 fw-semibold">{sizing.designNlpm.toFixed(1)} NL/min</div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="border rounded p-3 h-100 bg-white">
            <div className="text-secondary small">Compressor power</div>
            <div className="fs-5 fw-semibold">{powerLabel(sizing.electricPowerW)}</div>
            <div className="small text-secondary">{sizing.sourceLabel}</div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="border rounded p-3 h-100 bg-white">
            <div className="text-secondary small">Receiver</div>
            <div className="fs-5 fw-semibold">~ {sizing.receiverL} L</div>
          </div>
        </div>
      </div>

      <div className="row g-3">
        <div className="col-lg-6">
          <div className="border rounded p-3 bg-white h-100">
            <h2 className="h6">Valves and conditioning</h2>
            <ul className="mb-0 small">
              <li>
                <strong>Shutoff:</strong> {sizing.shutoff}, upstream of the regulator
              </li>
              <li>
                <strong>Regulator:</strong> {sizing.regulator}
              </li>
              <li>
                <strong>Needle:</strong> {sizing.needleValve} — open slowly after the disk is seated
              </li>
              <li>
                <strong>Filter:</strong> {sizing.filter}
              </li>
              <li>
                <strong>Dryer:</strong> {sizing.dryer}
              </li>
            </ul>
          </div>
        </div>
        <div className="col-lg-6">
          <div className="border rounded p-3 bg-white h-100">
            <h2 className="h6">Distributor and lines</h2>
            <ul className="mb-0 small">
              <li>
                <strong>Main line:</strong> {sizing.mainTubeOdMm} mm OD / {sizing.mainTubeIdMm} mm ID (≤ 12 m/s)
              </li>
              <li>
                <strong>Branches:</strong> {sizing.branchTubeOdMm} mm OD / {sizing.branchTubeIdMm} mm ID to each orifice
              </li>
              <li>
                <strong>Manifold:</strong> {sizing.manifold}
              </li>
              <li>
                <strong>Fittings:</strong> {sizing.fittings}
              </li>
              <li>
                Keep branch lengths matched; one long hose starves its sector and tips the disk
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="border rounded p-3 bg-white mt-3">
        <h2 className="h6">Sizing notes</h2>
        <ul className="mb-0 small text-secondary">
          {sizing.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
          <li>
            Theoretical isothermal shaft work at demand is {powerLabel(sizing.isothermalPowerW)}; the electric figure adds the ×1.5 flow margin and 55% overall efficiency.
          </li>
        </ul>
      </div>
    </div>
  );
};

export default SetupDiagram;
