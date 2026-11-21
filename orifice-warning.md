# Orifice size warning (pocket + lips)

The Simulation tab warns when the sized hole is larger than the model can treat as a sharp orifice feeding a **deep pocket**. The check lives in `src/physics.ts` (`orificeWarnLimit` and the helpers around it). Change this note in the same commit as any change to that logic.

## Geometry

Orifices open into the recessed mid-band. Leak to atmosphere is through the inner and outer **lips** at the lip gap. The pocket pressure is nearly uniform when the recess is deep (\(h_\mathrm{pocket}^3 \gg h_\mathrm{lip}^3\)).

## Three limits, take the tightest

| Kind | Formula | Meaning |
| --- | --- | --- |
| Curtain | \(d = 2 h_\mathrm{pocket}\) (warn), crossover at \(d = 4 h_\mathrm{pocket}\) | Pocket entrance vs orifice throat |
| Stiffness | \(d\) that sets \(\beta = 0.8\) | Past the orifice–land stiffness peak |
| Land | \(0.2 \times \min(\text{pocket half-width},\;\text{pitch})\) | Hole still small next to the pocket path and spacing |

### Curtain (usually much looser than before)

Air leaves the throat \(\pi d^2/4\), then enters the **pocket** through a cylindrical curtain of height \(h_\mathrm{pocket}\) and area \(\pi d\, h_\mathrm{pocket}\). Equal areas at \(d = 4 h_\mathrm{pocket}\). Warn at \(d = 2 h_\mathrm{pocket}\).

At a 1.5 mm pocket that is **3 mm warn / 6 mm crossover** — not the old \(2\times\) lip-gap rule. The lip gap no longer sets the curtain limit unless the recess is shallow (see geometry notes when recess \(< 0.5\) mm).

### Stiffness

Match lip outflow at \(p_d = p_a + 0.8(p_s - p_a)\) to \(n\) orifice flows and solve for \(d\). Large holes make pocket ≈ supply; the lips alone set flow and axial stiffness falls.

### Land / pitch

Keep each exit a small source in the pocket: \(d < 0.2 \min(L_\mathrm{pocket}, s)\), with \(L_\mathrm{pocket}\) the radial path from the feed ring to the nearest lip edge.

## Hammer note

A deep recess stores volume. If the curtain warning fires on a large pocket, the banner mentions pneumatic hammer risk when the orifice is a soft restrictor into that volume.

## When the numbers are trustworthy

- Recess \(\gtrsim 0.5\) mm so the mid-band is a true pocket.
- Lip radial width \(\gtrsim 20\times h_\mathrm{lip}\) (viscous land, not an entrance slit).
- Feed ring between the lip edges.
- Sharp orifice, roughly constant \(C_d\).
