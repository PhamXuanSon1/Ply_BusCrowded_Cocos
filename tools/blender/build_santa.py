# Blender headless: tạo xe trượt ông già Noel (Sleigh.glb) + ông già Noel gắn rig Fireman (Santa.fbx)
# Chạy: "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --factory-startup --python tools/blender/build_santa.py
# Xuất: assets/8.Models/Meshs/Santa/{Santa.fbx, Santa_Palette.png} (xe trượt: chạy build_sleigh.py sau script này)
import bpy, bmesh, math, os
from mathutils import Vector, Matrix

ROOT = r"F:\CocosProject\Ply_BusCrowded_Cocos\assets\8.Models"
OUT_MESH = os.path.join(ROOT, "Meshs", "Santa")
os.makedirs(OUT_MESH, exist_ok=True)
PALETTE_PATH = os.path.join(OUT_MESH, "Santa_Palette.png")

# ---- palette: 16 ô màu, mỗi ô 16px ----
COLORS = {
    'RED': (214, 34, 42), 'WHITE': (232, 232, 232), 'SKIN': (250, 204, 168), 'BLACK': (38, 32, 32),
    'GOLD': (222, 158, 24), 'BROWN': (138, 82, 40), 'DARKRED': (140, 20, 26), 'GREEN': (40, 150, 60),
    'BLUE': (50, 110, 210), 'PINK': (240, 140, 140), 'LBROWN': (176, 110, 56), 'DBROWN': (90, 52, 28),
    'SILVER': (200, 205, 215), 'NOSE': (230, 40, 40), 'YELLOW': (240, 196, 60), 'GREY': (120, 120, 125),
}
NAMES = list(COLORS.keys())
CELL = 16
W, H = CELL * len(NAMES), CELL

def make_palette():
    img = bpy.data.images.new("Santa_Palette", W, H, alpha=True)
    px = []
    for y in range(H):
        for x in range(W):
            r, g, b = COLORS[NAMES[x // CELL]]
            px += [r / 255, g / 255, b / 255, 1.0]
    img.pixels = px
    img.filepath_raw = PALETTE_PATH
    img.file_format = 'PNG'
    img.save()
    return img

def uv_of(color):
    i = NAMES.index(color)
    return ((i + 0.5) / len(NAMES), 0.5)

# ---- helpers tạo khối, mỗi khối mang 1 màu + (tuỳ chọn) 1 xương ----
parts = []

def finish(obj, color, bone=None, smooth=True):
    obj["color"] = color
    if bone:
        obj["bone"] = bone
    if smooth:
        for p in obj.data.polygons:
            p.use_smooth = True
    parts.append(obj)
    return obj

def sphere(loc, rad, color, bone=None, seg=16, rings=10):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=1, location=loc)
    o = bpy.context.active_object
    o.scale = rad if isinstance(rad, (tuple, list)) else (rad, rad, rad)
    return finish(o, color, bone)

def box(loc, size, color, bone=None, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.scale = size
    if bevel > 0:
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        m = o.modifiers.new("b", 'BEVEL'); m.width = bevel; m.segments = 2
        bpy.ops.object.modifier_apply(modifier="b")
    return finish(o, color, bone, smooth=bevel > 0)

def cyl_between(a, b, r, color, bone=None, seg=12, r2=None):
    a, b = Vector(a), Vector(b)
    d = b - a
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=seg, radius=r, depth=d.length, location=(a + b) / 2)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=seg, radius1=r, radius2=r2, depth=d.length, location=(a + b) / 2)
    o = bpy.context.active_object
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    return finish(o, color, bone)

def torus(loc, major, minor, color, bone=None, axis='Z', rot=None):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=20, minor_segments=8, location=loc)
    o = bpy.context.active_object
    if axis == 'X':
        o.rotation_euler = (0, math.pi / 2, 0)
    elif axis == 'Y':
        o.rotation_euler = (math.pi / 2, 0, 0)
    if rot:
        o.rotation_euler = rot
    return finish(o, color, bone)

