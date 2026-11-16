# FV-0

A conical disc that hovers on a thin film of air. The disc is an annulus with a shallow cone, sitting face-down on a stator. Air is fed through small orifices in the stator, leaks out at the hole and at the rim, and lifts the disc until its weight equals the film force. The aim is a disc that floats clear of the stator and stays level, at a gap a printed part can actually hold (typically a few tenths of a millimetre before lapping, and about 50–150 µm after a light lap). It is not a loaded machine bearing: stiffness at a few tens of micrometres is not the design target.

The small prototype is about 210 mm across, printed in resin (ELEGOO Saturn 4 12K) with the disc plane vertical so the full annulus fits on the bed. The explorer is a React app on the same stack as Divergy: React 18, TypeScript, Vite, Bootstrap, and Three.js.

```bash
npm install
npm start
```

The dev server listens on port 3000. Simulation and the 3D disk are both in the page. Cone angle, disk thickness, the 4 mm stator, and the hole diameters are true size. Only the drawn air gap is opened up so the parts stay separate.

Saved setups are written to `save/setups.json` by the dev server, so they stay with the repo instead of in the browser.

The Geometry tab builds the disk and stator with JSCAD (`src/cad/`), a small CSG CAD kernel, then shows the mesh in Three.js. See `src/cad/README.md`.
