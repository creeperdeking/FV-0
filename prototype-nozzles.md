# Nozzle layout for the first prototype

The disk is a 225 mm cone with a 125 mm hole and a 5° slope. The lift nozzles sit in the stator, under the disk. These notes cover the order of experiments, where to drill, and how many holes to use.

## Start static, then add drive air

Get a clean hover with straight nozzles before adding any tangential flow. The static test is where the real flying height, the evenness of the cone, and the steadiness of the supply show up. The torque that produces 1 rev/s is only 0.10 mN·m, so a rubbing guide pin or a rocking disk will hide a drive jet.

Once the disk sits quietly at a repeatable height, leave the lift circuit alone. Add one or two separate drive nozzles and feed them through their own needle valve. Open that valve only after the disk is already floating. A 10% change in drive flow changes the speed by about 10% while the flying height stays put.

The drive nozzles belong in the stator, under the disk, with their exits on the midpoint circle at 87.5 mm radius. The film there is still closed on both sides, so the jet runs along the gap instead of spilling out of the hole or the rim. Aim each nozzle tangent to that circle, in the same rotational direction, and as parallel to the cone surface as the drill will allow.

Two exits, opposite each other, are the better first choice. They push the disk the same way around, and the sideways forces cancel.

## Straight nozzles on the midpoint circle

Put the straight nozzles on that same 87.5 mm circle, aimed square to the cone surface.

The hole and the outer rim are both open to the room. The feed circle is the pressure peak, and air leaks toward both edges. The middle of the land makes those two leak paths equally tight, and it is also where the lift peaks. At 2 bar, twelve 0.4 mm holes, and an 80 µm gap:

| Feed radius | Lift |
| --- | --- |
| 70 mm | 45 N |
| 87.5 mm | 82 N |
| 105 mm | 40 N |

Anywhere from about 80 mm to 92 mm radius is effectively the same. Space the holes evenly around the circle. An uneven ring pressurizes one side more than the other and pushes the disk into the guide pin.

## How many holes

With one drill size, more holes mean more inlet area. At 2 bar and a fixed 80 µm gap, each 0.4 mm hole is still choked, so lift, stiffness, and air use rise almost in step with the count:

| Holes | Spacing on the 87.5 mm circle | Lift at 80 µm | Stiffness at 80 µm | Air use |
| --- | --- | --- | --- | --- |
| 6 | 92 mm | 41 N | 1.5 N/µm | 19 NL/min |
| 12 | 46 mm | 82 N | 3.0 N/µm | 37 NL/min |
| 24 | 23 mm | 160 N | 5.8 N/µm | 75 NL/min |
| 36 | 15 mm | 237 N | 8.4 N/µm | 112 NL/min |

Extra lift does not stiffen the unloaded disk. The disk weighs 2.6 N, so more holes float it higher: about 200 µm with 6 holes, and about 320 µm with 24. The stiffness in the table appears when something holds the gap near 80 µm.

The integrated result follows the total open area. Six holes of 0.57 mm, twelve of 0.40 mm, and twenty-four of 0.28 mm give the same lift, stiffness, and flow. Dividing that area into more exits is what evens the pressure around the circle. The feed ring is 25 mm from the hole and 25 mm from the rim. When the spacing is much larger than that land, each jet is a soft spot with a low-pressure sector beside it and the disk rocks. When the spacing comes down to about the land width, the high-pressure zones meet.

A spacing near 25 mm on this circle is about 22 holes. Twelve 0.4 mm holes are the right first build: the spacing is 46 mm, the air use is 37 NL/min, and the lift is already far above the disk. Move to about 24 holes once the static hover is repeatable and the pressure needs to be smooth enough to spin without rocking. Past that, the extra air buys little evenness.
