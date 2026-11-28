"""Models what the P60B40 drives, and the rolling road under the rear wheels, for the garage, and exports a GLB.

Run through `npm run build:drivetrain`, or directly:
blender -b --factory-startup --python tools/blender/build_drivetrain.py -- <layout.json> <out.glb>

Car space, glTF axes (y up, the car facing +z). layout.json carries the engine's origin and the rear wheels' centres
(from the car and engine models), and the gearbox's tooth counts and the tyre radius (from p60.wasm), so the gears
here are the gears the sound and the physics use.

BMW's 2001 release gives a triple-disc carbon clutch, a straight-cut six-speed manual gearbox and a viscous
limited-slip differential. No source shows their insides or says where the gearbox sits, so the layout below is
illustrative: a conventional gearbox behind the engine, as in the road M3, then a propshaft to a hypoid differential.

Driveline (shown only in the drivetrain x-ray), each moving part a pivot whose mesh hangs off <name>_mesh:
- Flywheel: on the crank's axis, with the bolts that carry the clutch's steel plates; turns with the engine.
- Clutch_disc_1..3, Clutch_plate_1..4: the clutch pack behind it, front to back disc, plate, disc, plate, disc, plate,
  plate. The carbon discs turn with the gearbox, the steel plates with the engine; each slides back extras.spread (m)
  as the clutch opens, drawn far wider than a real clutch's fraction of a millimetre so the opening shows.
- Input: the input shaft and the constant-mesh gear; turns with the gearbox.
- Layshaft, Lay_1..Lay_6: the layshaft's constant-mesh gear and its six gears, below the main shafts.
- Gear_1..Gear_6: each gear's wheel on the output shaft, turning free until its dog ring locks it.
- Output: the output shaft and its flange. Dog_12/34/56 turn with it and slide extras.travel (m) toward a gear,
  carried by Fork_12/34/56, which only slide.
- Propshaft: from the output flange back to the differential's pinion, on the crank's axis.
- Axle: the crown wheel, the differential and the half-shafts out to the rear hubs; turns about x with the wheels.
- Case_*: the bellhousing, gearbox case and differential housing, which the page shows as a ghost.
Rollers (always shown): Roller_<RL|RR>_<front|rear>, pivots on their axles (along x), extras.radius (m).
"""
import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_engine as be  # noqa: E402  (its helpers; its main() runs only as a script)

CENTRES = 0.075  # between the main shafts and the layshaft
LAY_DROP = Vector((0, -CENTRES, 0))
FACE = 0.016  # each gear's face width
DOG_TRAVEL = 0.009
CLUTCH_SPREAD = 0.004  # how much wider each gap in the clutch pack opens (m): illustrative, real clutches move ~1 mm
# Gear centres along z (car space), front to back: the constant-mesh pair, then 6, 5, 4, 3, 2, 1, with a dog ring
# between each pair of gears.
Z_CONSTANT = 0.770
Z_GEAR = {6: 0.735, 5: 0.689, 4: 0.650, 3: 0.604, 2: 0.565, 1: 0.519}
Z_DOG = {"12": 0.542, "34": 0.627, "56": 0.712}
ROLLER_R = 0.11
ROLLER_SPREAD = math.radians(25)  # each roller's contact, either side of straight below the axle

MAT = {}


def pivot(name, pieces, origin=(0, 0, 0), parent=None, sharp=40, **extras):
    """A pivot at `origin` holding one mesh made of `pieces` [(bmesh, material key)], which are relative to it. The
    mesh hangs off its own child, because meshopt's quantization folds a scale and offset into whichever node holds it."""
    keys = []
    for bm, key in pieces:
        if key not in keys:
            keys.append(key)
        for face in bm.faces:
            face.material_index = keys.index(key)
    bm = be.merge(*[bm for bm, _ in pieces])
    be.place(bm, be.TO_BLENDER)
    bm.normal_update()
    for face in bm.faces:
        face.smooth = True
    for edge in bm.edges:
        if edge.is_manifold and edge.calc_face_angle(0) > math.radians(sharp):
            edge.smooth = False
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for key in keys:
        mesh.materials.append(MAT[key])
    node = bpy.data.objects.new(name, None)
    obj = bpy.data.objects.new(f"{name}_mesh", mesh)
    for o in (node, obj):
        bpy.context.scene.collection.objects.link(o)
    node.parent = parent
    node.location = be.TO_BLENDER @ Vector(origin)
    obj.parent = node
    for key, value in extras.items():
        node[key] = value
    return node


