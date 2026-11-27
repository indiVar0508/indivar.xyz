"""Models the P60B40's moving parts for the garage's x-ray view, and exports a GLB.

Run through `npm run build:internals`, or directly:
blender -b --factory-startup --python tools/blender/build_internals.py -- <layout.json> <out.glb>

As in build_engine.py, everything is modelled in glTF axes in engine space (origin on the crank axis, +z toward the
nose). Each moving part is its own node with its origin at its pivot, and the page moves it from p60.wasm's
kinematics frame:
- Crank: turns about z.
- Rod_<n>: origin at the big end, pointing up +y; the page puts it on its pin and turns it about z.
- Piston_<n>: origin at the piston pin, built along its bore; the page slides it along the bore.
- Cam_<bank>_<in|ex>: origin on the cam's axis; turns about z at half crank speed.
- Valve_<n>_<in|ex>: a cylinder's pair of intake or exhaust valves, shut. extras.axis is the stem direction; the
  page pushes them open against it.
- Starter_pinion: origin on the starter's axis; turns against the flywheel's ring gear while the engine cranks.
- Plugs: the eight spark plugs, which don't move.
- Springs_<n>_<in|ex>: a valve pair's springs, on the spring seats, turned so local +y runs up the stems.
  extras.length is how long they stand with the valves shut; the page scales y to compress them by the lift.
- Oil_pump, Oil_pump_outer: the dry-sump pump's gerotor stages, inner rotors on the pump's shaft and outer rings on
  an axis offset from it. extras.ratio is the pump's turns per crank turn, extras.lobes the inner and outer lobes.
- Flow_chain_<bank>: each bank's timing chain, a closed path round the crank's sprocket and its two cam sprockets in
  the chain's running direction, with extras.radius, the crank sprocket's pitch radius.
Each of those pivots has no mesh of its own; its mesh hangs off a child named <name>_mesh.

layout.json carries the cylinders (src/engine/geometry.ts) and the timing (p60.wasm), so each cam lobe's nose meets
its tappet at the crank angle where the crate puts peak lift. Sizes the crate doesn't own (journals, webs, valve
heads, springs, chains, pump) are illustrative: no source shows the P60B40's cam drive, valve springs or oil pump.
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

RING_TEETH, PINION_TEETH = 120, 11
RING_PITCH = 0.1275  # with the pinion's, adds up to the 0.139 m between the crank's and the starter's axes
FLYWHEEL_Z = (-0.312, -0.30)
PIN_R = 0.024
JOURNAL_R = 0.03
WEB_T = 0.014
ROD_W = 0.02  # each rod's width along the crank; two rods share a pin
PISTON_R = 0.0465  # in a 94 mm bore
SEAT = 0.252  # valve faces, measured up the bore from the crank axis
VALVE_LENGTH = 0.088
BUCKET = 0.012
PAIR = 0.018  # each valve of a pair sits this far in front of or behind the bore's centre
SPRING_LENGTH = 0.034  # each valve spring, shut, from its seat to the bucket's underside
SPRING_R = 0.0095
CAM_TEETH, CRANK_TEETH = 56, 28  # the cams turn at half crank speed
CAM_SPROCKET_PITCH = 0.038
CRANK_SPROCKET_PITCH = CAM_SPROCKET_PITCH * CRANK_TEETH / CAM_TEETH
CHAIN_Z = {"right": 0.266, "left": 0.280}  # each bank's chain runs on its own plane, so they pass at the crank
PUMP = (-0.262, -0.1)  # the dry-sump pump stack's axis (build_engine.py)
PUMP_OFFSET = 0.0035  # between a gerotor's inner rotor and outer ring
PUMP_RATIO = 0.5  # illustrative: the pump's turns per crank turn
VALVES = {
    "in": {"x": -0.017, "tilt": 14.0, "head": 0.0175, "bucket": 0.0135},  # toward the V
    "ex": {"x": 0.017, "tilt": -12.0, "head": 0.015, "bucket": 0.0125},
}

MAT = {}


def toward(psi, radius):
    """A point at `radius` from the axis, `psi` degrees clockwise from +y as seen from the front."""
    a = math.radians(psi)
    return (radius * math.sin(a), radius * math.cos(a))


def translated(bm, offset):
    bmesh.ops.translate(bm, vec=offset, verts=bm.verts)
    return bm


def node(name, bm, mat, origin=(0, 0, 0), parent=None, axis=None, sharp=40):
    """A pivot at `origin` (glTF engine space) holding the mesh `bm`, which is relative to it. The mesh hangs off its
    own child node, because meshopt's quantization folds a scale and offset into whichever node holds a mesh."""
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
    mesh.materials.append(MAT[mat])
    pivot = bpy.data.objects.new(name, None)
    obj = bpy.data.objects.new(f"{name}_mesh", mesh)
    for o in (pivot, obj):
        bpy.context.scene.collection.objects.link(o)
    pivot.parent = parent
    pivot.location = be.TO_BLENDER @ Vector(origin)
    obj.parent = pivot
    if axis is not None:
        pivot["axis"] = [round(v, 6) for v in axis]
    return pivot


