# FV-0

A conical disc that hovers on air. The disc is an annulus with a shallow cone, sitting face-down on a stator. The flying face is a **deep mid-band pocket** (about 1–2 mm) with **tight sealing lips** at the inner hole and outer rim; orifices feed the pocket, and air leaks only through the lips. Lift equals weight when pocket pressure on the recessed area balances the disc. The lips need a clearance a printed seal can hold after a light lap (about 50–150 µm); the pocket tolerates larger face error. It is not a loaded machine bearing at tens of micrometres over the full face.

The small prototype is about 210 mm across, printed in resin (ELEGOO Saturn 4 12K) with the disc plane vertical so the full annulus fits on the bed. The explorer is a React app on the same stack as Divergy: React 18, TypeScript, Vite, Bootstrap, and Three.js.

```bash
npm install
npm start
```

The dev server listens on port 3000. Simulation and the 3D disk are both in the page. Cone angle, disk thickness, the 4 mm stator, and the hole diameters are true size. Only the drawn air gap is opened up so the parts stay separate.

Saved setups are written to `save/setups.json` by the dev server, so they stay with the repo instead of in the browser.

The Geometry tab builds the disk and stator with JSCAD (`src/cad/`), a small CSG CAD kernel, then shows the mesh in Three.js. See `src/cad/README.md`.
