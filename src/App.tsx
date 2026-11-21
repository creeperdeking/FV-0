import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Col, Container, Form, Row, Tab, Tabs } from "react-bootstrap";
import { Navigate, Route, Routes } from "react-router-dom";
import AssemblyView from "./components/AssemblyView";
import BearingSectionDiagram from "./components/BearingSectionDiagram";
import LineChart from "./components/LineChart";
import SetupDiagram from "./components/SetupDiagram";
import {
  distributorConeAngleDeg,
  distributorInletLenMm,
  landDiametersMm,
  STATOR_ABOVE_TORUS_MM,
  STATOR_OVERHANG_MM,
  STATOR_SKIN_MM,
  STATOR_TORUS_INDENT_MM,
  STATOR_WALL_DEPTH_MM,
  statorRibCount,
  washerBayCount,
} from "./cad/assembly";
import {
  GRAPHITE_DISK,
  SMALL_DISK,
  evaluateBearing,
  gapSweep,
  hoverGapUmForOrifice,
  massLabel,
  pressureCurve,
  solveOrificeMm,
  type Setup,
} from "./physics";
import { sizePneumatics } from "./pneumatics";

const BUILT_IN = [SMALL_DISK, GRAPHITE_DISK];
const BUILT_IN_NAMES = ["Small prototype", "Isotropic graphite 8 m"];
const TAB_KEYS = ["simulation", "geometry", "setup"] as const;
type TabKey = (typeof TAB_KEYS)[number];
const TAB_STORAGE_KEY = "fv0-active-tab";

function readStoredTab(): TabKey {
  try {
    const raw = localStorage.getItem(TAB_STORAGE_KEY);
    if (raw && (TAB_KEYS as readonly string[]).includes(raw)) return raw as TabKey;
  } catch {
    /* ignore */
  }
  return "simulation";
}

function normalizeSetup(raw: Record<string, unknown>): Setup {
  const {
    rpm: _rpm,
    nozzleAngle: _nozzleAngle,
    eta: _eta,
    orificeMm,
    gapUm,
    supplyBar,
    pocketGapMm: pocketRaw,
    lipInnerMm: lipInRaw,
    lipOuterMm: lipOutRaw,
    lateralMarginMm: marginRaw,
    ...rest
  } = raw as Partial<Setup> & {
    orificeMm?: number;
    gapUm?: number;
    supplyBar?: number;
    pocketGapMm?: number;
    lipInnerMm?: number;
    lipOuterMm?: number;
    lateralMarginMm?: number;
    rpm?: number;
    nozzleAngle?: number;
    eta?: number;
  };
  const washerRaw = (rest as { washerMm?: unknown }).washerMm;
  const washerMm =
    typeof washerRaw === "number" && Number.isFinite(washerRaw) && washerRaw > 0 ? washerRaw : SMALL_DISK.washerMm;
  const pocketGapMm =
    typeof pocketRaw === "number" && Number.isFinite(pocketRaw) && pocketRaw > 0 ? pocketRaw : SMALL_DISK.pocketGapMm;
  const lipInnerMm =
    typeof lipInRaw === "number" && Number.isFinite(lipInRaw) && lipInRaw > 0 ? lipInRaw : SMALL_DISK.lipInnerMm;
  const lipOuterMm =
    typeof lipOutRaw === "number" && Number.isFinite(lipOutRaw) && lipOutRaw > 0 ? lipOutRaw : SMALL_DISK.lipOuterMm;
  const lateralMarginMm =
    typeof marginRaw === "number" && Number.isFinite(marginRaw) && marginRaw >= 0
      ? marginRaw
      : SMALL_DISK.lateralMarginMm;
  const base = {
    ...SMALL_DISK,
    ...rest,
    statorMm: 1,
    washerMm,
    pocketGapMm,
    lipInnerMm,
    lipOuterMm,
    lateralMarginMm,
  };
  const hasGap = typeof gapUm === "number" && gapUm > 0;
  const hasOrifice = typeof orificeMm === "number" && orificeMm > 0;
  const hasSupply = typeof supplyBar === "number" && supplyBar > 0;
  if (hasGap && hasOrifice) return { ...base, gapUm, orificeMm };
  if (hasGap && hasSupply) {
    const solved = solveOrificeMm({ ...base, gapUm, supplyBar });
    return { ...base, gapUm, orificeMm: solved ?? base.orificeMm };
  }
  if (hasOrifice && hasSupply) {
    const migrated = hoverGapUmForOrifice({ ...base, orificeMm, supplyBar });
    return { ...base, orificeMm, gapUm: migrated ?? base.gapUm };
  }
  if (hasOrifice) return { ...base, orificeMm, gapUm: hasGap ? gapUm : base.gapUm };
  return { ...base, gapUm: hasGap ? gapUm : base.gapUm };
}