def sprocket(teeth, pitch, z0, z1):
    return be.prism([toward(a * 180 / teeth, pitch + (0.002 if a % 2 else -0.002)) for a in range(2 * teeth)], z0, z1)


def lift_at(k, crank_from_peak):
    """The crate's lift curve: cos² over the valve's open duration."""
    d = (crank_from_peak + 360.0) % 720.0 - 360.0
    if abs(d) >= k["valveDuration"] / 2:
        return 0.0
    return k["valveLift"] * math.cos(math.pi * d / k["valveDuration"]) ** 2


def web_outline(phase, r):
    """A crank web: round over the journal, round over the pin, with a counterweight swung opposite the pin."""
    px, py = toward(phase, r)
    points = [toward(a, JOURNAL_R + 0.006) for a in range(0, 360, 15)]
    points += [(px + x, py + y) for x, y in (toward(a, PIN_R + 0.008) for a in range(0, 360, 15))]
    points += [toward(phase + 180 + a, 0.074) for a in range(-60, 61, 8)]
    return be.convex_hull([(round(x, 6), round(y, 6)) for x, y in points])


def build_crank(cfg, parent):
    k = cfg["kinematics"]
    r = k["crankRadius"]
    z_of = {c["number"]: c["center"][2] for c in cfg["cylinders"]}
    parts, stops = [], [0.215]
    for throw in range(1, 5):
        front = max(z_of[throw], z_of[throw + 4]) + ROD_W / 2 + 0.002
        rear = min(z_of[throw], z_of[throw + 4]) - ROD_W / 2 - 0.002
        phase = k["pinPhases"][throw - 1]
        px, py = toward(phase, r)
        parts.append(translated(be.cylinder(PIN_R, front - rear, segments=24), (px, py, (front + rear) / 2)))
        outline = web_outline(phase, r)
        parts.append(be.prism(outline, front, front + WEB_T, bevel=0.002))
        parts.append(be.prism(outline, rear - WEB_T, rear, bevel=0.002))
        stops += [front + WEB_T, rear - WEB_T]
    stops.append(-0.235)
    for a, b in zip(stops[0::2], stops[1::2]):  # five main journals, between and outside the throws
        parts.append(translated(be.cylinder(JOURNAL_R, a - b, segments=28), (0, 0, (a + b) / 2)))
    parts.append(translated(be.cylinder(0.015, 0.185, segments=20), (0, 0, 0.3075)))  # the snout, to the damper
    for z in CHAIN_Z.values():  # a sprocket for each bank's chain
        parts.append(sprocket(CRANK_TEETH, CRANK_SPROCKET_PITCH, z - 0.004, z + 0.004))
    parts.append(translated(be.cylinder(0.062, 0.015, segments=40, bevel=0.003), (0, 0, -0.2425)))  # flywheel flange
    # Behind the block: a stub to the flywheel, the flywheel with its ring gear, and a small multi-plate race clutch.
    parts.append(translated(be.cylinder(0.03, 0.05, segments=24), (0, 0, -0.275)))
    ring = [toward(k * 180 / RING_TEETH, RING_PITCH + (0.0022 if k % 2 == 0 else -0.0022)) for k in range(2 * RING_TEETH)]
    parts.append(be.prism(ring, *FLYWHEEL_Z))
    clutch = [(0.0, -0.312), (0.07, -0.312)] + [(0.07 - (0.004 if k % 2 else 0), -0.316 - 0.004 * k) for k in range(7)] + [(0.07, -0.345), (0.0, -0.345)]
    parts.append(be.lathe(clutch, segments=40))
    return node("Crank", be.merge(*parts), "forged", parent=parent)


