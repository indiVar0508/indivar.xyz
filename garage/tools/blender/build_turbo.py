"""Models the game turbo kit for the garage and exports a GLB. The real P60B40 is naturally aspirated: this kit is
only in Need for Speed: Most Wanted, which sells turbo upgrades, and the page labels it so.

Run through `npm run build:turbo`, or directly:
blender -b --factory-startup --python tools/blender/build_turbo.py -- <out.glb>

Engine space, glTF axes, as in build_engine.py. A turbo sits on each bank, just outboard of its header collector and
in front of the firewall:
- the turbine takes the collector's exhaust and sends it out through a downpipe that replaces the stock tail pipe;
- the compressor faces forward through an open bellmouth, so its wheel shows;
- a charge pipe climbs the outside of the head and runs forward into that bank's restrictor inlet.
Compressor_<side> is a pivot on the shaft (along z) that the page spins with boost. Flow_* empties carry the charge
pipes' and downpipes' centrelines for the page to animate (extras.points, flattened).
"""
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_engine as be  # noqa: E402
import build_internals as bi  # noqa: E402  (node(): a pivot holding its mesh)

SHAFT_Y = -0.10
TURBINE_Z, COMPRESSOR_Z = -0.34, -0.245
SHAFT_X = 0.52


def flow(kind, name, points, parent):
    empty = bpy.data.objects.new(f"Flow_{kind}_{name}", None)
    bpy.context.scene.collection.objects.link(empty)
    empty.parent = parent
    empty["kind"] = kind
    empty["points"] = [round(v, 5) for p in points for v in p]


def build_turbo(side, root):
    name = "left" if side > 0 else "right"
    x = side * SHAFT_X
    parts = {"iron": [], "cast": [], "steel": [], "charge": [], "coupler": []}
    # Turbine housing: a rounded volute around the shaft, fed from the collector by a short flanged pipe.
    volute = be.lathe([(0.0, -0.028), (0.034, -0.028), (0.054, -0.021), (0.062, -0.004), (0.06, 0.012), (0.046, 0.024), (0.03, 0.027), (0.0, 0.027)], segments=32)
    be.place(volute, be.at(x, SHAFT_Y, TURBINE_Z))
    parts["iron"].append(volute)
    collector_end = Vector((side * 0.40, -0.155, -0.33))
    parts["iron"].append(be.tube([collector_end, Vector((side * 0.44, -0.13, -0.345)), Vector((side * 0.47, -0.115, -0.34))], 0.032, sides=14, resolution=6))
    # Centre section and the compressor housing, with its outlet rising tangentially.
    parts["cast"].append(be.cylinder(0.03, COMPRESSOR_Z - TURBINE_Z - 0.04, segments=20))
    be.place(parts["cast"][-1], be.at(x, SHAFT_Y, (TURBINE_Z + COMPRESSOR_Z) / 2))
    scroll = be.lathe([(0.0, -0.022), (0.03, -0.022), (0.052, -0.016), (0.058, 0.0), (0.054, 0.014), (0.04, 0.02), (0.0, 0.02)], segments=32)
    be.place(scroll, be.at(x, SHAFT_Y, COMPRESSOR_Z))
    parts["cast"].append(scroll)
    bellmouth = be.lathe([(0.03, COMPRESSOR_Z + 0.015), (0.031, COMPRESSOR_Z + 0.05), (0.036, COMPRESSOR_Z + 0.07), (0.046, COMPRESSOR_Z + 0.08),
                          (0.05, COMPRESSOR_Z + 0.084), (0.047, COMPRESSOR_Z + 0.088), (0.04, COMPRESSOR_Z + 0.085), (0.029, COMPRESSOR_Z + 0.07),
                          (0.026, COMPRESSOR_Z + 0.05), (0.026, COMPRESSOR_Z + 0.015)], segments=32)
    be.place(bellmouth, be.at(x, SHAFT_Y, 0))
    parts["steel"].append(bellmouth)
    # Downpipe: from the turbine, down and back under the floor where the stock tail pipe went.
    down = [Vector((x, SHAFT_Y, TURBINE_Z - 0.03)), Vector((side * 0.49, -0.17, -0.385)), Vector((side * 0.40, -0.215, -0.45)), Vector((side * 0.3, -0.22, -0.62))]
    parts["steel"].append(be.tube(down, 0.036, sides=16, resolution=8))
    # Charge pipe: up the outside of the head, forward past the strut tower, and into the restrictor inlet.
    charge = [Vector((x, SHAFT_Y + 0.055, COMPRESSOR_Z)), Vector((x, 0.1, -0.22)), Vector((side * 0.47, 0.3, -0.15)),
              Vector((side * 0.44, 0.34, 0.1)), Vector((side * 0.42, 0.36, 0.38)), Vector((side * 0.25, 0.38, 0.49)),
              Vector((side * 0.13, 0.367, 0.46)), Vector((side * 0.12, 0.365, 0.395))]
    parts["charge"].append(be.tube(charge, 0.025, sides=14, resolution=10))
    for at, axis in ((charge[1], (0, 1, 0)), (charge[-1] + Vector((0, 0, 0.01)), (side * 0.12, -0.02, 1.0))):
        coupler = be.cylinder(0.031, 0.04, segments=20)
        be.place(coupler, be.frame(tuple(at), axis))
        parts["coupler"].append(coupler)
    for mat, meshes in parts.items():
        if meshes:
            bi.node(f"Turbo_{name}_{mat}", be.merge(*meshes), mat, parent=root)
    # The compressor wheel's inducer, in the bellmouth's throat: a hub and eight swept blades.
    blades = [be.cylinder(0.008, 0.026, segments=12)]
    for k in range(8):
        blade = be.box(0.017, 0.0016, 0.02)
        be.place(blade, Matrix.Rotation(2 * math.pi * k / 8, 4, "Z") @ Matrix.Translation((0.0135, 0, 0)) @ Matrix.Rotation(0.5, 4, "X"))
        blades.append(blade)
    bi.node(f"Compressor_{name}", be.merge(*blades), "steel", origin=(x, SHAFT_Y, COMPRESSOR_Z + 0.03), parent=root)
    flow("exhaust", f"turbo_{name}", [collector_end, Vector((x, SHAFT_Y, TURBINE_Z))] + down[1:], root)
    flow("charge", name, charge, root)


def main():
    out = sys.argv[sys.argv.index("--") + 1]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bi.MAT.update({
        "iron": be.material("turbine_iron", (0.16, 0.15, 0.14), 0.7, 0.55),
        "cast": be.material("compressor_aluminium", (0.6, 0.61, 0.62), 0.9, 0.35),
        "steel": be.material("turbo_steel", (0.56, 0.56, 0.57), 1.0, 0.34),
        "charge": be.material("charge_pipe", (0.66, 0.67, 0.69), 1.0, 0.34),
        "coupler": be.material("silicone_coupler", (0.02, 0.08, 0.45), 0.0, 0.45),
    })
    root = bpy.data.objects.new("Turbo", None)
    bpy.context.scene.collection.objects.link(root)
    for side in (-1, 1):
        build_turbo(side, root)
    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    triangles = sum(len(p.vertices) - 2 for obj in meshes for p in obj.data.polygons)
    print(f"build_turbo: {len(meshes)} meshes, ~{triangles} triangles")
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_yup=True, export_extras=True, export_normals=True,
                              export_texcoords=False, export_cameras=False, export_lights=False)


if __name__ == "__main__":
    main()
