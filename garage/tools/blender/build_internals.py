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
Each of those is a pivot with no mesh of its own; its mesh hangs off a child named <name>_mesh.

layout.json carries the cylinders (src/engine/geometry.ts) and the timing (p60.wasm), so each cam lobe's nose meets
its tappet at the crank angle where the crate puts peak lift. Sizes the crate doesn't own (journals, webs, valve
heads) are illustrative.
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

PIN_R = 0.024
JOURNAL_R = 0.03
WEB_T = 0.014
ROD_W = 0.02  # each rod's width along the crank; two rods share a pin
PISTON_R = 0.0465  # in a 94 mm bore
SEAT = 0.252  # valve faces, measured up the bore from the crank axis
VALVE_LENGTH = 0.088
BUCKET = 0.012
PAIR = 0.018  # each valve of a pair sits this far in front of or behind the bore's centre
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
    parts.append(translated(be.cylinder(0.02, 0.185, segments=20), (0, 0, 0.3075)))  # the snout, to the damper
    parts.append(translated(be.cylinder(0.034, 0.012, segments=32, bevel=0.002), (0, 0, 0.25)))  # timing gear
    parts.append(translated(be.cylinder(0.062, 0.015, segments=40, bevel=0.003), (0, 0, -0.2425)))  # flywheel flange
    return node("Crank", be.merge(*parts), "forged", parent=parent)


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
    k = cfg["kinematics"]
    base = k["camBaseRadius"]
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

            parts = [be.cylinder(0.011, 0.47, segments=14), translated(be.cylinder(0.009, 0.03, segments=12), (0, 0, 0.25))]
            teeth = [toward(a * 360 / 56, 0.040 if a % 2 else 0.036) for a in range(56)]
            parts.append(be.prism(teeth, 0.262, 0.270))  # the sprocket
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
    })
    root = bpy.data.objects.new("Internals", None)
    bpy.context.scene.collection.objects.link(root)
    build_crank(cfg, root)
    build_rods(cfg, root)
    build_pistons(cfg, root)
    build_valvetrain(cfg, root)
    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    triangles = sum(len(p.vertices) - 2 for obj in meshes for p in obj.data.polygons)
    print(f"build_internals: {len(meshes)} meshes, ~{triangles} triangles")
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_yup=True, export_extras=True, export_normals=True,
                              export_texcoords=False, export_cameras=False, export_lights=False)


main()
