"""Models the P60B40 V8 and its engine bay for the garage, bakes ambient occlusion, and exports a GLB.

Run through `npm run build:engine`, or directly:
blender -b --factory-startup --python tools/blender/build_engine.py -- <layout.json> <out.glb> <ao.png>

Everything is modelled in glTF axes (x = the car's left, y = up, z = toward the nose) and turned into Blender's
z-up axes as each mesh is made. Engine parts are in engine space (origin on the crank axis, mid-block); the bay is in
car space. The airbox, cam covers, heads, belt drive and dry-sump pump follow BMW Museum photos of the engine (see
docs/superpowers/specs/2026-10-11-engine-and-radio-design.md); the headers, oil tank, plumbing and bay are
illustrative. Branding is left off.
"""
import json
import math
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

TO_BLENDER = Matrix.Rotation(math.radians(90), 4, "X")
S45 = math.sqrt(0.5)
BELT_Z = 0.40  # the accessory belt's plane, in front of the timing case
ATLAS = 2048
AO_DISTANCE = 0.16  # metres: contact shadows in seams and under parts, not a sky light
WEAVE_TILE = 0.024  # metres per carbon weave tile (eight 3 mm tows)
FIN_TILE = 0.02  # metres per radiator fin tile


def cli_args():
    argv = sys.argv[sys.argv.index("--") + 1:]
    return argv[0], argv[1], argv[2]


# ---------------------------------------------------------------- materials


def srgb(linear):
    return np.where(linear <= 0.0031308, linear * 12.92, 1.055 * np.power(np.clip(linear, 0, 1), 1 / 2.4) - 0.055)


def packed_image(name, rgb):
    """A packed 8-bit sRGB image from a linear float array (h, w, 3)."""
    h, w, _ = rgb.shape
    image = bpy.data.images.new(name, width=w, height=h, alpha=False)
    rgba = np.ones((h, w, 4), dtype=np.float32)
    rgba[..., :3] = srgb(rgb)
    image.pixels.foreach_set(rgba.ravel())
    image.pack()
    return image


def weave_image(size=512, tows=8):
    """2x2 twill carbon: tows alternate over and under in pairs, so the pattern steps diagonally."""
    u = (np.arange(size) + 0.5) / size * tows
    U, V = np.meshgrid(u, u)
    i, j = np.floor(U), np.floor(V)
    fu, fv = U - i, V - j
    warp = ((i + j) % 4) < 2
    across = np.where(warp, np.sin(np.pi * fu), np.sin(np.pi * fv)) ** 0.7
    sheen = np.where(warp, 1.0, 0.45)
    value = 0.010 + 0.055 * across * sheen
    return packed_image("carbon_weave", np.repeat(value[..., None], 3, axis=2) * np.array([1.0, 1.02, 1.06]))


def fin_image(size=128, fins=10):
    """Radiator core: bright folded fins between dark gaps, crossed by flat coolant tubes."""
    u = (np.arange(size) + 0.5) / size
    U, V = np.meshgrid(u, u)
    fin = np.abs(np.sin(np.pi * U * fins)) ** 3
    tube = (np.abs(((V * 2) % 1) - 0.5) < 0.09).astype(float)
    value = np.where(tube > 0, 0.30, 0.05 + 0.32 * fin)
    return packed_image("radiator_fins", np.repeat(value[..., None], 3, axis=2))


def material(name, color, metallic, roughness, coat=0.0, image=None, vertex_color=False):
    mat = bpy.data.materials.new(name)
    tree = mat.node_tree
    bsdf = tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if coat:
        bsdf.inputs["Coat Weight"].default_value = coat
        bsdf.inputs["Coat Roughness"].default_value = 0.04
    if image is not None:
        coords = tree.nodes.new("ShaderNodeTexCoord")
        mapping = tree.nodes.new("ShaderNodeMapping")
        mapping.name = "tiling"
        texture = tree.nodes.new("ShaderNodeTexImage")
        texture.image = image
        tree.links.new(coords.outputs["UV"], mapping.inputs["Vector"])
        tree.links.new(mapping.outputs["Vector"], texture.inputs["Vector"])
        tree.links.new(texture.outputs["Color"], bsdf.inputs["Base Color"])
    if vertex_color:
        attribute = tree.nodes.new("ShaderNodeVertexColor")
        attribute.layer_name = "Col"
        tree.links.new(attribute.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def make_materials():
    return {
        "cast": material("cast_aluminium", (0.56, 0.57, 0.58), 0.85, 0.42),
        "machined": material("machined_aluminium", (0.86, 0.87, 0.88), 1.0, 0.18),
        "carbon": material("carbon", (1, 1, 1), 0.0, 0.3, coat=1.0, image=weave_image()),
        "black": material("black_anodised", (0.022, 0.022, 0.024), 0.4, 0.55),
        "rubber": material("rubber", (0.016, 0.016, 0.017), 0.0, 0.8),
        "braided": material("braided_steel", (0.34, 0.34, 0.35), 1.0, 0.45),
        "header": material("header_steel", (1, 1, 1), 1.0, 0.34, vertex_color=True),
        "blue": material("anodised_blue", (0.02, 0.07, 0.42), 1.0, 0.3),
        "red": material("anodised_red", (0.45, 0.015, 0.02), 1.0, 0.3),
        "bay": material("bay_paint", (0.30, 0.31, 0.32), 0.5, 0.45),
        "floor": material("bay_floor", (0.02, 0.02, 0.022), 0.2, 0.75),
        "foil": material("heat_shield", (0.80, 0.58, 0.28), 1.0, 0.32),
        "core": material("radiator_core", (1, 1, 1), 0.8, 0.5, image=fin_image()),
        "plastic": material("reservoir", (0.62, 0.62, 0.60), 0.0, 0.35),
        "yellow": material("loom_sheath", (0.62, 0.42, 0.02), 0.0, 0.55),
        "silicone": material("silicone_hose", (0.025, 0.03, 0.05), 0.0, 0.5),
    }


MAT = {}

# ---------------------------------------------------------------- geometry helpers


def place(bm, matrix):
    bmesh.ops.transform(bm, matrix=matrix, verts=bm.verts)
    if matrix.determinant() < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)