def bake(objs, name):
    """Gộp các khối thành 1 mesh: UV theo màu palette, vertex group theo xương, 1 material"""
    for o in objs:
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        o.select_set(False)
        me = o.data
        if not me.uv_layers:
            me.uv_layers.new(name="UVMap")
        uv = me.uv_layers.active.data
        u, v = uv_of(o["color"])
        for loop in me.loops:
            uv[loop.index].uv = (u, v)
        if "bone" in o:
            g = o.vertex_groups.new(name=o["bone"])
            g.add([vv.index for vv in me.vertices], 1.0, 'REPLACE')
        me.materials.clear()
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    res = bpy.context.active_object
    res.name = name
    res.data.name = name
    return res

def palette_material(img, name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = 'Closest'
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.8
    return mat

# =====================================================================
# 1) XE TRƯỢT (toạ độ = local của xe trong Cocos: Z lên, +Y là đầu xe)
#    vừa khung FireCar cũ: x ±0.21, y -0.52..0.52, cao tối đa ~0.7
# =====================================================================
bpy.ops.wm.read_factory_settings(use_empty=True)
img = make_palette()
parts = []

# càng trượt (runner) vàng 2 bên + móc cong phía trước
for sx in (-1, 1):
    x = sx * 0.16
    box((x, -0.16, 0.035), (0.035, 0.66, 0.03), 'GOLD', bevel=0.008)
    torus((x, 0.17, 0.11), 0.075, 0.016, 'GOLD', axis='X')
    for y in (-0.40, -0.16, 0.06):
        cyl_between((x, y, 0.04), (x, y, 0.13), 0.014, 'GOLD', seg=8)
# thân xe đỏ
box((0, -0.17, 0.21), (0.40, 0.62, 0.18), 'RED', bevel=0.05)
# tựa lưng cao phía sau
box((0, -0.43, 0.36), (0.40, 0.10, 0.26), 'RED', bevel=0.04)
cyl_between((-0.20, -0.43, 0.49), (0.20, -0.43, 0.49), 0.05, 'RED', seg=14)
# mũi xe cuộn tròn phía trước
cyl_between((-0.20, 0.13, 0.27), (0.20, 0.13, 0.27), 0.075, 'RED', seg=16)
torus((-0.20, 0.13, 0.27), 0.06, 0.014, 'GOLD', axis='X')
torus((0.20, 0.13, 0.27), 0.06, 0.014, 'GOLD', axis='X')
# viền vàng mép trên thân
for sx in (-1, 1):
    box((sx * 0.205, -0.16, 0.30), (0.018, 0.56, 0.025), 'GOLD', bevel=0.005)
    box((sx * 0.205, -0.43, 0.49), (0.02, 0.10, 0.02), 'GOLD')
# hoa văn vàng 2 bên hông
for sx in (-1, 1):
    torus((sx * 0.205, -0.17, 0.20), 0.055, 0.010, 'GOLD', axis='X')
# ghế ngồi màu đỏ đậm
box((0, -0.25, 0.31), (0.34, 0.22, 0.05), 'DARKRED', bevel=0.02)
# bao quà + hộp quà phía sau
sphere((0, -0.34, 0.47), (0.14, 0.11, 0.13), 'DARKRED')
sphere((0, -0.34, 0.60), (0.05, 0.05, 0.04), 'DARKRED')
box((-0.08, -0.26, 0.42), (0.08, 0.08, 0.08), 'GREEN', bevel=0.01)
box((0.08, -0.27, 0.44), (0.09, 0.09, 0.09), 'BLUE', bevel=0.01)
box((0.0, -0.40, 0.62), (0.07, 0.07, 0.07), 'GOLD', bevel=0.01)
box((0.08, -0.27, 0.44), (0.095, 0.02, 0.095), 'YELLOW')
box((-0.08, -0.26, 0.42), (0.02, 0.085, 0.085), 'YELLOW')
# kẹo gậy
cyl_between((0.12, -0.40, 0.45), (0.14, -0.40, 0.66), 0.012, 'WHITE', seg=8)
torus((0.155, -0.40, 0.665), 0.025, 0.011, 'RED', axis='Y')

# ---- tuần lộc phía trước ----
deer_y = 0.37
sphere((0, deer_y, 0.22), (0.075, 0.13, 0.075), 'BROWN')
for sx in (-1, 1):
    for dy in (-0.08, 0.08):
        cyl_between((sx * 0.04, deer_y + dy, 0.0), (sx * 0.04, deer_y + dy, 0.20), 0.016, 'BROWN', seg=8)
        sphere((sx * 0.04, deer_y + dy, 0.012), 0.02, 'DBROWN', seg=8, rings=6)
cyl_between((0, deer_y + 0.09, 0.25), (0, deer_y + 0.13, 0.36), 0.035, 'BROWN', seg=10)
sphere((0, deer_y + 0.15, 0.39), (0.045, 0.06, 0.045), 'BROWN')
sphere((0, deer_y + 0.205, 0.38), 0.022, 'NOSE', seg=10, rings=6)
sphere((-0.025, deer_y + 0.18, 0.41), 0.008, 'BLACK', seg=8, rings=5)
sphere((0.025, deer_y + 0.18, 0.41), 0.008, 'BLACK', seg=8, rings=5)
sphere((0, deer_y - 0.12, 0.25), (0.02, 0.03, 0.02), 'WHITE', seg=8, rings=6)
for sx in (-1, 1):
    a = (sx * 0.02, deer_y + 0.14, 0.43)
    b = (sx * 0.07, deer_y + 0.12, 0.53)
    cyl_between(a, b, 0.008, 'LBROWN', seg=6)
    cyl_between(b, (sx * 0.11, deer_y + 0.10, 0.58), 0.007, 'LBROWN', seg=6)
    cyl_between(b, (sx * 0.06, deer_y + 0.16, 0.58), 0.007, 'LBROWN', seg=6)
    sphere((sx * 0.045, deer_y + 0.13, 0.42), (0.012, 0.02, 0.008), 'BROWN', seg=8, rings=5)
# vòng cổ đỏ + chuông vàng
torus((0, deer_y + 0.10, 0.28), 0.045, 0.012, 'RED', rot=(math.radians(60), 0, 0))
sphere((0, deer_y + 0.15, 0.27), 0.014, 'GOLD', seg=8, rings=6)
# dây kéo vàng nối xe với tuần lộc
for sx in (-1, 1):
    cyl_between((sx * 0.12, 0.17, 0.24), (sx * 0.06, deer_y - 0.05, 0.24), 0.008, 'GOLD', seg=6)

sleigh = bake(parts, "Sleigh")
sleigh.data.transform(Matrix.Translation((0, -0.05, 0)))  # cân giữa khung va chạm y ±0.5
sleigh.data.materials.append(palette_material(img, "Sleigh"))
bpy.ops.object.select_all(action='DESELECT')
sleigh.select_set(True)
# Xe trượt bản cũ: KHÔNG xuất nữa (đã thay bằng tools/blender/build_sleigh.py), giữ lại chỉ để tham khảo.
# Script này giờ chỉ dùng để tạo Santa_Palette.png + Santa.fbx.
print("SLEIGH (cũ, không xuất) bbox", [round(min((sleigh.matrix_world @ v.co)[i] for v in sleigh.data.vertices), 3) for i in range(3)],
      [round(max((sleigh.matrix_world @ v.co)[i] for v in sleigh.data.vertices), 3) for i in range(3)],
      "verts", len(sleigh.data.vertices))

# =====================================================================
# 2) ÔNG GIÀ NOEL trên rig Fireman (không gian armature: Y lên, mặt quay +Z, cao ~6.9)
# =====================================================================
bpy.ops.wm.read_factory_settings(use_empty=True)
img = bpy.data.images.load(PALETTE_PATH)
bpy.ops.import_scene.fbx(filepath=os.path.join(ROOT, "Meshs", "Fireman", "Fireman.fbx"))
arm = bpy.data.objects['DeformationSystem']
old = bpy.data.objects['Fireman']
bpy.data.objects.remove(old, do_unlink=True)

# trong không gian armature (x, y=lên, z=trước) -> tạo ở world rồi gán làm local của mesh
def P(x, y, z):
    return (x, y, z)
parts = []
Z = 'Y'  # trục lên
# chân: quần đỏ + ủng đen
for s, side in ((-1, 'R'), (1, 'L')):
    x = s * 0.5
    cyl_between(P(x, 1.85, 0.02), P(x, 0.95, 0.08), 0.42, 'RED', 'Hip_' + side, r2=0.36)
    cyl_between(P(x, 0.98, 0.08), P(x, 0.32, 0.04), 0.36, 'RED', 'Knee_' + side, r2=0.33)
    box(P(x, 0.22, 0.12), (0.66, 0.44, 0.95), 'BLACK', 'Ankle_' + side, bevel=0.12)
    torus(P(x, 0.46, 0.04), 0.36, 0.08, 'BLACK', 'Ankle_' + side, axis='Y')
# thân: bụng tròn + ngực
sphere(P(0, 2.25, 0.08), (1.30, 1.05, 1.15), 'RED', 'Spine1_M', seg=20, rings=12)
sphere(P(0, 3.15, 0.0), (1.05, 0.85, 0.92), 'RED', 'Chest_M', seg=20, rings=12)
# viền lông trắng gấu áo + dải trắng giữa ngực
torus(P(0, 1.45, 0.06), 1.05, 0.22, 'WHITE', 'Root_M', axis='Y')
for y, z, r in ((1.75, 1.10, 0.20), (2.6, 1.16, 0.20), (3.05, 0.95, 0.19), (3.45, 0.80, 0.18)):
    sphere(P(0, y, z), (r, r * 1.6, r * 0.8), 'WHITE', 'Chest_M' if y > 2.8 else 'Spine1_M', seg=10, rings=8)
# thắt lưng đen + khoá vàng
torus(P(0, 2.12, 0.08), 1.22, 0.13, 'BLACK', 'Spine1_M', axis='Y')
box(P(0, 2.12, 1.33), (0.55, 0.42, 0.12), 'GOLD', 'Spine1_M', bevel=0.04)
box(P(0, 2.12, 1.37), (0.30, 0.20, 0.10), 'BLACK', 'Spine1_M')
# tay (tư thế chữ T dọc trục X): áo đỏ, cổ tay lông trắng, găng tay trắng
for s, side in ((-1, 'R'), (1, 'L')):
    cyl_between(P(s * 0.75, 3.37, 0.0), P(s * 1.62, 3.37, 0.0), 0.36, 'RED', 'Shoulder_' + side, r2=0.31)
    sphere(P(s * 0.78, 3.40, 0.0), 0.42, 'RED', 'Shoulder_' + side, seg=12, rings=8)
    cyl_between(P(s * 1.60, 3.37, 0.0), P(s * 2.12, 3.37, 0.0), 0.31, 'RED', 'Elbow_' + side, r2=0.28)
    torus(P(s * 2.12, 3.37, 0.0), 0.28, 0.11, 'WHITE', 'Elbow_' + side, axis='X')
    sphere(P(s * 2.45, 3.37, 0.04), (0.30, 0.30, 0.28), 'WHITE', 'Wrist_' + side, seg=12, rings=8)
# đầu
sphere(P(0, 4.95, 0.05), (0.98, 0.95, 0.95), 'SKIN', 'Head_M', seg=20, rings=14)
sphere(P(-0.55, 4.75, 0.70), 0.18, 'PINK', 'Head_M', seg=10, rings=6)
sphere(P(0.55, 4.75, 0.70), 0.18, 'PINK', 'Head_M', seg=10, rings=6)
sphere(P(0, 4.85, 1.00), 0.20, 'SKIN', 'Head_M', seg=12, rings=8)
sphere(P(-0.32, 5.15, 0.86), (0.10, 0.14, 0.06), 'BLACK', 'Head_M', seg=10, rings=6)
sphere(P(0.32, 5.15, 0.86), (0.10, 0.14, 0.06), 'BLACK', 'Head_M', seg=10, rings=6)
# lông mày trắng
sphere(P(-0.34, 5.42, 0.82), (0.20, 0.07, 0.07), 'WHITE', 'Head_M', seg=10, rings=6)
sphere(P(0.34, 5.42, 0.82), (0.20, 0.07, 0.07), 'WHITE', 'Head_M', seg=10, rings=6)
# râu trắng to + ria mép
sphere(P(0, 4.25, 0.55), (0.95, 0.85, 0.65), 'WHITE', 'Head_M', seg=18, rings=12)
sphere(P(0, 3.75, 0.62), (0.55, 0.55, 0.45), 'WHITE', 'Neck_M', seg=14, rings=10)
sphere(P(-0.30, 4.68, 1.02), (0.34, 0.14, 0.14), 'WHITE', 'Head_M', seg=12, rings=8)
sphere(P(0.30, 4.68, 1.02), (0.34, 0.14, 0.14), 'WHITE', 'Head_M', seg=12, rings=8)
# tóc trắng hai bên
sphere(P(-0.88, 5.0, -0.15), (0.25, 0.45, 0.50), 'WHITE', 'Head_M', seg=12, rings=8)
sphere(P(0.88, 5.0, -0.15), (0.25, 0.45, 0.50), 'WHITE', 'Head_M', seg=12, rings=8)
# mũ đỏ: chóp cong ra sau, viền lông + quả bông trắng
cyl_between(P(0, 5.55, 0.0), P(0, 6.45, -0.35), 0.98, 'RED', 'Head_M', seg=18, r2=0.45)
cyl_between(P(0, 6.40, -0.33), P(0.15, 6.80, -0.95), 0.46, 'RED', 'Head_M', seg=14, r2=0.12)
torus(P(0, 5.58, 0.0), 0.98, 0.25, 'WHITE', 'Head_M', axis='Y')
sphere(P(0.18, 6.78, -1.05), 0.27, 'WHITE', 'Head_M', seg=12, rings=8)

santa = bake(parts, "Santa")
santa.data.materials.append(palette_material(img, "Santa"))
# gắn vào armature: local = không gian armature (giống mesh Fireman gốc)
santa.parent = arm
santa.matrix_parent_inverse = Matrix.Identity(4)
santa.matrix_basis = Matrix.Identity(4)
santa.parent = bpy.data.objects['Geometry'] if False else arm
mod = santa.modifiers.new("Armature", 'ARMATURE')
mod.object = arm
vs = [v.co for v in santa.data.vertices]
print("SANTA local bbox", [round(min(v[i] for v in vs), 2) for i in range(3)], [round(max(v[i] for v in vs), 2) for i in range(3)], "verts", len(vs),
      "groups", [g.name for g in santa.vertex_groups])

bpy.ops.object.select_all(action='DESELECT')
for o in bpy.data.objects:
    o.select_set(True)
bpy.ops.export_scene.fbx(filepath=os.path.join(OUT_MESH, "Santa.fbx"), use_selection=True,
                         object_types={'EMPTY', 'ARMATURE', 'MESH'}, add_leaf_bones=False, bake_anim=False,
                         primary_bone_axis='Y', secondary_bone_axis='X', use_armature_deform_only=False,
                         mesh_smooth_type='FACE', path_mode='STRIP', apply_unit_scale=True, global_scale=1.0)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(os.path.dirname(os.path.abspath(__file__)), "santa.blend"))
print("DONE")
