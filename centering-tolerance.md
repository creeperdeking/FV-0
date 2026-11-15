# Centering tolerance for the first prototype

The disk is a 225 mm cone with a 125 mm hole and a 5° slope. The question is how precisely the cones must be assembled, and the holes drilled, for the air film to keep the disk within 0.5 cm of center.

A flying disk on this cone stays inside that limit by itself. The film closes on one side at about 2.9 mm of offset, so 5 mm of offset means the disk is already touching. Drilling errors do not get you there. Cone alignment does.

## Why 5 mm is already contact

At the natural hover gap, about 255 µm with twelve 0.4 mm holes at 2 bar, a radial shift \(e\) changes the normal gap by \(e \sin 5^\circ\). The gap reaches zero when

\[
e = \frac{0.255\,\mathrm{mm}}{\sin 5^\circ} \approx 2.9\,\mathrm{mm}.
\]

Up to that point the film pushes back. A sector estimate of that force is about 0.06 N at 0.5 mm of offset, 0.16 N at 1 mm, and 1.1 N at 2 mm. The whole set of lift jets, if every one of them were turned fully sideways, carries only 0.24 N of momentum, which the film balances at roughly 1 mm of offset.

## What drilling errors do

Ordinary hole errors move the disk by a fraction of a millimetre:

| Error | Offset of the disk |
| --- | --- |
| One hole tilted 10° from the cone normal | about 0.03 mm |
| One hole missing, or blocked | about 0.2 mm |
| One hole drilled at twice the diameter | about 0.4 mm |
| Every hole tilted 30° the same way | about 1 mm |

The 0.5 cm centering spec does not set a tight drilling tolerance. Keep each hole within about 10° of square to the cone so the jet enters the film, and keep the hole circle within about 1 mm of the cone axis. A circle several millimetres off-axis would still leave the disk inside 5 mm, but 1 mm is an easy mark and keeps the pressure centered.

## What actually has to be precise

The two cones have to match, because a dry disk will not slide back to center. The slope force is \(W \tan 5^\circ \approx 0.23\,\mathrm{N}\), while dry plastic friction on this disk is several times larger. Centering exists only while the disk is fully airborne.

With the disk centered, the gap at the rim needs to be the same all around to about 0.1 mm. That is a tilt of about 0.05° across the 225 mm diameter. A larger rock closes the film at one point on the rim, friction takes over, and the disk can sit where it touched.

A practical check: seat the disk on the stator without air and confirm it does not rock by more than a sheet of paper at the rim.
