# Hole-spacing warning (pocket feed)

The Simulation tab warns when the feed holes are too far apart around the ring. The check lives in `src/physics.ts` (`holeSpacingNotes`). Change this file in the same commit as any change to that logic.

## Why the model cannot see this

Lift, stiffness, and air use treat the pocket as **axisymmetric**. Circumferential pressure variation between holes is averaged out. A deep pocket equalizes much better than a thin full-face film, but extremely sparse jets can still leave soft arcs that tip the disk.

## Length scales

- Pocket half-path: \(L = \min(r_f - r_{\mathrm{lip,in}},\; r_{\mathrm{lip,out}} - r_f)\)
- Pitch: \(s = 2\pi r_f / n\)

Because pocket conductance is high, the warn/note ratios are **looser** than the old thin-film land check:

| Condition | Level |
| --- | --- |
| \(s > 3L\) | Warn |
| \(1.5L < s \le 3L\) | Note |
| \(s \le 1.5L\) | Quiet |

Constants: `HOLE_PITCH_WARN_LAND = 3`, `HOLE_PITCH_NOTE_LAND = 1.5`.

## What this is not

It is not a lift or flow limit. Fewer larger holes can match lift; they may still leave soft arcs if spacing is extreme relative to the path to the lips.