function storedSetups(): Record<string, Setup> {
  try {
    const raw = localStorage.getItem("fv0-setups");
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [key, normalizeSetup((value ?? {}) as Record<string, unknown>)]),
    );
  } catch {
    return {};
  }
}

function normalizeSaved(raw: unknown): Record<string, Setup> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).map(([key, value]) => [
      key,
      normalizeSetup((value ?? {}) as Record<string, unknown>),
    ]),
  );
}

async function fetchSetups(): Promise<Record<string, Setup>> {
  const response = await fetch("/api/setups");
  if (!response.ok) throw new Error("Could not read save/setups.json");
  return normalizeSaved(await response.json());
}

async function persistSetups(setups: Record<string, Setup>): Promise<void> {
  const response = await fetch("/api/setups", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(setups),
  });
  if (!response.ok) throw new Error("Could not write save/setups.json");
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
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const startEdit = () => {
    setText(props.value.toFixed(props.digits));
    setEditing(true);
  };

  const commit = () => {
    if (cancelRef.current) {
      cancelRef.current = false;
      setEditing(false);
      return;
    }
    const parsed = Number(text.replace(",", ".").trim());
    setEditing(false);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(props.max, Math.max(props.min, parsed));
    props.onChange(clamped);
  };

  return (
    <Form.Group className="control-slider">
      <Form.Label className="d-flex justify-content-between">
        <span>{props.label}</span>
        <span className="text-secondary slider-value-wrap">
          {editing ? (
            <Form.Control
              ref={inputRef}
              className="slider-value-input"
              value={text}
              aria-label={`${props.label} value`}
              inputMode="decimal"
              onChange={(event) => setText(event.target.value)}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") {
                  cancelRef.current = true;
                  event.currentTarget.blur();
                }
              }}
            />
          ) : (
            <span className="slider-value" title="Double-click to type a value" onDoubleClick={startEdit}>
              {props.value.toFixed(props.digits)}
            </span>
          )}
          {props.unit ? <span>{props.unit}</span> : null}
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

function CmField(props: {
  label: string;
  valueMm: number;
  minCm: number;
  maxCm: number;
  onChangeMm: (mm: number) => void;
}) {
  const [text, setText] = useState(() => formatCm(props.valueMm));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(formatCm(props.valueMm));
  }, [props.valueMm, focused]);

  const commit = (raw: string) => {
    const cm = Number(raw.replace(",", "."));
    if (!Number.isFinite(cm)) {
      setText(formatCm(props.valueMm));
      return;
    }
    const clamped = Math.min(props.maxCm, Math.max(props.minCm, cm));
    props.onChangeMm(clamped * 10);
    setText(formatCm(clamped * 10));
  };

  return (
    <Form.Group className="control-slider control-cm">
      <Form.Label className="d-flex justify-content-between">
        <span>{props.label}</span>
        <span className="text-secondary">cm</span>
      </Form.Label>
      <Form.Control
        type="text"
        inputMode="decimal"
        value={text}
        aria-label={`${props.label} in centimetres`}
        onFocus={() => setFocused(true)}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          setFocused(false);
          commit(text);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
      />
    </Form.Group>
  );
}

