# Hole-spacing warning

The Simulation tab warns when the feed holes are too far apart around the ring. The check lives in `src/physics.ts` (`holeSpacingNotes`). Change this file in the same commit as any change to that logic.

## Why the model cannot see this

Lift, stiffness, and air use are computed as if the feed were a **continuous ring** at the feed radius. Circumferential pressure variation between holes is averaged out. Sparse holes still look fine in those metrics while the real disk sees high-pressure spots under each drill and soft sectors between them. That is what tips the disk into the guide pin. So spacing needs its own geometric check.

## Length scales

- Land (shorter radial leak path): \(L = \min(r_f - r_i,\; r_o - r_f)\)
- Pitch (arc between neighbouring holes): \(s = 2\pi r_f / n\)

Pressure spreads radially over a distance of order \(L\). Neighbouring feeds merge into a smooth ring when \(s\) comes down to about \(L\). The hole count that does that is

\[
n_\mathrm{even} \approx \frac{2\pi r_f}{L}.
\]

On the small prototype mid-radius land that is about **22 holes**. Twelve holes (\(s \approx 1.8\,L\)) are the usual first static build; about twenty-four are for even pressure before spin. See `prototype-nozzles.md`.

## Warning tiers

| Condition | Level | Meaning |
| --- | --- | --- |
| \(s > 2L\) | Warn | Spacing much larger than the land; soft sectors between jets; rocking likely |
| \(L < s \le 2L\) | Note | Zones do not fully meet; acceptable for a first hover, tighten before relying on even pressure |
| \(s \le L\) | Quiet | High-pressure zones meet |

Constants in code: `HOLE_PITCH_WARN_LAND = 2`, `HOLE_PITCH_NOTE_LAND = 1`.

Equivalently, warn when \(n < \pi r_f / L = n_\mathrm{even}/2\), and note when \(n < n_\mathrm{even}\).

## What this is not

It is not a lift or flow limit. Six large holes can match the lift of twelve small ones; they still leave soft arcs. The orifice-size “land” cap (\(d < 0.2\min(L,s)\)) only keeps each hole small next to the land; it does not require enough holes.