def at(x, y, z):
    return Matrix.Translation((x, y, z))


def frame(origin, z_axis, up=(0, 1, 0)):
    """A matrix whose local z points along `z_axis`, placed at `origin`."""
    z = Vector(z_axis).normalized()
    u = Vector(up)
    if abs(z.dot(u)) > 0.98:
        u = Vector((1, 0, 0))
    x = u.cross(z).normalized()
    y = z.cross(x)
    m = Matrix((x, y, z)).transposed().to_4x4()
    m.translation = Vector(origin)
    return m


def bank(side):
    """A bank's frame: local x points outward, local y up the bank's cylinder axis, local z along the crank.
    `side` is +1 for the left bank (cylinders 5-8, toward +x) and -1 for the right."""
    a = Vector((side * S45, S45, 0))
    p = Vector((side * S45, -S45, 0))
    return Matrix((p, a, Vector((0, 0, 1)))).transposed().to_4x4()


Y_UP = Matrix.Rotation(-math.pi / 2, 4, "X")  # turns a primitive's z axis to point up (+y)
X_OUT = Matrix.Rotation(math.pi / 2, 4, "Y")  # turns a primitive's z axis to point along +x


def box(sx, sy, sz, bevel=0.0, segments=2):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    if bevel:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=segments, profile=0.5, affect="EDGES", clamp_overlap=True)
    return bm


def cylinder(r, h, segments=24, r2=None, bevel=0.0, caps=True):
    """Along local z, centred on the origin."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=segments, radius1=r, radius2=r if r2 is None else r2, depth=h)
    bm.normal_update()
    if bevel and caps:
        rims = [e for e in bm.edges if e.is_manifold and e.calc_face_angle(0) > math.radians(60)]
        bmesh.ops.bevel(bm, geom=rims, offset=bevel, segments=2, profile=0.5, affect="EDGES", clamp_overlap=True)
    return bm


def lathe(profile, segments=32):
    """Revolves [(radius, z)] around local z. Profiles that run toward +z on the outside face outward."""
    bm = bmesh.new()
    rings = []
    for k in range(segments):
        angle = 2 * math.pi * k / segments
        c, s = math.cos(angle), math.sin(angle)
        rings.append([bm.verts.new((r * c, r * s, z)) for r, z in profile])
    for k in range(segments):
        a, b = rings[k], rings[(k + 1) % segments]
        for i in range(len(profile) - 1):
            if profile[i][0] == 0 and profile[i + 1][0] == 0:
                continue
            bm.faces.new((a[i], b[i], b[i + 1], a[i + 1]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
    return bm


def prism(polygon, z0, z1, bevel=0.0, segments=2):
    """Extrudes a closed polygon in the xy plane from z0 to z1."""
    bm = bmesh.new()
    face = bm.faces.new([bm.verts.new((x, y, z0)) for x, y in polygon])
    extruded = bmesh.ops.extrude_face_region(bm, geom=[face])
    top = [g for g in extruded["geom"] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(0, 0, z1 - z0), verts=top)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bevel:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=segments, profile=0.5, affect="EDGES", clamp_overlap=True)
    return bm


def superellipsoid(rx, ry, rz, e_vertical, e_horizontal, nu=64, nv=24):
    """A rounded box: |x/rx|^(2/e) ... = 1. Small exponents give flat faces and tight, smooth edges."""
    def c(w, e):
        return math.copysign(abs(math.cos(w)) ** e, math.cos(w))

    def s(w, e):
        return math.copysign(abs(math.sin(w)) ** e, math.sin(w))

    bm = bmesh.new()
    rows = []
    for j in range(1, nv):
        v = -math.pi / 2 + math.pi * j / nv
        rows.append([bm.verts.new((rx * c(v, e_vertical) * c(u, e_horizontal), ry * s(v, e_vertical), rz * c(v, e_vertical) * s(u, e_horizontal)))
                     for u in (-math.pi + 2 * math.pi * i / nu for i in range(nu))])
    for lower, upper in zip(rows, rows[1:]):
        for i in range(nu):
            bm.faces.new((lower[i], lower[(i + 1) % nu], upper[(i + 1) % nu], upper[i]))
    bottom, top = bm.verts.new((0, -ry, 0)), bm.verts.new((0, ry, 0))
    for i in range(nu):
        bm.faces.new((bottom, rows[0][(i + 1) % nu], rows[0][i]))
        bm.faces.new((top, rows[-1][i], rows[-1][(i + 1) % nu]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def superellipsoid_top(x, z, rx, ry, rz, e_vertical, e_horizontal):
    """Height of a superellipsoid's upper surface above its centre at (x, z)."""
    across = (abs(x / rx) ** (2 / e_horizontal) + abs(z / rz) ** (2 / e_horizontal)) ** (e_horizontal / e_vertical)
    return ry * max(0.0, 1 - across) ** (e_vertical / 2)


