# Orifice size warning

The Simulation tab warns when the sized hole is larger than the model can treat as a sharp orifice. The check lives in `src/physics.ts` (`orificeWarnLimit` and the helpers around it). Change this note in the same commit as any change to that logic.

## Why not a fixed 1 mm

A hard millimetre cutoff does not follow from the physics. At a fixed gap, opening the hole raises the pocket gauge ratio

\[
\beta = \frac{p_d - p_a}{p_s - p_a}.
\]

Axial stiffness on this cone peaks near \(\beta \approx 0.62\) and is already down the far side by \(\beta \approx 0.8\). The hole that reaches \(\beta = 0.8\) scales with \(h^{3/2}/\sqrt{n}\). At a soft 250 µm gap that diameter is many millimetres, so a 1 mm rule fires too early or too late depending on the gap.

## Three limits, take the tightest

The warning diameter is the minimum of:

| Kind | Formula | Meaning |
| --- | --- | --- |
| Curtain | \(d = 2h\) (warn), crossover at \(d = 4h\) | Inlet film entrance vs orifice cross section |
| Stiffness | \(d\) that sets \(\beta = 0.8\) | Past the stiffness peak if the throat is still the restrictor |
| Land | \(0.2 \times \min(\text{land}, \text{pitch})\) | Hole still small next to the land and the hole spacing |

On the small prototype the curtain limit is almost always the binding one. The stiffness and land figures stay as guards for odd geometries.

## Curtain limit (the usual binder)

Air leaves the orifice through the throat cross section \(\pi d^2/4\), then enters the film through a cylindrical curtain of height \(h\) and area \(\pi d h\). Those areas are equal at

\[
d = 4h.
\]

Above that, the film entrance is the tighter passage. Drilling larger barely changes the flow, and the throat orifice formula in the model no longer describes the feed.

Treat the two areas as passages in series of the same kind. The effective area relative to the throat alone is

\[
\frac{A_\text{eff}}{A_\text{throat}} = \frac{1}{1 + d/(4h)}.
\]

| \(d/h\) | \(A_\text{eff}/A_\text{throat}\) | Role |
| --- | --- | --- |
| 2 | ≈ 0.89 | Warning threshold (~10% high if the throat formula is used alone) |
| 4 | 0.75 | Crossover (~30% high) |

So the **hard physics crossover** is \(d = 4h\). The **warning** is at half of that, \(d = 2h\), to leave margin before the assumption fails. At a 250 µm gap that is 0.50 mm warn / 1.0 mm crossover.

The banner states both numbers in orifice language, e.g. that the orifice cross section matches the inlet curtain at the 4× gap diameter, and warns above the 2× gap diameter.

## Stiffness limit

Assuming the throat is still the restrictor, match film outflow at \(p_d = p_a + 0.8(p_s - p_a)\) to \(n\) orifice mass flows and solve for \(d\). That is the closed form in `orificeMmAtPocketRatio`. It is valid only while \(d\) stays under the curtain limit; past the curtain the real pocket ratio cannot climb the way the throat formula predicts.

## Land / pitch limit

The pressure field is built as a continuous feed ring. When the hole diameter is a large fraction of the land width or of the circumferential pitch, the exits are local soft spots, not small sources on a ring. Cap at one-fifth of the shorter of those two lengths.

## Recess / hammer note

If the curtain warning fires and the gap is under 40 µm, the banner also mentions pneumatic hammer. A counterbore or pocket under the hole restores a large stored volume at a small gap and can chatter even when the orifice diameter itself looks modest. A clean through-hole with no recess is the intended case.

## When the numbers are trustworthy

- Gap much smaller than the land (tens of micrometres on a centimetre-scale land). Below ~10 µm slip flow matters; above a few tenths of a millimetre entrance inertia matters.
- Sharp orifice, roughly constant \(C_d\), no recess.
- Hole still small next to land and pitch (the land limit).
- Ordinary shop supply; single feed ring.

## Examples on the small prototype (12 holes, 2 bar gauge)

| Gap | Curtain warn (\(2h\)) | Curtain crossover (\(4h\)) | Stiffness (\(β=0.8\)) | Typical sized hole |
| --- | --- | --- | --- | --- |
| 30 µm | 0.06 mm | 0.12 mm | ~0.76 mm | ~0.05 mm (light disk) |
| 80 µm | 0.16 mm | 0.32 mm | ~3.3 mm | ~0.07 mm |
| 250 µm | 0.50 mm | 1.0 mm | ~18 mm | ~0.38 mm |

The 250 µm light-disk case sits under the warn line. A heavier disk or fewer holes at the same gap can push the sized hole past 0.50 mm and raise the curtain banner while the stiffness limit is still far away.