def group(name, parent=None):
    node = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(node)
    node.parent = parent
    return node


def moved(bm, x=0.0, y=0.0, z=0.0):
    bmesh.ops.translate(bm, vec=(x, y, z), verts=bm.verts)
    return bm


def spur(teeth, module, z0, z1):
    """A straight-cut gear on local z: trapezoid teeth on its pitch circle, as many as `teeth`."""
    pitch = module * teeth / 2
    tip, root = pitch + module, pitch - 1.25 * module
    step = 2 * math.pi / teeth
    outline = []
    for k in range(teeth):
        a = k * step
        for offset, r in ((-0.27, root), (-0.12, tip), (0.12, tip), (0.27, root)):
            outline.append((r * math.cos(a + offset * step), r * math.sin(a + offset * step)))
    return be.prism(outline, z0, z1)


def dogs(radius, z, facing, count=6, size=0.005):
    """Dog teeth: lugs standing off a face at `z` toward `facing` (+1 or -1), which a dog ring's lugs catch."""
    lugs = []
    for k in range(count):
        a = 2 * math.pi * (k + 0.5) / count
        lug = be.box(size, size, size)
        be.place(lug, be.at(radius * math.cos(a), radius * math.sin(a), z + facing * size / 2))
        lugs.append(lug)
    return lugs


def knurled(radius, length, flutes=36, depth=0.0025):
    """A roller along local z with shallow flutes, so its turning shows."""
    outline = []
    for k in range(2 * flutes):
        a = math.pi * k / flutes
        r = radius - (depth if k % 2 else 0.0)
        outline.append((r * math.cos(a), r * math.sin(a)))
    return be.prism(outline, -length / 2, length / 2)


def build_clutch(axis, z_fly, parent):
    """The flywheel, then the clutch pack behind it: three carbon discs on the input shaft, between steel plates that
    turn with the flywheel. BMW's release gives a triple-disc carbon-fibre clutch; the sizes are illustrative. Each
    piece of the pack is its own pivot, so the page can spread them apart as the clutch opens."""
    fly = [moved(be.cylinder(0.13, 0.012, segments=48, bevel=0.002), z=-0.006)]  # the flywheel's face, at z_fly
    for k in range(6):  # the bolts that carry the plates, round the outside of the pack, long enough for it open
        a = 2 * math.pi * k / 6
        fly.append(moved(be.cylinder(0.005, 0.075, segments=8), x=0.084 * math.cos(a), y=0.084 * math.sin(a), z=-0.0475))
    pivot("Flywheel", [(bm, "steel") for bm in fly], origin=(axis.x, axis.y, z_fly), parent=parent)
    # Front to back: disc, plate, disc, plate, disc, then the pressure plate and its backing plate, which move together.
    pack = [("Clutch_disc_1", -0.012), ("Clutch_plate_1", -0.018), ("Clutch_disc_2", -0.024), ("Clutch_plate_2", -0.030),
            ("Clutch_disc_3", -0.036), ("Clutch_plate_3", -0.042), ("Clutch_plate_4", -0.054)]
    for k, (name, z) in enumerate(pack):
        if name.startswith("Clutch_disc"):
            pieces = [(be.cylinder(0.072, 0.005, segments=40), "carbon"), (be.cylinder(0.022, 0.009, segments=6), "carbon")]  # and its splined hub
        else:
            pieces = [(be.cylinder(0.078, 0.004, segments=40), "steel")]
        spread = CLUTCH_SPREAD * min(k + 1, 6)
        pivot(name, pieces, origin=(axis.x, axis.y, z_fly + z), parent=parent, spread=spread)