function formatCm(mm: number): string {
  const cm = mm / 10;
  return Number.isInteger(cm) ? String(cm) : cm.toFixed(2).replace(/\.?0+$/, "");
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

function pocketGauge(pressurePa: number): string {
  const gaugePa = pressurePa - 101325;
  if (Math.abs(gaugePa) < 1000) return `${Math.round(gaugePa)} Pa`;
  return `${(gaugePa / 1e5).toFixed(2)} bar`;
}

function supplyGauge(bar: number | null): string {
  if (bar === null || !Number.isFinite(bar)) return "impossible";
  const pa = bar * 1e5;
  if (Math.abs(pa) < 1000) return `${Math.round(pa)} Pa`;
  if (bar < 1) return `${bar.toFixed(3)} bar`;
  return `${bar.toFixed(2)} bar`;
}

const Explorer: React.FC = () => {
  const [saved, setSaved] = useState<Record<string, Setup>>({});
  const [setup, setSetup] = useState<Setup>(SMALL_DISK);
  const [name, setName] = useState("");
  const [choice, setChoice] = useState(BUILT_IN_NAMES[0] ?? "");
  const [saveError, setSaveError] = useState("");
  const [tab, setTab] = useState<TabKey>(readStoredTab);
  const [catalogReady, setCatalogReady] = useState(false);
  const [cadToken, setCadToken] = useState(0);
  const untouched = useRef(true);

  useEffect(() => {
    try {
      localStorage.setItem(TAB_STORAGE_KEY, tab);
    } catch {
      /* ignore */
    }
  }, [tab]);

  useEffect(() => {
    let cancel = false;
    const loadFile = async () => {
      try {
        let setups = await fetchSetups();
        if (Object.keys(setups).length === 0) {
          const legacy = storedSetups();
          if (Object.keys(legacy).length > 0) {
            await persistSetups(legacy);
            localStorage.removeItem("fv0-setups");
            setups = legacy;
          }
        }
        if (cancel) return;
        setSaved(setups);
        const initialName = BUILT_IN_NAMES[0] ?? "";
        const initial = setups[initialName];
        if (untouched.current && initial) setSetup(initial);
        setSaveError("");
      } catch (error) {
        if (!cancel) setSaveError(error instanceof Error ? error.message : "Could not read saves");
      } finally {
        if (!cancel) setCatalogReady(true);
      }
    };
    void loadFile();
    return () => {
      cancel = true;
    };
  }, []);

  const patch = (partial: Partial<Setup>) => {
    untouched.current = false;
    setSetup((current) => {
      const next = { ...current, ...partial };
      if (next.innerMm > next.outerMm - 5) next.innerMm = next.outerMm - 5;
      // Pocket clearance must stay above the lip gap (positive recess).
      const lipMm = Math.max(next.gapUm, 1) * 1e-3;
      if (next.pocketGapMm < lipMm + 0.2) next.pocketGapMm = lipMm + 0.2;
      const radialMm = (next.outerMm - next.innerMm) / 2;
      const maxLip = Math.max(1, radialMm * 0.4);
      next.lipInnerMm = Math.min(next.lipInnerMm, maxLip);
      next.lipOuterMm = Math.min(next.lipOuterMm, maxLip);
      const pocketSpanMm = (next.outerMm - next.innerMm) / 2 - next.lipInnerMm - next.lipOuterMm;
      const maxMargin = Math.max(0, pocketSpanMm / 2 - 1);
      next.lateralMarginMm = Math.max(0, Math.min(next.lateralMarginMm, maxMargin));
      return next;
    });
  };

  const result = useMemo(() => {
    const state = evaluateBearing(setup);
    const gapM = Math.max(setup.gapUm, 1) * 1e-6;
    const supplyBar = state.supplyBar ?? 0;
    const sweep = gapSweep(setup, supplyBar);
    const pressure = pressureCurve(setup, supplyBar, gapM);
    const peakBar = Math.max(0, ...pressure.gaugeBar);
    const pressureAsPa = peakBar < 0.01;
    return {
      state,
      sweep,
      pressure: {
        radiusMm: pressure.radiusMm,
        values: pressureAsPa ? pressure.gaugeBar.map((bar) => bar * 1e5) : pressure.gaugeBar,
        yUnit: pressureAsPa ? "Pa" : "bar",
        seriesName: pressureAsPa ? "Gauge pressure (Pa)" : "Gauge pressure (bar)",
      },
      gapM,
    };
  }, [setup]);

  const names = [...BUILT_IN_NAMES, ...Object.keys(saved).filter((item) => !BUILT_IN_NAMES.includes(item)).sort()];
  const gapUm = setup.gapUm;
  const drawnGap = Math.max(gapUm * 1e-3, 0.04 * setup.outerMm);

  const save = () => {
    const target = name.trim() || choice;
    if (!target) return;
    const next = { ...saved, [target]: setup };
    void persistSetups(next)
      .then(() => {
        setSaved(next);
        setChoice(target);
        setName("");
        setSaveError("");
      })
      .catch((error: unknown) => {
        setSaveError(error instanceof Error ? error.message : "Could not write saves");
      });
  };

  const load = (selected: string) => {
    untouched.current = false;
    setChoice(selected);
    const stored = saved[selected];
    if (stored) {
      setSetup(stored);
      setCadToken((token) => token + 1);
      return;
    }
    const builtIn = BUILT_IN_NAMES.indexOf(selected);
    if (builtIn >= 0) {
      const preset = BUILT_IN[builtIn];
      if (preset) {
        setSetup(preset);
        setCadToken((token) => token + 1);
      }
    }
  };

  const remove = () => {
    if (BUILT_IN_NAMES.includes(choice)) return;
    const next = { ...saved };
    delete next[choice];
    void persistSetups(next)
      .then(() => {
        setSaved(next);
        setChoice(BUILT_IN_NAMES[0]);
        setSaveError("");
      })
      .catch((error: unknown) => {
        setSaveError(error instanceof Error ? error.message : "Could not write saves");
      });
  };

  const { state, sweep, pressure } = result;
  const pneumatics = useMemo(() => sizePneumatics(setup, state), [setup, state]);

  return (
    <Container fluid className="py-3 px-3 px-lg-4">
      <h1 className="h3 mb-1">FV-0 conical disk air suspension</h1>
      <p className="text-secondary mb-3">
        Set the hover gap and the orifice diameter. The model finds the supply pressure that lifts the disk at that clearance.
      </p>
      <Row className="g-4">
        <Col lg={4} xl={3}>
          <div className="border rounded p-3 bg-white controls">
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
            {saveError ? (
              <Alert variant="warning" className="py-2 small">
                {saveError}
              </Alert>
            ) : null}
            <h2 className="h6 control-heading">Disk</h2>
            <CmField label="Outer diameter" valueMm={setup.outerMm} minCm={8} maxCm={1000} onChangeMm={(outerMm) => patch({ outerMm })} />
            <CmField label="Hole diameter" valueMm={setup.innerMm} minCm={2} maxCm={900} onChangeMm={(innerMm) => patch({ innerMm })} />
            <Slider label="Cone angle" min={0.5} max={20} step={0.5} value={setup.angleDeg} digits={1} unit="°" onChange={(angleDeg) => patch({ angleDeg })} />
            <Slider label="Disk thickness" min={2} max={25} step={0.5} value={setup.thicknessMm} digits={2} unit="mm" onChange={(thicknessMm) => patch({ thicknessMm })} />
            <Slider label="Density" min={900} max={2700} step={10} value={setup.density} digits={0} unit="kg/m³" onChange={(density) => patch({ density })} />
            <h2 className="h6 control-heading">Air injection</h2>
            <Slider label="Lip gap" min={10} max={400} step={10} value={setup.gapUm} digits={0} unit="µm" onChange={(gapUm) => patch({ gapUm })} />
            <Slider label="Pocket gap" min={0.5} max={3} step={0.05} value={setup.pocketGapMm} digits={2} unit="mm" onChange={(pocketGapMm) => patch({ pocketGapMm })} />
            <Slider label="Inner lip width" min={1} max={40} step={0.5} value={setup.lipInnerMm} digits={1} unit="mm" onChange={(lipInnerMm) => patch({ lipInnerMm })} />
            <Slider label="Outer lip width" min={1} max={40} step={0.5} value={setup.lipOuterMm} digits={1} unit="mm" onChange={(lipOuterMm) => patch({ lipOuterMm })} />
            <Slider label="Lateral margin" min={0} max={15} step={0.1} value={setup.lateralMarginMm} digits={1} unit="mm" onChange={(lateralMarginMm) => patch({ lateralMarginMm })} />
            <Slider label="Orifice diameter" min={0.05} max={8} step={0.01} value={setup.orificeMm} digits={3} unit="mm" onChange={(orificeMm) => patch({ orificeMm })} />
            <Slider label="Number of holes" min={3} max={48} step={1} value={setup.nOrifices} digits={0} unit="" onChange={(nOrifices) => patch({ nOrifices })} />
            <Slider label="Feed ring position" min={0.05} max={0.95} step={0.01} value={setup.feedFrac} digits={2} unit="" onChange={(feedFrac) => patch({ feedFrac })} />
            <Slider label="Discharge coefficient" min={0.4} max={0.9} step={0.05} value={setup.cd} digits={2} unit="" onChange={(cd) => patch({ cd })} />
          </div>
        </Col>
        <Col lg={8} xl={9}>
          <Tabs
            activeKey={tab}
            onSelect={(key) => {
              if (key && (TAB_KEYS as readonly string[]).includes(key)) setTab(key as TabKey);
            }}
            className="mb-3"
          >
            <Tab eventKey="simulation" title="Simulation">
              {state.notes.map((note) => (
                <Alert key={note} variant="warning" className="mb-3">
                  {note}
                </Alert>
              ))}
              <Row className="g-3 mb-3">
                <Col md={3}><Metric label="Disk weight" value={force(state.weightN)} /></Col>
                <Col md={3}><Metric label="Axial lift" value={force(state.liftAxialN)} /></Col>
                <Col md={3}><Metric label="Supply pressure" value={supplyGauge(state.supplyBar)} /></Col>
                <Col md={3}><Metric label="Axial stiffness" value={`${(state.stiffnessAxial * 1e-6).toFixed(2)} N/µm`} /></Col>
                <Col md={3}><Metric label="Radial stiffness" value={`${(state.radialStiffness * 1e-6).toFixed(3)} N/µm`} /></Col>
                <Col md={3}><Metric label="Air use" value={`${state.volumeFlowNlpm.toFixed(1)} NL/min`} /></Col>
                <Col md={3}><Metric label="Pocket gauge" value={pocketGauge(state.pocketPressurePa)} /></Col>
                <Col md={3}><Metric label="Lip / pocket gap" value={`${(state.gapM * 1e6).toFixed(0)} µm / ${(state.pocketGapM * 1e3).toFixed(2)} mm`} /></Col>
              </Row>
              <Row className="g-4">
                <Col xl={6}>
                  <div className="border rounded p-3 bg-white">
                    <LineChart
                      title="Lift versus lip gap"
                      x={sweep.gapUm}
                      xLabel="Lip gap"
                      xUnit="µm"
                      yUnit="N"
                      yLog
                      series={[
                        { name: "Lift (N)", color: "#1f6f8b", values: sweep.liftN },
                        { name: "Disk weight (N)", color: "#c47b2b", values: sweep.gapUm.map(() => state.weightN) },
                      ]}
                    />
                  </div>
                </Col>
                <Col xl={6}>
                  <div className="border rounded p-3 bg-white h-100">
                    <BearingSectionDiagram setup={setup} />
                  </div>
                </Col>
              </Row>
              <div className="border rounded p-3 bg-white mt-4">
                <LineChart
                  title="Pressure along the radius"
                  x={pressure.radiusMm}
                  xLabel="Radius"
                  xUnit="mm"
                  yUnit={pressure.yUnit}
                  formatY={
                    pressure.yUnit === "Pa"
                      ? (value) => `${Math.round(value)}`
                      : (value) => (Math.abs(value) < 0.01 ? value.toFixed(4) : value.toFixed(3))
                  }
                  series={[{ name: pressure.seriesName, color: "#1f6f8b", values: pressure.values }]}
                />
                <p className="small text-secondary mb-0">Feed ring at {(state.feedRadiusM * 1e3).toFixed(1)} mm. Pocket pressure is nearly flat between the lips, then falls to atmosphere across each sealing land.</p>
              </div>
              <div className="border rounded p-3 bg-white mt-4">
                <h2 className="h6">Geometry</h2>
                <ul className="mb-0">
                  <li>Cone rise, hole to rim: {(state.coneRiseM * 1e3).toFixed(2)} mm</li>
                  <li>Projected area: {(state.areaM2 * 1e4).toFixed(1)} cm²</li>
                  <li>Disk mass: {massLabel(state.massKg)}</li>
                  <li>Knudsen number: {state.knudsen.toFixed(4)}</li>
                </ul>
              </div>
            </Tab>
            <Tab eventKey="geometry" title="Geometry" mountOnEnter>
              <div className="mb-2 d-flex flex-wrap align-items-center gap-3">
                <Form.Group className="d-flex align-items-center gap-2" style={{ maxWidth: 280 }}>
                  <Form.Label className="mb-0 small text-nowrap">Washer diameter</Form.Label>
                  <Form.Control
                    type="number"
                    min={0.5}
                    max={50}
                    step={0.1}
                    value={Number((setup.washerMm / 10).toFixed(2))}
                    aria-label="Washer diameter in centimetres"
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (Number.isFinite(value)) patch({ washerMm: Math.min(500, Math.max(5, value * 10)) });
                    }}
                  />
                  <span className="small text-secondary">cm</span>
                </Form.Group>
                <span className="small text-secondary">
                  {washerBayCount(setup, setup.washerMm)} radial walls (washer bays)
                </span>
              </div>
              <div className="border rounded bg-white p-2">
                {catalogReady ? (
                  <AssemblyView
                    key={cadToken}
                    setup={setup}
                    gapUm={gapUm}
                    orificeMm={setup.orificeMm}
                    washerMm={setup.washerMm}
                  />
                ) : (
                  <p className="small text-secondary mb-0 p-3">Loading saved setup…</p>
                )}
              </div>
              <p className="small text-secondary mt-2 mb-0">
                Lean disk with 1 mm skins, outer rim wall inset 1 cm from the OD, open inner hole (no inner rim), {washerBayCount(setup, setup.washerMm)} radial walls sized so {(setup.washerMm / 10).toFixed(1)} cm washers fit between two ribs and the retainer ring.
                Cone angle and wall height are true: the disk walls rise {setup.thicknessMm.toFixed(2)} mm above the local cone. The stator and distributor are one fused print: a {STATOR_SKIN_MM.toFixed(0)} mm plate with {STATOR_WALL_DEPTH_MM.toFixed(0)} mm underside ribs ({statorRibCount(setup.nOrifices)}, midway between every two orifices) that merge into the hollow torus ({STATOR_ABOVE_TORUS_MM.toFixed(0)} mm below the plate, {STATOR_TORUS_INDENT_MM.toFixed(0)} mm rib indent). Continuous orifice cones at {distributorConeAngleDeg(setup.orificeMm).toFixed(1)}° open flush on the flying face; {(distributorInletLenMm(setup) / 10).toFixed(1)} cm −Y inlet ends flush with the stator rim.
                Stator overhang {STATOR_OVERHANG_MM.toFixed(1)} mm each edge: disk Ø{landDiametersMm(setup).diskOuterMm.toFixed(1)} / hole Ø{landDiametersMm(setup).diskInnerMm.toFixed(1)} mm → stator Ø{landDiametersMm(setup).statorOuterMm.toFixed(1)} / hole Ø{landDiametersMm(setup).statorInnerMm.toFixed(1)} mm.
                The cone is low at the hole and rises {(state.coneRiseM * 1e3).toFixed(1)} mm toward the rim. Each hole is {setup.orificeMm.toFixed(3)} mm diameter, on the midpoint circle under the disk.
                Simulation uses flat lips with a conical pocket ({setup.pocketGapMm.toFixed(2)} mm) and a {setup.lateralMarginMm.toFixed(1)} mm lateral margin as a same-direction shift of the rotor breaks toward the ID (seal {(state.sealInnerM * 1e3).toFixed(1)} / {(state.sealOuterM * 1e3).toFixed(1)} mm at {gapUm.toFixed(0)} µm). The CAD preview still draws a continuous face; only the lip gap is exaggerated ({(drawnGap / (gapUm * 1e-3)).toFixed(0)}×) so the parts stay separate. Drag to orbit.
              </p>
            </Tab>
            <Tab eventKey="setup" title="Setup">
              <SetupDiagram setup={setup} orificeMm={setup.orificeMm} sizing={pneumatics} />
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
