# Hover clearance warning

This project is a **hovering disc**, not a loaded aerostatic bearing. The Simulation tab warns when the chosen flying height is so small that printed faces will rub. The check lives in `src/physics.ts` (`HOVER_RUB_GAP_M` and the `evaluateAt` note). Change this file in the same commit as any change to that logic.

## What was removed

A previous banner treated the film as too soft when a 10% weight step moved the gap by more than 5 µm. Under orifice sizing that is about \(h/30\), so it fired above ~150 µm and pointed at a 5–30 µm loaded-bearing gap.

That is the wrong success test here. A soft film at a few hundred micrometres is a normal hover: the disc may move when pushed, and it can still float clear and stay level. Stiffness, natural frequency, and “how much load it can carry” are not design limits.

## What still matters

The disc hovers only while every local gap stays open. Print warp, layer steps, and seams on a ~210 mm resin cone are often **0.1–0.3 mm** before any lap, and still on the order of **50 µm** after a light lap. Below that, high spots touch, friction kills the float, and the cone cannot sit on the film.

Warn when

\[
h < 50\,\mu\mathrm{m}
\]

(`HOVER_RUB_GAP_M`). The banner states the chosen gap and that threshold. Gaps from about 50 µm up through several hundred micrometres stay quiet on purpose, including a squishy 300 µm hover.

The 10 µm “printed face” note is folded into this check. Mean-free-path, orifice-curtain, and hole-spacing warnings stay: they are about the model, feeding, and keeping the disc level, not about bearing stiffness.