def build_gearbox(cfg, axis, parent):
    cm_in, cm_lay = cfg["constantMesh"]
    m_cm = 2 * CENTRES / (cm_in + cm_lay)
    m_gear = 2 * CENTRES / sum(cfg["gears"][0])
    z_fly = cfg["engineOrigin"][2] - 0.30
    lay = axis + LAY_DROP

    # Input: the shaft and its half of the constant-mesh pair, turning on the crank's axis, behind the clutch.
    build_clutch(axis, z_fly, parent)
    pieces = []
    shaft = moved(be.cylinder(0.012, z_fly - 0.012 - Z_CONSTANT + 0.004, segments=16), z=(z_fly - 0.012 + Z_CONSTANT - 0.004) / 2 - z_fly)
    pieces.append((shaft, "shaft"))
    pieces.append((spur(cm_in, m_cm, Z_CONSTANT - FACE / 2 - z_fly, Z_CONSTANT + FACE / 2 - z_fly), "gear"))
    pivot("Input", pieces, origin=(axis.x, axis.y, z_fly), parent=parent)

    # The layshaft, with its half of the constant-mesh pair; each of its six gears is its own pivot, so the page can
    # light the one carrying the drive.
    z_lay_front, z_lay_rear = Z_CONSTANT + 0.015, Z_GEAR[1] - 0.02
    pivot("Layshaft", [(moved(be.cylinder(0.013, z_lay_front - z_lay_rear, segments=16), z=(z_lay_front + z_lay_rear) / 2), "shaft"),
                       (spur(cm_lay, m_cm, Z_CONSTANT - FACE / 2, Z_CONSTANT + FACE / 2), "gear")],
          origin=(lay.x, lay.y, 0), parent=parent)
    for gear, (lay_teeth, out_teeth) in enumerate(cfg["gears"], start=1):
        z = Z_GEAR[gear]
        pivot(f"Lay_{gear}", [(spur(lay_teeth, m_gear, z - FACE / 2, z + FACE / 2), "gear")], origin=(lay.x, lay.y, 0), parent=parent)
        # Its partner on the output shaft, with dog teeth on the side its ring comes from.
        ring = {1: "12", 2: "12", 3: "34", 4: "34", 5: "56", 6: "56"}[gear]
        facing = 1 if Z_DOG[ring] > z else -1
        wheel = [(spur(out_teeth, m_gear, z - FACE / 2, z + FACE / 2), "gear")]
        wheel += [(lug, "gear") for lug in dogs(0.026, z + facing * FACE / 2, facing)]
        wheel.append((moved(be.cylinder(0.02, FACE + 0.004, segments=20), z=z), "gear"))
        pivot(f"Gear_{gear}", wheel, origin=(axis.x, axis.y, 0), parent=parent)

    # Output: the shaft from the constant-mesh gear back to the flange the propshaft bolts to, with the dog hubs.
    z_out_front, z_flange = Z_CONSTANT - FACE / 2 - 0.002, 0.29
    output = [(moved(be.cylinder(0.016, z_out_front - z_flange, segments=18), z=(z_out_front + z_flange) / 2), "shaft"),
              (moved(be.cylinder(0.042, 0.012, segments=6, bevel=0.002), z=z_flange), "shaft")]
    for z in Z_DOG.values():
        output.append((moved(be.cylinder(0.022, FACE, segments=24), z=z), "shaft"))
    pivot("Output", output, origin=(axis.x, axis.y, 0), parent=parent)

    # The dog rings, turning with the output shaft and sliding toward a gear, and the forks that slide them.
    rod_y = 0.068
    for ring, z in Z_DOG.items():
        dog = [(be.lathe([(0.023, -0.007), (0.034, -0.007), (0.034, -0.0025), (0.03, -0.0025), (0.03, 0.0025), (0.034, 0.0025), (0.034, 0.007), (0.023, 0.007)], segments=36), "steel")]
        for facing in (-1, 1):
            dog += [(lug, "steel") for lug in dogs(0.026, facing * 0.007, facing)]
        pivot(f"Dog_{ring}", dog, origin=(axis.x, axis.y, z), parent=parent, travel=DOG_TRAVEL)
        fork = [be.box(0.074, 0.008, 0.004)]
        be.place(fork[0], be.at(0, 0.036, 0))
        for side in (-1, 1):
            prong = be.box(0.006, 0.03, 0.004)
            be.place(prong, be.at(side * 0.034, 0.024, 0))
            fork.append(prong)
        boss = be.box(0.014, 0.034, 0.012)
        be.place(boss, be.at(0, 0.054, 0))
        fork.append(boss)
        pivot(f"Fork_{ring}", [(bm, "bronze") for bm in fork], origin=(axis.x, axis.y, z), parent=parent)
    rods = []
    for k, x in enumerate((-0.012, 0.0, 0.012)):
        rod = be.cylinder(0.004, Z_CONSTANT - Z_GEAR[1] + 0.03, segments=10)
        be.place(rod, be.at(axis.x + x, axis.y + rod_y, (Z_CONSTANT + Z_GEAR[1]) / 2))
        rods.append(rod)
    return rods, z_fly


