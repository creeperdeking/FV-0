# ELEGOO Saturn 4 12K

Printer planned for the FV-0 conical disk and stator prototypes.

Source: [ELEGOO FR product page](https://fr.elegoo.com/products/saturn-4-12k-10inch-monochrome-lcd-resin-3d-printer) (specs as published there).

## Type

| Item | Value |
| --- | --- |
| Technology | MSLA (masked stereolithography) |
| LCD | 10-inch monochrome, 12K |
| LCD resolution | 11520 × 5120 |
| Wavelength | 405 nm (COB + Fresnel collimator) |
| LCD protector | 9H tempered glass |

## Build volume (print zone)

| Axis | Size |
| --- | --- |
| X | 218.88 mm |
| Y | 122.88 mm |
| Z | 220 mm |

Volume quoted by ELEGOO: **218.88 × 122.88 × 220 mm³**.

### Fit for the FV-0 small prototype

The scaled small disk is **210 mm** outer diameter. That fits in X (218.88 mm) but **not** in Y (122.88 mm), so the full annulus cannot print in one piece on this bed. Segmented prints (or a different orientation strategy) are required, as already discussed for the prototype build.

## Resolution and stated accuracy

| Item | Value |
| --- | --- |
| XY pixel size | **19 × 24 µm** |
| Layer thickness | **0.01–0.2 mm** (10–200 µm) |
| Z-axis accuracy (stated) | **0.02 mm** (20 µm) |
| Max print speed (stated) | **70 mm/h** |

### What the numbers mean for surface quality

Pixel size is **not** finished face accuracy. On a large flat or conical part, warp, supports, peel forces, layer lines, and (for FV-0) segment seams usually leave form error well above 19–24 µm. Stated Z accuracy of 20 µm is a machine claim, not a guarantee on a ~210 mm printed cone.

## Suggested air-film gap for FV-0

The film clearance must stay larger than the worst proud mismatch between disk and stator. If a seam or warp high-spot is taller than the gap, the parts rub, friction kills centering, and the soft cone no longer self-aligns.

### Worst end of printing accuracy (unlapped, segmented print)

For this printer on a segmented ~210 mm cone, a pessimistic face mismatch is about **0.1–0.3 mm**: thick layers up to 0.2 mm, peel marks, warp over a long span, and proud bond lines. Plan the first float for about **0.3–0.5 mm**.

- **0.5 mm** matches the original “leave margin for print error” idea and is safe when faces are ugly.
- **~0.3 mm** is a slightly firmer worst-case target if the print is careful but still not lapped.

That film will be soft (stiffness falls roughly as 1/h³) and air-hungry. Treat it as a “does it float at all?” check, not as the final design hover.

### After a light lap

Once steps and seams are knocked down, a practical prototype hover is about **50–150 µm**: still room for residual error, much stiffer than half a millimetre.

### Precision target (only with good faces)

Loaded machine orifice bearings often fly at **5–30 µm**. That needs faces matched to a few micrometres. Do not aim there until the cones are lapped (or machined) well enough; the Saturn 4 alone will not deliver that on a large annulus.

### Summary

| Stage | Suggested gap | Role |
| --- | --- | --- |
| Worst print, unlapped | **0.3–0.5 mm** | First float despite form error |
| Careful print + light lap | **~0.05–0.15 mm** | Usable prototype film |
| Precision faces | **~0.005–0.03 mm** | Stiff bearing (later) |

## Light path (marketing specs)

| Item | Value |
| --- | --- |
| Light source | COB + Fresnel collimating lens |
| Astigmatism coefficient (stated) | 0.5 % |
| Field uniformity (stated) | 92 % |
| Angle deviation (stated) | &lt; 5° |

## Materials

- Photopolymer resin at **405 nm**.
- ELEGOO states support for most market resins: water-washable, standard, ABS-like, plant-based, etc.
- For FV-0, density in the explorer defaults to **1200 kg/m³** as a resin / PETG proxy; measure the cured resin if mass must be accurate.

Release film: **PFA** (not FEP), per the product page.

### Resin bottle on hand (label)

ELEGOO 405 nm bottle, **1000 g**. Settings: search resin profiles on [elegoo.com](https://elegoo.com).

| Item | Value |
| --- | --- |
| UV wavelength | **405 nm** |
| Quantity | **1000 g** |
| Production (P) | 07/NOV/2024 |
| Expiry (E) | 06/NOV/2026 |

Label also notes: see production and expiry date on the bottle.

## Machine envelope

| Item | Value |
| --- | --- |
| External size | 327.4 × 329.2 × 548 mm |
| Net weight | 13.5 kg |
| Gross weight | 18.3 kg |
| Power | 100–240 V, 50/60 Hz; 24 V 6 A |
| Cooling | 4 copper heat pipes + one fan |

## Software and controls

| Item | Value |
| --- | --- |
| Slicers | Chitubox, Voxeldance Tango, Autodesk Fusion |
| Connection | USB offline printing |
| UI | 3.5-inch resistive touch screen |
| System | EL3D-3.0.1 |
| Languages (UI) | Chinese, English |

## Other features (from ELEGOO)

- One-click self-check
- One-click automatic leveling
- Mechanical sensor: residue detection, low-resin alarm, leveling-failure alarm
- Quick-release build plate, dual-outlet resin vat, replaceable vat lock, hinged cover
- Splash / recovery tray under the vat
- Compatible with Mars Mate air purifier (USB connection to the purifier unavailable on this model, per the page)

## Constraints called out by ELEGOO

Do **not** fit flexible build plates on the Saturn 4. ELEGOO warns that they can break auto-leveling, confuse resin sensing, and risk damaging the LCD.