def build_starter_pinion(parent):
    """The starter's pinion, on its axis, meshing with the ring gear where the two pitch circles touch."""
    sx, sy = be.STARTER
    pitch = math.hypot(sx, sy) - RING_PITCH
    contact = math.degrees(math.atan2(sx, sy))  # the crank's axis to the starter's, clockwise from +y
    # Put a pinion tooth into the ring's gap nearest the contact, measured from the pinion's centre back toward the crank.
    gap = (round(contact / (360 / RING_TEETH) - 0.5) + 0.5) * 360 / RING_TEETH
    phase = contact + 180 - (contact - gap) * RING_TEETH / PINION_TEETH
    outline = [toward(phase + k * 180 / PINION_TEETH, pitch + (0.0022 if k % 2 == 0 else -0.0022)) for k in range(2 * PINION_TEETH)]
    gear = be.prism(outline, FLYWHEEL_Z[0], FLYWHEEL_Z[1])
    shaft = translated(be.cylinder(0.006, 0.012, segments=10), (0, 0, FLYWHEEL_Z[0] - 0.006))
    return node("Starter_pinion", be.merge(gear, shaft), "cam", origin=(sx, sy, 0), parent=parent)


def build_plugs(cfg, parent):
    """A central spark plug in each chamber, between its four valves, up through the head to its coil's boot."""
    profile = [(0.0, 0.249), (0.0012, 0.249), (0.0012, 0.2515), (0.005, 0.2515), (0.006, 0.2525), (0.006, 0.272), (0.0085, 0.2725),
               (0.0085, 0.285), (0.0055, 0.2865), (0.0055, 0.33), (0.0095, 0.332), (0.0095, 0.368), (0.0, 0.37)]
    plugs = []
    for c in cfg["cylinders"]:
        plug = be.lathe(profile, segments=10)
        bmesh.ops.recalc_face_normals(plug, faces=plug.faces)
        be.place(plug, Matrix.Translation((0, 0, c["center"][2])) @ be.frame((0, 0, 0), c["axis"]))
        plugs.append(plug)
    return node("Plugs", be.merge(*plugs), "plug", parent=parent)


def build_rods(cfg, parent):
    length = cfg["kinematics"]["rodLength"]
    for c in cfg["cylinders"]:
        big = be.cylinder(0.034, ROD_W, segments=24, bevel=0.002)
        beam = be.prism([(-0.016, 0.02), (0.016, 0.02), (0.008, length - 0.01), (-0.008, length - 0.01)], -0.007, 0.007, bevel=0.0015)
        small = translated(be.cylinder(0.014, 0.018, segments=20, bevel=0.0015), (0, length, 0))
        bolts = [be.cylinder(0.0045, 0.022, segments=8) for _ in range(2)]
        for x, bolt in zip((-0.0255, 0.0255), bolts):
            be.place(bolt, Matrix.Translation((x, -0.012, 0)) @ be.Y_UP)
        node(f"Rod_{c['number']}", be.merge(big, beam, small, *bolts), "forged", origin=(0, 0, c["center"][2]), parent=parent)


def build_pistons(cfg, parent):
    k = cfg["kinematics"]
    ch = k["compressionHeight"]
    top = k["crankRadius"] + k["rodLength"]
    profile = [(0.0, ch - 0.014), (0.039, ch - 0.014), (0.039, -0.024), (PISTON_R, -0.024), (PISTON_R, ch - 0.016),
               (PISTON_R - 0.0013, ch - 0.015), (PISTON_R - 0.0013, ch - 0.013), (PISTON_R, ch - 0.012), (PISTON_R, ch - 0.009),
               (PISTON_R - 0.0013, ch - 0.008), (PISTON_R - 0.0013, ch - 0.006), (PISTON_R, ch - 0.005), (PISTON_R, ch - 0.0015),
               (PISTON_R - 0.002, ch), (0.0, ch + 0.0015)]
    for c in cfg["cylinders"]:
        body = be.lathe(profile, segments=20)
        bmesh.ops.recalc_face_normals(body, faces=body.faces)
        be.place(body, be.frame((0, 0, 0), c["axis"]))
        pin = be.cylinder(0.011, 0.07, segments=12)  # the wrist pin, along the crank
        origin = [c["axis"][0] * top, c["axis"][1] * top, c["center"][2]]
        node(f"Piston_{c['number']}", be.merge(body, pin), "piston", origin=origin, parent=parent)


def stem(kind):
    """Bank space: the stem's direction, from the valve's face up toward its cam."""
    t = math.radians(VALVES[kind]["tilt"])
    return Vector((-math.sin(t), math.cos(t), 0))