def build_cases(cfg, axis, z_fly, rods, parent):
    """The bellhousing round the clutch, the gearbox case round the gears, and its tail; the page ghosts them."""
    bell = be.lathe([(0.17, z_fly + 0.012), (0.17, z_fly - 0.02), (0.155, z_fly - 0.07), (0.12, 0.83), (0.11, 0.80),
                     (0.105, 0.80), (0.115, 0.83), (0.15, z_fly - 0.07), (0.165, z_fly - 0.02), (0.165, z_fly + 0.012)], segments=48)
    be.place(bell, be.at(axis.x, axis.y, 0))
    box = be.box(0.15, 0.23, Z_CONSTANT - Z_GEAR[1] + 0.07, bevel=0.035, segments=3)
    be.place(box, be.at(axis.x, axis.y - 0.025, (Z_CONSTANT + Z_GEAR[1]) / 2 + 0.005))
    tail = be.lathe([(0.0, 0.30), (0.038, 0.30), (0.04, 0.32), (0.05, 0.40), (0.06, 0.48)], segments=32)
    be.place(tail, be.at(axis.x, axis.y, 0))
    for name, bm in (("Case_bellhousing", bell), ("Case_gearbox", be.merge(box, tail, *rods))):
        mesh = bpy.data.meshes.new(name)
        be.place(bm, be.TO_BLENDER)
        bm.to_mesh(mesh)
        bm.free()
        mesh.materials.append(MAT["case"])
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        obj.parent = parent