def tube(points, radius, sides=12, resolution=10, cyclic=False):
    """A smooth round tube through `points` (glTF space)."""
    curve = bpy.data.curves.new("tube", "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = radius
    curve.bevel_resolution = max(0, (sides - 4) // 2)
    curve.resolution_u = resolution
    curve.use_fill_caps = not cyclic
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, co in zip(spline.bezier_points, points):
        point.co = co
        point.handle_left_type = point.handle_right_type = "AUTO"
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new("tube", curve)
    bpy.context.scene.collection.objects.link(obj)
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bpy.data.objects.remove(obj)
    bpy.data.curves.remove(curve)
    bpy.data.meshes.remove(mesh)
    return bm


def convex_hull(points):
    points = sorted(set(points))
    def turn(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lower, upper = [], []
    for p in points:
        while len(lower) >= 2 and turn(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(points):
        while len(upper) >= 2 and turn(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def belt(pulleys, z, width=0.022, thickness=0.005):
    """A flat belt wrapped around the outside of `pulleys` [(x, y, radius)]: their convex hull, in the plane z."""
    samples = [(round(x + r * math.cos(a), 6), round(y + r * math.sin(a), 6))
               for x, y, r in pulleys for a in (2 * math.pi * k / 64 for k in range(64))]
    hull = convex_hull(samples)
    n = len(hull)
    normals = []
    for i in range(n):
        (x0, y0), (x1, y1) = hull[i - 1], hull[(i + 1) % n]
        tx, ty = x1 - x0, y1 - y0
        length = math.hypot(tx, ty)
        normals.append((ty / length, -tx / length))  # outward for a counter-clockwise hull
    bm = bmesh.new()
    loops = []
    for offset, dz in ((0, -width / 2), (0, width / 2), (thickness, width / 2), (thickness, -width / 2)):
        loops.append([bm.verts.new((x + nx * offset, y + ny * offset, z + dz)) for (x, y), (nx, ny) in zip(hull, normals)])
    for a, b in zip(loops, loops[1:] + loops[:1]):
        for i in range(n):
            bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def bolt(r=0.0065):
    """A hex-head bolt with a washer, pointing along local z, seated at z = 0."""
    head = cylinder(r, r * 0.9, segments=6, bevel=r * 0.12 if r >= 0.008 else 0.0)
    bmesh.ops.translate(head, vec=(0, 0, r * 0.45 + r * 0.25), verts=head.verts)
    washer = cylinder(r * 1.35, r * 0.25, segments=10)
    bmesh.ops.translate(washer, vec=(0, 0, r * 0.125), verts=washer.verts)
    return merge(head, washer)


def merge(*meshes):
    bm = bmesh.new()
    for other in meshes:
        mesh = bpy.data.meshes.new("merge")
        other.to_mesh(mesh)
        other.free()
        bm.from_mesh(mesh)
        bpy.data.meshes.remove(mesh)
    return bm


# ---------------------------------------------------------------- objects and parts

PARTS = {}


def make(part, name, bm, mat, matrix=None, colors=None, sharp=35):
    """Turns a glTF-space bmesh into an object in `part`. `colors` maps a glTF-space position to linear RGB."""
    if matrix is not None:
        place(bm, matrix)
    if colors is not None:
        layer = bm.loops.layers.color.new("Col")
        for face in bm.faces:
            for loop in face.loops:
                loop[layer] = (*colors(loop.vert.co), 1.0)
    place(bm, TO_BLENDER)
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
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    PARTS.setdefault(part, []).append(obj)
    return obj


def bank_point(side, x, y, z):
    return bank(side) @ Vector((x, y, z))


# ---------------------------------------------------------------- the engine (engine space)

BLOCK_HALF = [(0.207, -0.115), (0.207, 0.010), (0.172, 0.054), (0.237, 0.119), (0.117, 0.239), (0.0, 0.122)]
Z_REAR, Z_FRONT = -0.27, 0.245


def mirrored(half):
    """A closed outline from a left half that runs from the bottom to the centre top."""
    return half + [(-x, y) for x, y in reversed(half[:-1])]


def build_block(cylinders):
    make("layout", "block", prism(mirrored(BLOCK_HALF), Z_REAR, Z_FRONT, bevel=0.006), "cast")
    flange = [(x * 1.1, y * 1.08 - 0.004) for x, y in BLOCK_HALF]
    make("layout", "bellhousing_flange", prism(mirrored(flange), Z_REAR - 0.02, Z_REAR, bevel=0.004), "cast")
    for k, (x, y) in enumerate(mirrored(flange)):
        if k % 2 == 0:
            make("layout", f"flange_bolt_{k}", bolt(0.007), "machined", at(x * 0.92, y * 0.94 + 0.004, Z_REAR - 0.02) @ Matrix.Rotation(math.pi, 4, "X"))
    for side in (-1, 1):
        for z in (-0.21, -0.105, 0.0, 0.105, 0.21):
            make("layout", "rib", box(0.014, 0.11, 0.012, bevel=0.003), "cast", at(side * 0.211, -0.058, z))
            make("layout", "main_cap_bolt", bolt(0.007), "machined", at(side * 0.214, -0.11, z) @ (X_OUT if side > 0 else Matrix.Rotation(-math.pi / 2, 4, "Y")))
        for z in (-0.2, -0.1, 0.0, 0.1, 0.2):
            boss = cylinder(0.012, 0.13, segments=16, bevel=0.003)
            make("layout", "head_bolt_boss", boss, "cast", bank(side) @ at(0.083, 0.17, z - (0.011 if side > 0 else 0)) @ Y_UP)
        # Engine mounts: a cast arm on each side of the block onto a rubber mount on the subframe.
        make("layout", "mount_arm", box(0.11, 0.05, 0.08, bevel=0.008), "cast", at(side * 0.262, -0.035, 0.05))
        make("layout", "mount_rubber", cylinder(0.034, 0.05, segments=20, bevel=0.004), "rubber", at(side * 0.315, -0.085, 0.05) @ Y_UP)
        make("layout", "knock_sensor", cylinder(0.014, 0.02, segments=12, bevel=0.002), "black", bank(side) @ at(0.088, 0.12, -0.05) @ X_OUT)


def build_heads(cylinders):
    for side in (-1, 1):
        name = "left" if side > 0 else "right"
        own = [c for c in cylinders if (c["bank"] == "left") == (side > 0)]
        zc = sum(c["center"][2] for c in own) / len(own)
        b = bank(side)
        make("heads", f"head_{name}", box(0.19, 0.11, 0.5, bevel=0.008), "cast", b @ at(0, 0.305, zc))
        for y in (0.272, 0.300, 0.328):
            make("heads", "head_rib", box(0.012, 0.007, 0.47, bevel=0.002), "cast", b @ at(0.099, y, zc))
        for c in own:
            cz = c["center"][2]
            make("heads", "intake_port_flange", box(0.02, 0.06, 0.075, bevel=0.005), "cast", b @ at(-0.1, 0.31, cz))
            make("heads", "coil_plug", box(0.024, 0.016, 0.032, bevel=0.004), "black", b @ at(-0.074, 0.41, cz))
        make("heads", f"cam_cover_gasket_{name}", box(0.174, 0.006, 0.476, bevel=0.002), "black", b @ at(0, 0.361, zc))
        make("heads", f"cam_cover_{name}", box(0.168, 0.044, 0.47, bevel=0.016, segments=3), "carbon", b @ at(0, 0.382, zc))
        make("heads", f"cam_cover_ridge_{name}", box(0.07, 0.014, 0.40, bevel=0.006), "carbon", b @ at(0.012, 0.407, zc))
        for x in (-0.07, 0.07):
            for k in range(-2, 3):
                make("heads", "cam_cover_bolt", bolt(0.006), "machined", b @ at(x, 0.404, zc + k * 0.11) @ Y_UP)
        loom = [bank_point(side, -0.088, 0.372, z) for z in (zc - 0.25, zc - 0.1, zc + 0.1, zc + 0.22)]
        loom += [bank_point(side, -0.07, 0.38, zc + 0.27), Vector((side * 0.06, 0.33, 0.30))]
        make("heads", f"ignition_loom_{name}", tube(loom, 0.0075, sides=10), "yellow")
        make("heads", "cam_sensor", cylinder(0.012, 0.035, segments=14, bevel=0.002), "black", b @ at(0.05, 0.33, zc + 0.262))


TIMING_HALF = [(0.0, -0.14), (0.212, -0.125), (0.212, 0.02), (0.265, 0.105), (0.36, 0.205), (0.345, 0.27),
               (0.27, 0.35), (0.20, 0.335), (0.14, 0.27), (0.0, 0.16)]
THERMOSTAT = (-0.085, 0.24)  # coolant out, top right of the timing case
PUMP_INLET = (0.16, -0.065)  # coolant in, low on the left, so the lower hose stays below the belt drive
PULLEYS = {  # x, y, radius on the belt plane
    "crank": (0.0, 0.0, 0.075),
    "tensioner": (-0.15, 0.03, 0.03),
    "alternator": (-0.215, 0.175, 0.034),
    "water_pump": (0.0, 0.16, 0.05),
    "idler": (0.125, 0.085, 0.032),
}


def pulley(r, z0=BELT_Z - 0.014, z1=BELT_Z + 0.014):
    lip = 0.004
    return lathe([(0.0, z0), (r - 0.003, z0), (r + lip, z0 + 0.003), (r + lip, z0 + 0.006), (r, z0 + 0.008),
                  (r, z1 - 0.008), (r + lip, z1 - 0.006), (r + lip, z1 - 0.003), (r - 0.003, z1), (0.0, z1)], segments=40)


def build_front():
    make("crank", "timing_case", prism(mirrored(TIMING_HALF), Z_FRONT, 0.30, bevel=0.008), "cast")
    for side in (-1, 1):
        drive = bank_point(side, 0, 0.345, 0)
        make("crank", "cam_drive_cover", cylinder(0.068, 0.02, segments=40, bevel=0.006), "cast", at(drive.x, drive.y, 0.31))
        for k in range(6):
            a = 2 * math.pi * k / 6
            make("crank", "cam_drive_bolt", bolt(0.005), "machined", at(drive.x + 0.056 * math.cos(a), drive.y + 0.056 * math.sin(a), 0.32))
    for k, (x, y) in enumerate(mirrored(TIMING_HALF)):
        make("crank", "timing_case_bolt", bolt(0.0055), "machined", at(x * 0.93, y * 0.93 + 0.01, 0.30))
    # Crank damper with its rubber ring, then the belt pulley on the belt plane.
    make("crank", "damper", lathe([(0.0, 0.30), (0.035, 0.30), (0.035, 0.315), (0.082, 0.315), (0.085, 0.32), (0.085, 0.355),
                                   (0.082, 0.36), (0.03, 0.36), (0.03, BELT_Z - 0.014), (0.0, BELT_Z - 0.014)], segments=48), "machined")
    make("crank", "damper_rubber", lathe([(0.0845, 0.333), (0.0855, 0.335), (0.0855, 0.341), (0.0845, 0.343)], segments=48), "rubber")
    for name, (x, y, r) in PULLEYS.items():
        make("crank", f"pulley_{name}", pulley(r), "machined" if name == "crank" else "black", at(x, y, 0))
        make("crank", f"pulley_bolt_{name}", bolt(0.008), "machined", at(x, y, BELT_Z + 0.014))
    make("crank", "belt", belt(list(PULLEYS.values()), BELT_Z), "rubber")
    # Alternator behind its pulley, finned, on a bracket off the timing case.
    ax, ay, _ = PULLEYS["alternator"]
    fins = [(0.0, 0.29)] + [(0.058 + (0.004 if k % 2 else 0), 0.29 + 0.008 * k) for k in range(12)] + [(0.035, 0.386), (0.012, 0.386), (0.012, BELT_Z), (0.0, BELT_Z)]
    make("crank", "alternator", lathe(fins, segments=40), "cast", at(ax, ay, 0))
    make("crank", "alternator_bracket", box(0.07, 0.03, 0.05, bevel=0.006), "cast", at(ax + 0.03, ay - 0.06, 0.29) @ Matrix.Rotation(-0.6, 4, "Z"))
    tx, ty, _ = PULLEYS["tensioner"]
    make("crank", "tensioner_arm", box(0.09, 0.022, 0.016, bevel=0.005), "black", at(tx + 0.035, ty + 0.035, BELT_Z - 0.03) @ Matrix.Rotation(0.8, 4, "Z"))
    # Water pump, its shaft out to the pulley, and the coolant necks the radiator hoses meet.
    wx, wy, _ = PULLEYS["water_pump"]
    make("crank", "water_pump", cylinder(0.055, 0.05, segments=32, bevel=0.006), "cast", at(wx, wy, 0.325))
    make("crank", "water_pump_shaft", cylinder(0.012, 0.05, segments=16), "machined", at(wx, wy, 0.372))
    make("crank", "thermostat", cylinder(0.03, 0.04, segments=24, bevel=0.004), "cast", at(*THERMOSTAT, 0.32))
    make("crank", "upper_neck", cylinder(0.021, 0.06, segments=20), "machined", at(*THERMOSTAT, 0.355))
    make("crank", "lower_neck", cylinder(0.021, 0.05, segments=20), "machined", at(*PUMP_INLET, 0.32))


AIRBOX = dict(center=(0.0, 0.388, -0.005), radii=(0.17, 0.07, 0.305), exponents=(0.32, 0.28))


def build_intake(cylinders):
    (cx, cy, cz), (rx, ry, rz), (ev, eh) = AIRBOX["center"], AIRBOX["radii"], AIRBOX["exponents"]
    make("restrictors", "airbox", superellipsoid(rx, ry, rz, ev, eh, nu=72, nv=28), "carbon", at(cx, cy, cz))
    seam = [Vector((rx * 1.004 * math.copysign(abs(math.cos(t)) ** eh, math.cos(t)), cy - 0.012,
                    cz + rz * 1.004 * math.copysign(abs(math.sin(t)) ** eh, math.sin(t)))) for t in (2 * math.pi * k / 40 for k in range(40))]
    make("restrictors", "airbox_seam", tube(seam, 0.004, sides=8, resolution=4, cyclic=True), "black")
    for k in range(18):  # bolts around the lid, just inside its edge
        t = 2 * math.pi * (k + 0.5) / 18
        x = 0.86 * rx * math.copysign(abs(math.cos(t)) ** eh, math.cos(t))
        z = 0.88 * rz * math.copysign(abs(math.sin(t)) ** eh, math.sin(t))
        if z > 0.2 and abs(x) > 0.05:
            continue  # the inlets' nacelles sit here
        make("restrictors", "airbox_bolt", bolt(0.0055), "machined", at(cx + x, cy + superellipsoid_top(x, z, rx, ry, rz, ev, eh) - 0.0015, cz + z) @ Y_UP)
    for side in (-1, 1):
        make("restrictors", "inlet_nacelle", superellipsoid(0.075, 0.062, 0.10, 0.45, 0.45, nu=40, nv=16), "carbon", at(side * 0.105, 0.372, 0.215))
        inlet = frame((side * 0.105, 0.366, 0.24), (side * 0.12, -0.02, 1.0))
        make("restrictors", "inlet_tube", lathe([(0.051, 0.0), (0.051, 0.1)], segments=40), "carbon", inlet)
        make("restrictors", "inlet_lip", lathe([(0.051, 0.1), (0.056, 0.106), (0.058, 0.115), (0.055, 0.123), (0.049, 0.125),
                                                 (0.044, 0.121), (0.042, 0.112), (0.042, 0.06)], segments=40), "machined", inlet)
        # Inside: the throat narrows to the 30.4 mm restrictor (verified: two 30.4 mm restrictors).
        make("restrictors", "restrictor", lathe([(0.042, 0.06), (0.04, 0.03), (0.0152, 0.02), (0.0152, -0.01), (0.0, -0.01)], segments=40), "black", inlet)
    for c in cylinders:
        side = 1 if c["bank"] == "left" else -1
        cz = c["center"][2]
        port = bank_point(side, -0.104, 0.31, cz)
        make("restrictors", "runner", tube([port, Vector((side * 0.122, 0.296, cz)), Vector((side * 0.098, 0.31, cz))], 0.02, sides=14), "cast")
        make("restrictors", "throttle_body", cylinder(0.023, 0.03, segments=24, bevel=0.003), "machined",
             frame((side * 0.098, 0.314, cz), (-side * 0.45, 1.0, 0)))
    for side in (-1, 1):
        z = [c["center"][2] for c in cylinders if (c["bank"] == "left") == (side > 0)]
        make("restrictors", "throttle_shaft", cylinder(0.004, max(z) - min(z) + 0.07, segments=10), "machined", at(side * 0.126, 0.302, sum(z) / 4))


def build_fuel(cylinders):
    for side in (-1, 1):
        z = [c["center"][2] for c in cylinders if (c["bank"] == "left") == (side > 0)]
        mid, span = sum(z) / 4, max(z) - min(z) + 0.14
        make("fuel", "fuel_rail", box(0.016, 0.016, span, bevel=0.003), "blue", at(side * 0.172, 0.336, mid))
        for end in (-1, 1):
            make("fuel", "rail_fitting", cylinder(0.011, 0.02, segments=6, bevel=0.002), "red", at(side * 0.172, 0.336, mid + end * (span / 2 + 0.01)))
        for cz in z:
            make("fuel", "injector", cylinder(0.0075, 0.036, segments=14, bevel=0.002), "black", frame((side * 0.158, 0.318, cz), (-side * 0.5, 0.86, 0)))
            make("fuel", "injector_clip", cylinder(0.0085, 0.006, segments=14), "blue", frame((side * 0.164, 0.328, cz), (-side * 0.5, 0.86, 0)))
    zl = [c["center"][2] for c in cylinders if c["bank"] == "left"]
    zr = [c["center"][2] for c in cylinders if c["bank"] == "right"]
    rear_l, rear_r = min(zl) - 0.08, min(zr) - 0.08
    make("fuel", "fuel_feed", tube([Vector((0.172, 0.336, rear_l)), Vector((0.2, 0.32, rear_l - 0.05)), Vector((0.33, 0.29, -0.35)), Vector((0.42, 0.3, -0.395))], 0.0075, sides=12), "braided")
    make("fuel", "fuel_crossover", tube([Vector((-0.172, 0.336, rear_r)), Vector((-0.12, 0.3, -0.3)), Vector((0.12, 0.3, -0.3)), Vector((0.172, 0.336, rear_l))], 0.0065, sides=12), "braided")
    make("fuel", "pressure_regulator", cylinder(0.015, 0.04, segments=20, bevel=0.003), "blue", at(-0.215, 0.33, rear_r - 0.03) @ Y_UP)


def header_heat(port):
    """Heat tint along a header: blue-violet at the port, gold, then straw, then plain steel."""
    stops = [(0.0, (0.30, 0.27, 0.52)), (0.05, (0.36, 0.30, 0.50)), (0.09, (0.78, 0.56, 0.27)), (0.18, (0.62, 0.52, 0.40)), (0.32, (0.52, 0.51, 0.50))]

    def color(co):
        d = (Vector(co) - port).length
        for (d0, c0), (d1, c1) in zip(stops, stops[1:]):
            if d <= d1:
                t = (d - d0) / (d1 - d0)
                return tuple(a + (b - a) * t for a, b in zip(c0, c1))
        return stops[-1][1]
    return color


def build_headers(cylinders):
    bundle = [(-0.019, -0.019), (0.019, -0.019), (-0.019, 0.019), (0.019, 0.019)]
    for side in (-1, 1):
        own = sorted((c for c in cylinders if (c["bank"] == "left") == (side > 0)), key=lambda c: c["center"][2])
        p = Vector((side * S45, -S45, 0))
        for k, c in enumerate(own):
            cz = c["center"][2]
            port = bank_point(side, 0.112, 0.28, cz)
            dx, dy = bundle[k]
            path = [port, port + p * 0.05 + Vector((0, -0.012, 0)), Vector((side * 0.395, 0.03, cz * 0.85 - 0.02)),
                    Vector((side * 0.41, -0.07, cz * 0.6 - 0.08)), Vector((side * (0.40 + dx), -0.145 + dy, -0.2)), Vector((side * (0.40 + dx * 0.5), -0.15 + dy * 0.5, -0.235))]
            make("headers", "primary", tube(path, 0.019, sides=12, resolution=8), "header", colors=header_heat(port))
            make("headers", "port_flange", box(0.01, 0.062, 0.08, bevel=0.003), "header", bank(side) @ at(0.11, 0.28, cz), colors=header_heat(port))
        collector = frame((side * 0.40, -0.15, -0.23), (0, -0.05, -1))
        far = collector @ Vector((0, 0, 0.1))
        make("headers", "collector", lathe([(0.056, 0.0), (0.04, 0.1)], segments=32), "header", collector, colors=header_heat(far + Vector((0, 0, 0.5))))
        make("headers", "tail_pipe", tube([far, Vector((side * 0.37, -0.2, -0.45)), Vector((side * 0.3, -0.22, -0.62))], 0.04, sides=16), "header", colors=header_heat(far + Vector((0, 0, 0.5))))


OIL_TANK = (-0.42, 0.03, 0.40)  # illustrative: the dry-sump tank, ahead of the right strut tower and clear of the headlight


def build_dry_sump():
    make("dry-sump", "sump_pan", box(0.36, 0.035, 0.47, bevel=0.006), "cast", at(0, -0.1325, -0.015))
    for x in (-0.12, -0.06, 0.0, 0.06, 0.12):
        make("dry-sump", "pan_fin", box(0.006, 0.02, 0.42, bevel=0.002), "cast", at(x, -0.158, -0.015))
    profile = [(0.0, -0.215)]
    z = -0.21
    for k in range(5):
        profile += [(0.047, z), (0.047, z + 0.012), (0.042, z + 0.014), (0.042, z + 0.086), (0.047, z + 0.088)]
        z += 0.1
    profile += [(0.047, z), (0.03, z + 0.01), (0.03, z + 0.03), (0.0, z + 0.03)]
    pump = at(-0.262, -0.1, 0)
    make("dry-sump", "pump_stack", lathe(profile, segments=36), "cast", pump)
    make("dry-sump", "pump_nut", bolt(0.012), "machined", pump @ at(0, 0, z + 0.03))
    for k in range(5):
        zf = -0.21 + 0.1 * k + 0.05
        fitting = frame((-0.262 - 0.03, -0.1 + 0.03, zf), (-0.7, 0.7, 0))
        make("dry-sump", "pump_fitting", cylinder(0.011, 0.026, segments=6, bevel=0.002), "red" if k else "blue", fitting)
        if k in (1, 2, 3):
            out = Vector((-0.262 - 0.045, -0.1 + 0.045, zf))
            make("dry-sump", "scavenge_line", tube([out, out + Vector((0.0, 0.04, 0.0)), Vector((-0.2, -0.02, zf)), Vector((-0.185, -0.12, zf + 0.02))], 0.0065, sides=10), "braided")
    tx, ty, tz = OIL_TANK
    make("dry-sump", "oil_tank", lathe([(0.0, -0.15), (0.06, -0.15), (0.07, -0.14), (0.07, 0.14), (0.064, 0.152), (0.035, 0.158), (0.0, 0.158)], segments=40), "machined", at(tx, ty, tz) @ Y_UP)
    make("dry-sump", "tank_cap", cylinder(0.026, 0.022, segments=8, bevel=0.003), "red", at(tx, ty + 0.168, tz) @ Y_UP)
    for y in (-0.06, 0.09):
        make("dry-sump", "tank_strap", lathe([(0.0705, y - 0.01), (0.075, y - 0.008), (0.075, y + 0.008), (0.0705, y + 0.01)], segments=40), "black", at(tx, ty, tz) @ Y_UP)
    for y in (ty - 0.08, ty + 0.08):  # arms out to the inner fender
        make("dry-sump", "tank_bracket", box(0.17, 0.025, 0.05, bevel=0.005), "black", at(tx - 0.155, y, tz))
    make("dry-sump", "pressure_line", tube([Vector((-0.29, -0.07, 0.25)), Vector((-0.36, -0.1, 0.36)), Vector((tx + 0.02, ty - 0.16, tz - 0.03))], 0.008, sides=12), "braided")
    make("dry-sump", "breather_line", tube([Vector((tx + 0.03, ty + 0.15, tz - 0.02)), Vector((tx + 0.09, ty + 0.23, tz - 0.03)), Vector((-0.27, 0.3, 0.32))], 0.008, sides=12), "braided")
    make("dry-sump", "oil_filter", lathe([(0.0, -0.045)] + [(0.04 + (0.003 if k % 2 else 0), -0.045 + 0.009 * k) for k in range(11)] + [(0.0, 0.045)], segments=32), "blue", frame((-0.305, -0.03, -0.12), (-1, 0.2, 0)))


# ---------------------------------------------------------------- the bay (car space)


def build_bay(cfg):
    bay, rad = cfg["bay"], cfg["radiator"]
    rear, front, wall_front = bay["rearZ"], bay["frontZ"], bay["wallFrontZ"]
    half, floor, top, wall_top = bay["halfWidth"], bay["floorY"], bay["topY"], bay["wallTopY"]
    length, wall_length = front - rear, wall_front - rear
    make("bay", "floor", box(half * 2, 0.02, length), "floor", at(0, floor - 0.01, (front + rear) / 2))
    make("bay", "subframe", box(1.1, 0.06, 0.12, bevel=0.008), "black", at(0, floor + 0.03, 1.3))
    for side in (-1, 1):
        make("bay", "mount_pedestal", box(0.08, 0.05, 0.08, bevel=0.006), "black", at(side * 0.32, floor + 0.08, 1.31))
        make("bay", "inner_fender", box(0.025, wall_top - floor, wall_length, bevel=0.006), "bay", at(side * half, (wall_top + floor) / 2, rear + wall_length / 2))
        make("bay", "fender_lip", box(0.06, 0.012, wall_length, bevel=0.004), "bay", at(side * (half + 0.02), wall_top, rear + wall_length / 2))
        for y in (0.25, 0.45):
            make("bay", "fender_rib", box(0.012, 0.02, 0.6, bevel=0.006), "bay", at(side * (half - 0.016), y, 1.12))
        for z in (1.0, 1.68):
            make("bay", "fender_hole", cylinder(0.035, 0.004, segments=24), "floor", at(side * (half - 0.013), 0.3, z) @ X_OUT)
        tower = Vector((side * (half - 0.045), 0, 1.45))
        height = wall_top + 0.02 - floor
        make("bay", "strut_tower", lathe([(0.15, 0.0), (0.13, 0.04), (0.112, 0.16), (0.106, height - 0.03), (0.098, height - 0.008), (0.085, height), (0.0, height)], segments=40),
             "bay", at(tower.x, floor, tower.z) @ Y_UP)
        make("bay", "camber_plate", box(0.12, 0.012, 0.075, bevel=0.004), "blue", at(tower.x, wall_top + 0.026, tower.z))
        make("bay", "strut_nut", cylinder(0.017, 0.03, segments=6, bevel=0.002), "black", at(tower.x, wall_top + 0.04, tower.z) @ Y_UP)
        for k in range(3):
            a = 2 * math.pi * k / 3 + 0.5
            make("bay", "tower_stud", bolt(0.0075), "machined", at(tower.x + 0.075 * math.cos(a), wall_top + 0.02, tower.z + 0.075 * math.sin(a)) @ Y_UP)
    # Firewall: heat shield over the transmission tunnel, the cowl tray, brake reservoirs, the loom bulkhead.
    make("bay", "firewall", box(half * 2, top - floor, 0.025, bevel=0.005), "bay", at(0, (top + floor) / 2, rear))
    make("bay", "tunnel", cylinder(0.17, 0.08, segments=40, bevel=0.01), "bay", at(0, floor + 0.04, rear + 0.02))
    make("bay", "heat_shield", box(0.62, 0.3, 0.006, bevel=0.003), "foil", at(0, floor + 0.2, rear + 0.016))
    make("bay", "cowl_tray", box(half * 2, 0.02, 0.1, bevel=0.004), "black", at(0, top - 0.01, rear + 0.05))
    for x in (0.4, 0.48):
        make("bay", "master_cylinder", box(0.045, 0.045, 0.1, bevel=0.006), "black", at(x, wall_top - 0.04, rear + 0.06))
        make("bay", "brake_reservoir", cylinder(0.028, 0.07, segments=24, bevel=0.006), "plastic", at(x, wall_top + 0.02, rear + 0.07) @ Y_UP)
        make("bay", "reservoir_cap", cylinder(0.03, 0.014, segments=24, bevel=0.003), "black", at(x, wall_top + 0.062, rear + 0.07) @ Y_UP)
    make("bay", "bulkhead_connector", cylinder(0.03, 0.03, segments=24, bevel=0.004), "black", at(-0.35, 0.55, rear + 0.025))
    make("bay", "bulkhead_ring", lathe([(0.03, 0.0), (0.036, 0.0), (0.036, 0.012), (0.03, 0.012)], segments=24), "machined", at(-0.35, 0.55, rear + 0.035))
    make("bay", "engine_loom", tube([Vector((-0.35, 0.55, rear + 0.04)), Vector((-0.28, 0.58, rear + 0.14)), Vector((-0.2, 0.6, 1.05))], 0.012, sides=12), "black")
    # Radiator across the nose: finned core, end tanks, its frame, and the hoses to the engine's necks.
    origin = Vector(cfg["origin"])
    core_y = rad["top"] - rad["height"] / 2
    make("bay", "radiator_core", box(rad["halfWidth"] * 2 - 0.06, rad["height"], 0.045), "core", at(0, core_y, rad["z"]))
    for side in (-1, 1):
        make("bay", "radiator_tank", box(0.04, rad["height"] + 0.02, 0.06, bevel=0.008), "cast", at(side * (rad["halfWidth"] - 0.02), core_y, rad["z"]))
        make("bay", "radiator_post", box(0.04, rad["height"] + 0.06, 0.05, bevel=0.006), "black", at(side * (rad["halfWidth"] + 0.03), core_y, rad["z"] + 0.03))
    make("bay", "radiator_top_bar", box(rad["halfWidth"] * 2 + 0.1, 0.035, 0.05, bevel=0.006), "black", at(0, rad["top"] + 0.03, rad["z"] + 0.03))
    make("bay", "radiator_filler", cylinder(0.018, 0.03, segments=20), "machined", at(-(rad["halfWidth"] - 0.02), rad["top"] + 0.02, rad["z"]) @ Y_UP)
    upper_neck = origin + Vector((*THERMOSTAT, 0.385))
    lower_neck = origin + Vector((*PUMP_INLET, 0.345))
    make("bay", "upper_hose", tube([Vector((-(rad["halfWidth"] - 0.02), rad["top"] - 0.04, rad["z"] - 0.035)), Vector((-0.28, rad["top"] - 0.015, rad["z"] - 0.16)),
                                    Vector((upper_neck.x - 0.03, upper_neck.y + 0.012, upper_neck.z + 0.09)), upper_neck], 0.022, sides=16), "silicone")
    make("bay", "lower_hose", tube([Vector((rad["halfWidth"] - 0.02, floor + 0.08, rad["z"] - 0.035)), Vector((0.3, floor + 0.09, rad["z"] - 0.16)),
                                    Vector((lower_neck.x + 0.02, lower_neck.y - 0.03, lower_neck.z + 0.1)), lower_neck], 0.022, sides=16), "silicone")
    tank = Vector((0.46, 0.46, 1.70))
    make("bay", "expansion_tank", lathe([(0.0, -0.08), (0.045, -0.08), (0.05, -0.07), (0.05, 0.07), (0.045, 0.08), (0.0, 0.08)], segments=32), "machined", at(*tank) @ X_OUT)
    make("bay", "expansion_cap", cylinder(0.02, 0.02, segments=8, bevel=0.003), "red", at(tank.x, tank.y + 0.055, tank.z) @ Y_UP)
    make("bay", "expansion_hose", tube([tank + Vector((-0.06, -0.03, 0.02)), Vector((0.39, 0.5, 1.85)), Vector((rad["halfWidth"] - 0.02, rad["top"] - 0.02, rad["z"] - 0.04))], 0.009, sides=10), "rubber")
    for side in (-1, 1):
        make("bay", "headlight_back", box(0.16, 0.13, 0.12, bevel=0.02), "black", at(side * 0.53, 0.43, 1.86))


# ---------------------------------------------------------------- assembly, bake, export


def join(objects, name, parent):
    with bpy.context.temp_override(active_object=objects[0], object=objects[0], selected_objects=objects, selected_editable_objects=objects):
        bpy.ops.object.join()
    obj = objects[0]
    obj.name = name
    obj.data.name = name
    obj.parent = parent
    modifier = obj.modifiers.new("weighted_normals", "WEIGHTED_NORMAL")
    modifier.keep_sharp = True
    modifier.weight = 50
    return obj


def unwrap(objects):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(50), island_margin=0.003, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(rotate=True, margin=0.003)
    bpy.ops.object.mode_set(mode="OBJECT")


def metres_per_uv(objects):
    """How many metres one UV unit spans, averaged over the atlas, so tiled textures keep their real size."""
    area_3d = area_uv = 0.0
    for obj in objects:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        uv = bm.loops.layers.uv.active
        for face in bm.faces:
            area_3d += face.calc_area()
            pts = [loop[uv].uv for loop in face.loops]
            area_uv += abs(sum(a.x * b.y - b.x * a.y for a, b in zip(pts, pts[1:] + pts[:1]))) / 2
        bm.free()
    return math.sqrt(area_3d / area_uv)


def bake_ao(objects, path):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 96
    scene.world = scene.world or bpy.data.worlds.new("world")
    scene.world.light_settings.distance = AO_DISTANCE
    image = bpy.data.images.new("ao", width=ATLAS, height=ATLAS, alpha=False)
    image.colorspace_settings.name = "Non-Color"
    nodes = []
    for mat in MAT.values():
        node = mat.node_tree.nodes.new("ShaderNodeTexImage")
        node.image = image
        mat.node_tree.nodes.active = node
        nodes.append((mat, node))
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.bake(type="AO", margin=10, use_clear=True, target="IMAGE_TEXTURES")
    image.filepath_raw = path
    image.file_format = "PNG"
    image.save()
    for mat, node in nodes:
        mat.node_tree.nodes.remove(node)


def main():
    layout_path, out, ao_path = cli_args()
    with open(layout_path) as handle:
        cfg = json.load(handle)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    MAT.update(make_materials())

    cylinders = cfg["cylinders"]
    build_block(cylinders)
    build_heads(cylinders)
    build_front()
    build_intake(cylinders)
    build_fuel(cylinders)
    build_headers(cylinders)
    build_dry_sump()
    build_bay(cfg)

    engine = bpy.data.objects.new("Engine", None)
    bay = bpy.data.objects.new("Bay", None)
    for root in (engine, bay):
        bpy.context.scene.collection.objects.link(root)
    engine.location = TO_BLENDER @ Vector(cfg["origin"])

    joined = [join(objects, f"Part_{part}" if part != "bay" else "Bay_shell", engine if part != "bay" else bay)
              for part, objects in PARTS.items()]
    bpy.context.view_layer.update()
    unwrap(joined)
    scale = metres_per_uv(joined)
    MAT["carbon"].node_tree.nodes["tiling"].inputs["Scale"].default_value = (scale / WEAVE_TILE, scale / WEAVE_TILE, 1)
    MAT["core"].node_tree.nodes["tiling"].inputs["Scale"].default_value = (scale / FIN_TILE, scale / FIN_TILE, 1)
    bake_ao(joined, ao_path)

    triangles = sum(len(p.vertices) - 2 for obj in joined for p in obj.data.polygons)
    print(f"build_engine: {len(joined)} meshes, ~{triangles} triangles, {scale:.2f} m per UV unit")
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_apply=True, export_yup=True, export_texcoords=True,
                              export_normals=True, export_vertex_color="ACTIVE", export_cameras=False, export_lights=False)


main()