def build_valvetrain(cfg, parent):
    """The cams, the valves and their springs. Returns each cam's centre (x, y) by bank and kind, for the chains."""
    k = cfg["kinematics"]
    base = k["camBaseRadius"]
    centres = {}
    for side, name in ((-1, "right"), (1, "left")):
        frame = be.bank(side)
        turn = frame.to_3x3()
        own = [c for c in cfg["cylinders"] if c["bank"] == name]
        zc = sum(c["center"][2] for c in own) / len(own)
        for kind in ("in", "ex"):
            v = VALVES[kind]
            axis = (turn @ stem(kind)).normalized()
            tappet = math.degrees(math.atan2(-axis.x, -axis.y))  # from the cam's axis toward its tappets
            face = Vector((v["x"], SEAT, 0))
            centre = frame @ (face + stem(kind) * (VALVE_LENGTH + BUCKET + base))

            centres[(name, kind)] = (centre.x, centre.y)
            chain = CHAIN_Z[name] - zc  # the sprocket sits on its bank's chain plane
            parts = [be.cylinder(0.011, 0.47, segments=14), translated(be.cylinder(0.009, chain - 0.23, segments=12), (0, 0, (chain + 0.23) / 2))]
            parts.append(sprocket(CAM_TEETH, CAM_SPROCKET_PITCH, chain - 0.004, chain + 0.004))
            for c in own:
                cz = c["center"][2] - zc
                parts.append(translated(be.cylinder(0.0145, 0.012, segments=18), (0, 0, cz)))  # bearing journal
                peak = k["valveCentres"][c["number"] - 1][1 if kind == "ex" else 0]
                nose = tappet - peak / 2  # where the nose points at crank 0, so it meets the tappet at peak lift
                outline = [toward(nose + b, base + lift_at(k, 2 * b)) for b in (x * 7.5 - 180 for x in range(48))]
                for dz in (-PAIR, PAIR):
                    parts.append(be.prism(outline, cz + dz - 0.0065, cz + dz + 0.0065))
            node(f"Cam_{name}_{kind}", be.merge(*parts), "cam", origin=(centre.x, centre.y, zc), parent=parent)

            valve = [(0.0, 0.0), (v["head"], 0.0), (v["head"], 0.0022), (v["head"] * 0.62, 0.0065), (0.0034, 0.016),
                     (0.0034, VALVE_LENGTH), (0.0, VALVE_LENGTH)]
            for c in own:
                rest = frame @ Vector((v["x"], SEAT, c["center"][2]))
                pieces = []
                for dz in (-PAIR, PAIR):
                    body = be.lathe(valve, segments=12)
                    bmesh.ops.recalc_face_normals(body, faces=body.faces)
                    bucket = translated(be.cylinder(v["bucket"], BUCKET, segments=14, bevel=0.001), (0, 0, VALVE_LENGTH + BUCKET / 2))
                    for piece in (body, bucket):
                        be.place(piece, Matrix.Translation((0, 0, dz)) @ be.frame((0, 0, 0), axis))
                        pieces.append(piece)
                node(f"Valve_{c['number']}_{kind}", be.merge(*pieces), "valve", origin=tuple(rest), parent=parent, axis=tuple(axis))
                build_springs(f"Springs_{c['number']}_{kind}", rest + axis * (VALVE_LENGTH - SPRING_LENGTH), axis, parent)
    return centres


def build_springs(name, seat, axis, parent):
    """A valve pair's two coil springs, standing on their seats along the stems. The pivot is turned about z so its
    local +y runs up the stems, which lets the page compress the coils by scaling y."""
    turns, per_turn = 5.5, 7
    coils = []
    for dz in (-PAIR, PAIR):
        points = []
        for i in range(int(turns * per_turn) + 1):
            t = 2 * math.pi * i / per_turn
            points.append(Vector((SPRING_R * math.cos(t), SPRING_LENGTH * i / (turns * per_turn), dz + SPRING_R * math.sin(t))))
        coils.append(be.tube(points, 0.0016, sides=5, resolution=1))
    pivot = node(name, be.merge(*coils), "spring", origin=tuple(seat), parent=parent)
    pivot.rotation_euler = (0.0, -math.atan2(-axis.x, axis.y), 0.0)  # glTF z is Blender's -y
    pivot["length"] = SPRING_LENGTH