def build_axle(cfg, axis, parent):
    """The propshaft back to a hypoid differential: its pinion runs on the crank's axis, a little below the crown
    wheel's centre, which sits on the rear wheels' axis. The crown wheel, the differential and the half-shafts turn
    together with the wheels."""
    rl, rr = Vector(cfg["wheelRL"]), Vector(cfg["wheelRR"])
    hub = (rl + rr) / 2
    pinion_teeth, crown_teeth = cfg["finalDrive"]
    crown_pitch = 0.085
    m_fd = 2 * crown_pitch / crown_teeth
    z_pinion = hub.z + math.sqrt(crown_pitch ** 2 - (hub.y - axis.y) ** 2)
    front, rear = 0.285, z_pinion + 0.012
    # Propshaft: a flex disc at the gearbox, a centre bearing, universal joints, and the pinion on its end.
    prop = [(moved(be.cylinder(0.05, 0.016, segments=6, bevel=0.003), z=front - 0.008), "rubber")]
    middle = (front + rear) / 2
    for a, b in ((front - 0.02, middle + 0.03), (middle - 0.03, rear + 0.06)):
        prop.append((moved(be.cylinder(0.032, a - b, segments=20), z=(a + b) / 2), "prop"))
    for z in (middle + 0.03, middle - 0.03, rear + 0.06):
        prop.append((moved(be.cylinder(0.038, 0.03, segments=8, bevel=0.003), z=z), "steel"))
    prop.append((moved(be.cylinder(0.014, 0.06, segments=14), z=rear + 0.03), "steel"))
    pinion = spur(pinion_teeth, m_fd * 0.85, -0.015, 0.015)
    prop.append((moved(pinion, z=z_pinion), "gear"))
    pivot("Propshaft", prop, origin=(axis.x, axis.y, 0), parent=parent)
    bearing = be.box(0.1, 0.03, 0.03, bevel=0.006)
    be.place(bearing, be.at(axis.x, axis.y + 0.045, middle))

    # Axle: everything turning about x through the hubs' centre.
    crown = spur(crown_teeth, m_fd, -0.01, 0.01)
    be.place(crown, be.X_OUT)  # its axis along x
    axle = [(moved(crown, x=0.035), "gear")]
    carrier = be.lathe([(0.0, -0.06), (0.05, -0.06), (0.06, -0.03), (0.06, 0.025), (0.05, 0.03), (0.0, 0.03)], segments=32)
    be.place(carrier, be.X_OUT)
    axle.append((carrier, "steel"))
    for side, wheel in ((1, rl), (-1, rr)):
        inner, outer = side * 0.11, wheel.x - side * 0.07
        shaft = be.cylinder(0.016, abs(outer - inner), segments=16)
        be.place(shaft, be.at((inner + outer) / 2, 0, 0) @ be.X_OUT)
        axle.append((shaft, "shaft"))
        for x in (inner, outer):
            joint = be.lathe([(0.0, -0.035), (0.04, -0.03), (0.045, 0.0), (0.04, 0.03), (0.0, 0.035)], segments=24)
            be.place(joint, be.at(x, 0, 0) @ be.X_OUT)
            axle.append((joint, "rubber" if x == outer else "steel"))
    pivot("Axle", axle, origin=(0, hub.y, hub.z), parent=parent)

    housing = be.lathe([(0.0, -0.08), (0.07, -0.08), (0.1, -0.05), (0.115, 0.0), (0.1, 0.05), (0.07, 0.085), (0.0, 0.085)], segments=40)
    be.place(housing, be.at(0, hub.y, hub.z) @ be.X_OUT)
    nose = be.lathe([(0.065, hub.z + 0.06), (0.05, z_pinion + 0.03), (0.04, z_pinion + 0.07), (0.0, z_pinion + 0.07)], segments=32)
    be.place(nose, be.at(axis.x, axis.y, 0))
    tubes = []
    for side in (-1, 1):
        tube = be.cylinder(0.035, 0.06, segments=24)
        be.place(tube, be.at(side * 0.13, hub.y, hub.z) @ be.X_OUT)
        tubes.append(tube)
    mesh = bpy.data.meshes.new("Case_differential")
    bm = be.merge(housing, nose, bearing, *tubes)
    be.place(bm, be.TO_BLENDER)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(MAT["case"])
    obj = bpy.data.objects.new("Case_differential", mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = parent


def build_rollers(cfg, parent):
    """A pair of knurled rollers under each rear tyre, set into the floor so their tops stand a few centimetres
    proud, with a steel frame round each pit and a dark gap where the floor opens."""
    tyre = cfg["tyreRadius"]
    for label in ("RL", "RR"):
        wheel = Vector(cfg[f"wheel{label}"])
        reach = tyre + ROLLER_R
        y = wheel.y - reach * math.cos(ROLLER_SPREAD)
        for end, sign in (("front", 1), ("rear", -1)):
            z = wheel.z + sign * reach * math.sin(ROLLER_SPREAD)
            roller = knurled(ROLLER_R, 0.4)
            be.place(roller, be.X_OUT)
            caps = []
            for x in (-0.205, 0.205):
                cap = be.cylinder(0.04, 0.01, segments=6, bevel=0.002)
                be.place(cap, be.at(x, 0, 0) @ be.X_OUT)
                caps.append(cap)
            pivot(f"Roller_{label}_{end}", [(roller, "roller"), *[(cap, "steel") for cap in caps]],
                  origin=(wheel.x, y, z), parent=parent, radius=ROLLER_R)
        # The pit: a frame flush with the floor, and a dark gap inside it.
        span_z = 2 * reach * math.sin(ROLLER_SPREAD) + 2 * ROLLER_R + 0.06
        frame = []
        for dz in (-1, 1):
            bar = be.box(0.52, 0.006, 0.05, bevel=0.002)
            be.place(bar, be.at(wheel.x, 0.003, wheel.z + dz * (span_z / 2 + 0.025)))
            frame.append(bar)
        for dx in (-1, 1):
            bar = be.box(0.05, 0.006, span_z + 0.1, bevel=0.002)
            be.place(bar, be.at(wheel.x + dx * 0.235, 0.003, wheel.z))
            frame.append(bar)
        gap = be.box(0.42, 0.002, span_z, segments=1)
        be.place(gap, be.at(wheel.x, 0.0015, wheel.z))
        for name, bm, mat in ((f"Pit_{label}_frame", be.merge(*frame), "plate"), (f"Pit_{label}_gap", gap, "pit")):
            mesh = bpy.data.meshes.new(name)
            be.place(bm, be.TO_BLENDER)
            bm.to_mesh(mesh)
            bm.free()
            mesh.materials.append(MAT[mat])
            obj = bpy.data.objects.new(name, mesh)
            bpy.context.scene.collection.objects.link(obj)
            obj.parent = parent


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    layout_path, out = argv[0], argv[1]
    with open(layout_path) as handle:
        cfg = json.load(handle)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    MAT.update({
        "case": be.material("gearbox_case", (0.55, 0.56, 0.57), 0.8, 0.45),
        "gear": be.material("gear_steel", (0.6, 0.6, 0.62), 1.0, 0.28),
        "shaft": be.material("shaft_steel", (0.5, 0.5, 0.52), 1.0, 0.3),
        "steel": be.material("clutch_steel", (0.42, 0.42, 0.44), 1.0, 0.35),
        "carbon": be.material("carbon_clutch", (0.03, 0.03, 0.035), 0.2, 0.5),
        "bronze": be.material("fork_bronze", (0.55, 0.38, 0.18), 1.0, 0.35),
        "prop": be.material("propshaft", (0.05, 0.05, 0.06), 0.4, 0.45),
        "rubber": be.material("joint_rubber", (0.02, 0.02, 0.02), 0.0, 0.8),
        "roller": be.material("roller_steel", (0.5, 0.5, 0.52), 1.0, 0.4),
        "plate": be.material("dyno_plate", (0.12, 0.12, 0.13), 0.8, 0.5),
        "pit": be.material("dyno_pit", (0.005, 0.005, 0.006), 0.0, 0.9),
    })
    axis = Vector(cfg["engineOrigin"])  # the crank's axis carries on through the gearbox
    root = group("Drivetrain")
    driveline = group("Driveline", root)
    rollers = group("Rollers", root)
    rods, z_fly = build_gearbox(cfg, axis, driveline)
    build_cases(cfg, axis, z_fly, rods, driveline)
    build_axle(cfg, axis, driveline)
    build_rollers(cfg, rollers)
    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    triangles = sum(len(p.vertices) - 2 for obj in meshes for p in obj.data.polygons)
    print(f"build_drivetrain: {len(meshes)} meshes, ~{triangles} triangles")
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_yup=True, export_extras=True, export_normals=True,
                              export_texcoords=False, export_cameras=False, export_lights=False)


if __name__ == "__main__":
    main()
