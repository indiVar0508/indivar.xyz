"""Normalizes the Sketchfab M3 GTR into the garage's car contract (spec section 4.2).

Run through `npm run prepare:car`, or directly:
blender -b --factory-startup --python tools/blender/prepare_car.py -- <scene.gltf> <out.glb> <car-map.json> <report.json>
"""
import json
import math
import sys

import bpy
from mathutils import Matrix, Vector


def cli_args():
    argv = sys.argv[sys.argv.index("--") + 1:]
    return argv[0], argv[1], argv[2], argv[3]


def key_of(name, prefix):
    key = name[len(prefix):] if name.startswith(prefix) else name
    return key[:-2] if key.endswith("_0") else key


def bake(objects, matrix=None):
    """Bakes each object's world transform (optionally pre-multiplied by `matrix`) into its mesh data."""
    for obj in objects:
        world = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = matrix @ world if matrix is not None else world
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def bounds(objects):
    lo = Vector((math.inf,) * 3)
    hi = Vector((-math.inf,) * 3)
    for obj in objects:
        for vertex in obj.data.vertices:
            point = obj.matrix_world @ vertex.co
            lo = Vector(map(min, lo, point))
            hi = Vector(map(max, hi, point))
    return lo, hi


def to_car_space(v):
    """Blender (Z up, car facing -Y) to glTF car space (Y up, car facing +Z)."""
    return [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]


def empty(name, location, parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    obj.matrix_world = Matrix.Translation(location)
    if parent is not None:
        obj.parent = parent
        obj.matrix_parent_inverse = parent.matrix_world.inverted()
    return obj


def main():
    src, out, map_path, report_path = cli_args()
    with open(map_path) as handle:
        cfg = json.load(handle)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]

    # 1. Bake the Sketchfab/FBX hierarchy into the meshes and drop the empties.
    bake(meshes)
    for obj in [o for o in bpy.context.scene.objects if o.type != "MESH"]:
        bpy.data.objects.remove(obj, do_unlink=True)

    by_key = {key_of(o.name, cfg["sourcePrefix"]): o for o in meshes}
    needed = cfg["hood"] + cfg["paint"] + [cfg["glass"], cfg["tyres"]]
    missing = [key for key in needed if key not in by_key]
    if missing:
        raise SystemExit(f"source model is missing meshes: {missing}")

    # 2. Face the car down -Y (glTF +Z), scale to real length, centre on the shell, tyres on the ground.
    bake(meshes, Matrix.Rotation(math.pi, 4, "Z"))
    lo, hi = bounds(meshes)
    factor = cfg["lengthMeters"] / (hi.y - lo.y)
    shell_lo, shell_hi = bounds([by_key[k] for k in cfg["paint"]])
    tyre_lo, _ = bounds([by_key[cfg["tyres"]]])
    offset = Vector((-(shell_lo.x + shell_hi.x) / 2, -(lo.y + hi.y) / 2, -tyre_lo.z))
    bake(meshes, Matrix.Scale(factor, 4) @ Matrix.Translation(offset))

    # 3. Names and roles.
    for key, obj in by_key.items():
        if key in cfg["rename"]:
            obj.name = cfg["rename"][key]
        if key in cfg["paint"]:
            obj["role"] = "paint"

    # 4. Measurements, taken before any parenting.
    panel = by_key[cfg["hood"][0]]
    panel_lo, panel_hi = bounds([panel])
    panel_points = [v.co for v in panel.data.vertices]
    hinge_y = panel_hi.y  # the hood's rear edge; the car faces -Y
    hinge_z = max(p.z for p in panel_points if p.y > hinge_y - 0.02)
    hinge = Vector((0.0, hinge_y, hinge_z))

    tyre_points = [v.co for v in by_key[cfg["tyres"]].data.vertices]
    wheels = {}
    # Car's left is +X in both Blender and glTF; the front is -Y in Blender.
    for label, side, end in (("FL", 1, -1), ("FR", -1, -1), ("RL", 1, 1), ("RR", -1, 1)):
        pts = [p for p in tyre_points if p.x * side > 0 and p.y * end > 0]
        wheels[label] = Vector((
            (min(p.x for p in pts) + max(p.x for p in pts)) / 2,
            (min(p.y for p in pts) + max(p.y for p in pts)) / 2,
            (min(p.z for p in pts) + max(p.z for p in pts)) / 2,
        ))
    engine_bay = Vector((0.0, (panel_lo.y + panel_hi.y) / 2, wheels["FL"].z))
    final_lo, final_hi = bounds(meshes)

    # 5. Hierarchy: Hood pivots on the hinge; everything else sits under Body; markers at the root.
    hood = empty("Hood", hinge)
    body = empty("Body", Vector((0.0, 0.0, 0.0)))
    bpy.context.view_layer.update()  # make the new empties' world matrices current before parenting
    hood_meshes = {by_key[k].name for k in cfg["hood"]}
    for obj in meshes:
        parent = hood if obj.name in hood_meshes else body
        obj.parent = parent
        obj.matrix_parent_inverse = parent.matrix_world.inverted()
    for label, centre in wheels.items():
        empty(f"Marker_Wheel_{label}", centre)
    empty("Marker_EngineBay", engine_bay)

    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB",
        export_extras=True,
        export_yup=True,
        export_apply=False,
        export_cameras=False,
        export_lights=False,
        export_image_format="AUTO",
    )

    triangles = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
    report = {
        "scale": round(factor, 4),
        "boundsMin": to_car_space(Vector((final_lo.x, final_hi.y, final_lo.z))),
        "boundsMax": to_car_space(Vector((final_hi.x, final_lo.y, final_hi.z))),
        "hinge": to_car_space(hinge),
        "hoodLength": round(panel_hi.y - panel_lo.y, 4),
        "hoodHalfWidth": round((panel_hi.x - panel_lo.x) / 2, 4),
        "wheels": {k: to_car_space(v) for k, v in wheels.items()},
        "engineBay": to_car_space(engine_bay),
        "triangles": triangles,
    }
    with open(report_path, "w") as handle:
        json.dump(report, handle, indent=2)
    print("PREPARE_REPORT", json.dumps(report))


main()