def lobed(r, depth, lobes, centre_x=0.0, points=72):
    return [((r + depth * math.cos(lobes * a)) * math.cos(a) + centre_x, (r + depth * math.cos(lobes * a)) * math.sin(a))
            for a in (2 * math.pi * i / points for i in range(points))]


def ring_prism(outer, inner, z0, z1):
    """A ring between two closed outlines with as many points, extruded from z0 to z1."""
    bm = bmesh.new()
    loops = [[bm.verts.new((x, y, z)) for x, y in outline] for outline, z in ((outer, z0), (outer, z1), (inner, z1), (inner, z0))]
    n = len(outer)
    for a, b in zip(loops, loops[1:] + loops[:1]):
        for i in range(n):
            bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def build_oil_pump(parent):
    """The dry-sump pump's five gerotor stages (one pressure, four scavenge), inside the pump stack: a six-lobed inner
    rotor on the shaft turning inside a seven-lobed outer ring on an offset axis, which follows at six-sevenths speed."""
    stages = [-0.16 + 0.1 * k for k in range(5)]
    inner = [translated(be.cylinder(0.007, 0.5, segments=12), (0, 0, 0.04))]
    outer = []
    for z in stages:
        inner.append(be.prism(lobed(0.019, 0.0035, 6), z - 0.03, z + 0.03))
        outer.append(ring_prism(lobed(0.037, 0.0, 7), lobed(0.0265, 0.0035, 7), z - 0.03, z + 0.03))
    pump = node("Oil_pump", be.merge(*inner), "cam", origin=(PUMP[0], PUMP[1], 0), parent=parent)
    pump["ratio"] = PUMP_RATIO
    pump["lobes"] = [6, 7]
    node("Oil_pump_outer", be.merge(*outer), "forged", origin=(PUMP[0] + PUMP_OFFSET, PUMP[1], 0), parent=parent)


def build_chains(centres, parent):
    """Each bank's timing chain: the outline round the crank's sprocket and its two cam sprockets, running the way the
    crank turns (clockwise from the front), closed by repeating its first point."""
    for bank, z in CHAIN_Z.items():
        circles = [(0.0, 0.0, CRANK_SPROCKET_PITCH)] + [(*centres[(bank, kind)], CAM_SPROCKET_PITCH) for kind in ("in", "ex")]
        samples = [(round(x + r * math.cos(a), 6), round(y + r * math.sin(a), 6)) for x, y, r in circles for a in (2 * math.pi * i / 32 for i in range(32))]
        hull = list(reversed(be.convex_hull(samples)))  # the hull runs anticlockwise; the chain runs clockwise
        path = [(x, y, z) for x, y in hull + hull[:1]]
        chain = bpy.data.objects.new(f"Flow_chain_{bank}", None)
        bpy.context.scene.collection.objects.link(chain)
        chain.parent = parent
        chain["kind"] = "chain"
        chain["points"] = [round(v, 5) for p in path for v in p]
        chain["radius"] = CRANK_SPROCKET_PITCH


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    layout_path, out = argv[0], argv[1]
    with open(layout_path) as handle:
        cfg = json.load(handle)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    MAT.update({
        "forged": be.material("forged_steel", (0.42, 0.43, 0.45), 1.0, 0.32),
        "piston": be.material("piston_aluminium", (0.78, 0.79, 0.80), 1.0, 0.36),
        "cam": be.material("ground_steel", (0.62, 0.63, 0.65), 1.0, 0.22),
        "valve": be.material("valve_steel", (0.55, 0.53, 0.50), 1.0, 0.3),
        "plug": be.material("plug_ceramic", (0.85, 0.85, 0.82), 0.0, 0.35),
        "spring": be.material("spring_steel", (0.32, 0.33, 0.36), 1.0, 0.35),
    })
    root = bpy.data.objects.new("Internals", None)
    bpy.context.scene.collection.objects.link(root)
    build_crank(cfg, root)
    build_rods(cfg, root)
    build_pistons(cfg, root)
    centres = build_valvetrain(cfg, root)
    build_starter_pinion(root)
    build_plugs(cfg, root)
    build_oil_pump(root)
    build_chains(centres, root)
    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    triangles = sum(len(p.vertices) - 2 for obj in meshes for p in obj.data.polygons)
    print(f"build_internals: {len(meshes)} meshes, ~{triangles} triangles")
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_yup=True, export_extras=True, export_normals=True,
                              export_texcoords=False, export_cameras=False, export_lights=False)


if __name__ == "__main__":  # tools/blender/build_turbo.py imports node() from here
    main()
