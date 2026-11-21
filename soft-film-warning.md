# Lip clearance warning

This project is a **hovering disc** with a **deep mid-band pocket** and **tight sealing lips**, not a loaded machine bearing with a continuous thin film. The Simulation tab warns when the chosen *lip* flying height is so small that printed seal rings will rub. The check lives in `src/physics.ts` (`HOVER_RUB_GAP_M` and the `evaluateAt` note). Change this file in the same commit as any change to that logic.

## Geometry the warning cares about

- **Lip gap** `gapUm`: clearance on the inner and outer sealing lands. This is what must stay open everywhere on those rings.
- **Pocket gap** `pocketGapMm`: recessed mid-band clearance at the design lip gap (typically 1–2 mm). Macroscopic warp in the pocket floor is tolerated because the recess is large.
- **Recess** = pocket gap − lip gap (fixed in the part). When the disc rises, both gaps increase together.

The deep pocket does **not** protect the lips. A proud seam or bump on a lip ring still rubs if it exceeds the lip gap.

## What still matters

Print warp, layer steps, and seams on resin lips are often **0.1–0.3 mm** before any lap, and still on the order of **50 µm** after a light lap of the seal rings. Below that, high spots on the lips touch, friction kills the float, and the pocket vents.

Warn when

\[
h_\mathrm{lip} < 50\,\mu\mathrm{m}
\]

(`HOVER_RUB_GAP_M`). Gaps from about 50 µm up through a few hundred micrometres on the lips stay quiet on purpose.

Mean-free-path, orifice-curtain (vs **pocket** height), lip-width, recess-depth, and hole-spacing warnings stay: they are about the model and feeding, not about loaded-bearing stiffness.
