# CAD geometry (JSCAD)

The Geometry tab builds the disk and stator with **[@jscad/modeling](https://openjscad.xyz/)**, a small CSG kernel that runs in the browser. Parts are defined as sketches and boolean operations in `assembly.ts`, then meshed for Three.js in `jscadToThree.ts`.

## Why JSCAD here

- Parametric “CAD language” (polygon → rotate-extrude, cylinders, subtract) without leaving TypeScript.
- Light enough for live updates in Vite (no OpenCascade WASM download).
- Natural place to add a printed plenum gallery, hose stub, or fillets for more complicated printables.
- STL export can be added later with `@jscad/stl-serializer`.

For STEP export, heavy fillets, or shell offsets, consider **replicad** (OpenCascade) as a second backend; keep the same `AssemblyParams` → solids idea.

## Coordinates

JSCAD solids are **Z-up**. The viewer converts to **Y-up** when building Three meshes.

## Disk: lean shell

The hovering disk is not a solid blank. It is:

- a continuous **conical floor** (flying face)
- a continuous **inner rim** around the centre hole
- an **open outer edge** (no outer rim wall — the washer retainer is the only ring stop)
- an **open top** and hollow interior
- **radial vertical ribs** from the inner rim out to the floor OD for stiffness

Every skin is **1 mm** (`DISK_SKIN_MM`). `setup.thicknessMm` sets the overall wall height above the flying face.

Washer pockets sit on the mid-land: radial ribs bound each bay sideways, and a **circumferential retainer** at the washer OD stops the stack sliding outward down the cone. Washer diameter is set above the Geometry viewer (default 2 cm).

**Rib count** is not the orifice count. With the washer seated on the circumferential retainer, its centre sits at \(r_c = r_\mathrm{out} - D/2\). Rib count is the largest `n` such that the clear chord between two skin-thick ribs at that radius still fits the washer plus **0.3 mm** fit clearance (`WASHER_FIT_CLEARANCE_MM`):

\[
n = \left\lfloor \pi \big/ \arcsin\big((D + \delta + t)/(2 r_c)\big) \right\rfloor
\]

(`washerBayCount` in `assembly.ts`). The retainer is also placed \(+\delta\) outward of the nominal washer OD. Orifice holes stay on their own feed circle.

The **stator** follows the same cone but overhangs the disk by **5 mm** radially on both the inner hole and the outer rim (`STATOR_OVERHANG_MM`).

The **distributor** is a hollow torus on the orifice feed circle: internal bore Ø **10 mm**, wall **1.5 mm**, seated under the stator (`DISTRIBUTOR_BORE_MM` / `DISTRIBUTOR_WALL_MM`).

## Edit the parts

Change `buildAssembly` / `buildLeanDisk` in `assembly.ts`. The hover gap passed in is the *drawn* gap (opened for visibility), not only the physical micrometre clearance.

The Simulation mass still uses a solid-annulus estimate from density × thickness; it does not yet integrate this lean volume.
