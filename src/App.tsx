import React, { useMemo, useState } from "react";
import { Alert, Button, Col, Container, Form, Row, Tab, Tabs } from "react-bootstrap";
import { Navigate, Route, Routes } from "react-router-dom";
import AssemblyView from "./components/AssemblyView";
import LineChart from "./components/LineChart";
import {
  GRAPHITE_DISK,
  SMALL_DISK,
  angleForOneRev,
  equilibriumGapM,
  evaluateBearing,
  gapSweep,
  massLabel,
  pressureCurve,
  type Setup,
} from "./physics";

const BUILT_IN = [SMALL_DISK, GRAPHITE_DISK];
const BUILT_IN_NAMES = ["Small prototype", "Isotropic graphite 8 m"];

function storedSetups(): Record<string, Setup> {
  try {
    const raw = localStorage.getItem("fv0-setups");
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Setup>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function Slider(props: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  digits: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  return (
    <Form.Group className="mb-3">
      <Form.Label className="d-flex justify-content-between mb-1">
        <span>{props.label}</span>
        <span className="text-secondary">
          {props.value.toFixed(props.digits)} {props.unit}
        </span>
      </Form.Label>
      <Form.Range
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value))}
      />
    </Form.Group>
  );
}

function Metric(props: { label: string; value: string }) {
  return (
    <div className="border rounded p-3 h-100 bg-white">
      <div className="text-secondary small">{props.label}</div>
      <div className="fs-5 fw-semibold">{props.value}</div>
    </div>
  );
}

function force(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 100) return `${value.toFixed(0)} N`;
  return `${value.toFixed(2)} N`;
}

const Explorer: React.FC = () => {
  const [setup, setSetup] = useState<Setup>(SMALL_DISK);
  const [saved, setSaved] = useState<Record<string, Setup>>(storedSetups);
  const [name, setName] = useState("");
  const [choice, setChoice] = useState(BUILT_IN_NAMES[0]);

  const patch = (partial: Partial<Setup>) => {
    setSetup((current) => {
      const next = { ...current, ...partial };
      if (next.innerMm > next.outerMm - 5) next.innerMm = next.outerMm - 5;
      return next;
    });
  };

  const result = useMemo(() => {
    const state = evaluateBearing(setup);
    const hover = equilibriumGapM(setup);
    const sweep = gapSweep(setup);
    const pressure = pressureCurve(setup);
    const tilt = hover === null ? 0 : angleForOneRev(setup, Math.min(hover, 399e-6));
    return { state, hover, sweep, pressure, tilt };
  }, [setup]);

  const names = [...BUILT_IN_NAMES, ...Object.keys(saved).sort()];
  const drawnGap = Math.max(setup.gapUm * 1e-3, 0.04 * setup.outerMm);

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed || BUILT_IN_NAMES.includes(trimmed)) return;
    const next = { ...saved, [trimmed]: setup };
    localStorage.setItem("fv0-setups", JSON.stringify(next));
    setSaved(next);
    setChoice(trimmed);
  };

  const load = (selected: string) => {
    setChoice(selected);
    const builtIn = BUILT_IN_NAMES.indexOf(selected);
    if (builtIn >= 0) {
      const preset = BUILT_IN[builtIn];
      if (preset) setSetup(preset);
      return;
    }
    const preset = saved[selected];
    if (preset) setSetup(preset);
  };

  const remove = () => {
    if (BUILT_IN_NAMES.includes(choice)) return;
    const next = { ...saved };
    delete next[choice];
    localStorage.setItem("fv0-setups", JSON.stringify(next));
    setSaved(next);
    setChoice(BUILT_IN_NAMES[0]);
  };

  const { state, hover, sweep, pressure, tilt } = result;
  const hoverLabel = hover === null ? "will not float" : hover >= 399e-6 ? "> 400 µm" : `${Math.round(hover * 1e6)} µm`;

  return (
    <Container fluid className="py-3 px-3 px-lg-4">
      <h1 className="h3 mb-1">FV-0 conical air bearing</h1>
      <p className="text-secondary mb-3">
        Orifice-fed film under a horizontal cone. Lift, stiffness, and air use update as you move the controls.
      </p>
      <Row className="g-4">
        <Col lg={4} xl={3}>
          <div className="border rounded p-3 bg-white">
            <h2 className="h6">Saved setups</h2>
            <Form.Select className="mb-2" value={choice} onChange={(event) => load(event.target.value)} aria-label="Saved setup">
              {names.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Form.Select>
            <div className="d-flex gap-2 mb-3">
              <Form.Control value={name} placeholder="Setup name" onChange={(event) => setName(event.target.value)} aria-label="Setup name" />
              <Button variant="dark" onClick={save}>
                Save
              </Button>
              <Button variant="outline-secondary" onClick={remove} disabled={BUILT_IN_NAMES.includes(choice ?? "")}>
                Delete
              </Button>
            </div>
            <h2 className="h6">Disk</h2>
            <Slider label="Outer diameter" min={80} max={10000} step={1} value={setup.outerMm} digits={0} unit="mm" onChange={(outerMm) => patch({ outerMm })} />
            <Slider label="Hole diameter" min={20} max={9000} step={1} value={setup.innerMm} digits={0} unit="mm" onChange={(innerMm) => patch({ innerMm })} />
            <Slider label="Cone angle" min={0.5} max={20} step={0.5} value={setup.angleDeg} digits={1} unit="°" onChange={(angleDeg) => patch({ angleDeg })} />
            <Slider label="Disk thickness" min={2} max={25} step={0.5} value={setup.thicknessMm} digits={1} unit="mm" onChange={(thicknessMm) => patch({ thicknessMm })} />
            <Slider label="Density" min={900} max={2700} step={10} value={setup.density} digits={0} unit="kg/m³" onChange={(density) => patch({ density })} />
            <h2 className="h6">Air injection</h2>
            <Slider label="Supply pressure" min={0.2} max={6} step={0.1} value={setup.supplyBar} digits={1} unit="bar gauge" onChange={(supplyBar) => patch({ supplyBar })} />
            <Slider label="Number of holes" min={3} max={48} step={1} value={setup.nOrifices} digits={0} unit="" onChange={(nOrifices) => patch({ nOrifices })} />
            <Slider label="Hole diameter" min={0.15} max={1.5} step={0.05} value={setup.orificeMm} digits={2} unit="mm" onChange={(orificeMm) => patch({ orificeMm })} />
            <Slider label="Feed ring position" min={0.05} max={0.95} step={0.01} value={setup.feedFrac} digits={2} unit="" onChange={(feedFrac) => patch({ feedFrac })} />
            <Slider label="Discharge coefficient" min={0.4} max={0.9} step={0.05} value={setup.cd} digits={2} unit="" onChange={(cd) => patch({ cd })} />
            <h2 className="h6">Operating point</h2>
            <Slider label="Film gap" min={10} max={250} step={1} value={setup.gapUm} digits={0} unit="µm" onChange={(gapUm) => patch({ gapUm })} />
            <Slider label="Rotation" min={0} max={30000} step={10} value={setup.rpm} digits={0} unit="rpm" onChange={(rpm) => patch({ rpm })} />
            <Slider label="Nozzle tilt" min={0} max={30} step={0.1} value={setup.nozzleAngle} digits={1} unit="°" onChange={(nozzleAngle) => patch({ nozzleAngle })} />
            <Slider label="Momentum to the disk" min={0.2} max={1} step={0.05} value={setup.eta} digits={2} unit="" onChange={(eta) => patch({ eta })} />
          </div>
        </Col>
        <Col lg={8} xl={9}>
          <Tabs defaultActiveKey="simulation" className="mb-3">
            <Tab eventKey="simulation" title="Simulation">
              <Row className="g-3 mb-3">
                <Col md={3}><Metric label="Disk weight" value={force(state.weightN)} /></Col>
                <Col md={3}><Metric label="Axial lift" value={force(state.liftAxialN)} /></Col>
                <Col md={3}><Metric label="Float margin" value={force(state.floatMarginN)} /></Col>
                <Col md={3}><Metric label="Equilibrium gap" value={hoverLabel} /></Col>
                <Col md={3}><Metric label="Axial stiffness" value={`${(state.stiffnessAxial * 1e-6).toFixed(2)} N/µm`} /></Col>
                <Col md={3}><Metric label="Radial stiffness" value={`${(state.radialStiffness * 1e-6).toFixed(3)} N/µm`} /></Col>
                <Col md={3}><Metric label="Air use" value={`${state.volumeFlowNlpm.toFixed(1)} NL/min`} /></Col>
                <Col md={3}><Metric label="Pocket gauge" value={`${((state.pocketPressurePa - 101325) / 1e5).toFixed(2)} bar`} /></Col>
              </Row>
              <Row className="g-4">
                <Col xl={6}>
                  <div className="border rounded p-3 bg-white">
                    <LineChart
                      title="Lift versus gap"
                      x={sweep.gapUm}
                      xLabel="Gap (µm)"
                      series={[
                        { name: "Lift (N)", color: "#1f6f8b", values: sweep.liftN },
                        { name: "Disk weight (N)", color: "#c47b2b", values: sweep.gapUm.map(() => state.weightN) },
                      ]}
                    />
                  </div>
                </Col>
                <Col xl={6}>
                  <div className="border rounded p-3 bg-white">
                    <LineChart
                      title="Stiffness and air use"
                      x={sweep.gapUm}
                      xLabel="Gap (µm)"
                      series={[
                        { name: "Stiffness (N/µm)", color: "#1f6f8b", values: sweep.stiffnessPerUm },
                        { name: "Air use (NL/min)", color: "#6b8f71", values: sweep.flowNlpm },
                      ]}
                    />
                  </div>
                </Col>
              </Row>
              <div className="border rounded p-3 bg-white mt-4">
                <LineChart
                  title="Pressure along the radius"
                  x={pressure.radiusMm}
                  xLabel="Radius (mm)"
                  series={[{ name: "Gauge pressure (bar)", color: "#1f6f8b", values: pressure.gaugeBar }]}
                />
                <p className="small text-secondary mb-0">Feed ring at {(state.feedRadiusM * 1e3).toFixed(1)} mm. Pressure peaks at the holes and falls to atmosphere at both edges.</p>
              </div>
              <Row className="g-4 mt-1">
                <Col md={6}>
                  <div className="border rounded p-3 bg-white h-100">
                    <h2 className="h6">Rotation</h2>
                    <ul className="mb-0">
                      <li>Tip speed: {state.tipSpeedMs.toFixed(2)} m/s</li>
                      <li>Viscous torque: {(state.viscousTorqueNm * 1e3).toFixed(3)} mN·m</li>
                      <li>Jet speed: {state.jetSpeedMs.toFixed(0)} m/s</li>
                      <li>Tilt for 1 rev/s at the hover gap: {tilt.toFixed(2)}°</li>
                      <li>Free speed at the current tilt: {state.freeSpinRpm.toFixed(0)} rpm</li>
                    </ul>
                  </div>
                </Col>
                <Col md={6}>
                  <div className="border rounded p-3 bg-white h-100">
                    <h2 className="h6">Geometry</h2>
                    <ul className="mb-0">
                      <li>Cone rise, hole to rim: {(state.coneRiseM * 1e3).toFixed(2)} mm</li>
                      <li>Projected area: {(state.areaM2 * 1e4).toFixed(1)} cm²</li>
                      <li>Disk mass: {massLabel(state.massKg)}</li>
                      <li>Knudsen number: {state.knudsen.toFixed(4)}</li>
                    </ul>
                  </div>
                </Col>
              </Row>
              {state.notes.map((note) => (
                <Alert key={note} variant="warning" className="mt-3 mb-0">
                  {note}
                </Alert>
              ))}
            </Tab>
            <Tab eventKey="geometry" title="Geometry" mountOnEnter unmountOnExit>
              <div className="border rounded bg-white p-2">
                <AssemblyView setup={setup} />
              </div>
              <p className="small text-secondary mt-2 mb-0">
                Cone angle and thicknesses are true: the disk is {setup.thicknessMm.toFixed(1)} mm and the stator is a 4 mm plate.
                The cone is high at the hole and falls {(state.coneRiseM * 1e3).toFixed(1)} mm toward the rim. Each hole is its real {setup.orificeMm.toFixed(2)} mm diameter.
                The air gap is drawn {(drawnGap / (setup.gapUm * 1e-3)).toFixed(0)}× its real {setup.gapUm.toFixed(0)} µm so the two parts stay separate. Drag to orbit.
              </p>
            </Tab>
          </Tabs>
        </Col>
      </Row>
    </Container>
  );
};

const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<Explorer />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
