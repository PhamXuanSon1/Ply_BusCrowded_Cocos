# Blender headless: xe trượt ông già Noel theo mẫu vẽ (thân cong kiểu thiên nga, đuôi cuộn cao, mũi cuộn,
# thân đỏ trơn, càng trượt đen, 2 hộp quà trên ghế, tuần lộc phía trước).
# Chạy: "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --factory-startup --python tools/blender/build_sleigh.py
# Xuất: assets/8.Models/Meshs/Santa/Sleigh.glb gồm 2 mesh:
#   - Sleigh       : xe trống (đang chờ ông già Noel)
#   - SleighRider  : xe có ông già Noel ngồi cầm cương (hiện khi ông đã lên xe)
# Toạ độ = local của xe trong Cocos: Z lên, +Y là đầu xe. Dùng chung Santa_Palette.png (build_santa.py tạo).
import bpy, bmesh, math, os
from mathutils import Vector, Matrix

ROOT = r"F:\CocosProject\Ply_BusCrowded_Cocos\assets\8.Models\Meshs\Santa"
PALETTE_PATH = os.path.join(ROOT, "Santa_Palette.png")
NAMES = ['RED', 'WHITE', 'SKIN', 'BLACK', 'GOLD', 'BROWN', 'DARKRED', 'GREEN',
         'BLUE', 'PINK', 'LBROWN', 'DBROWN', 'SILVER', 'NOSE', 'YELLOW', 'GREY']

def uv_of(color):
    i = NAMES.index(color)
    return ((i + 0.5) / len(NAMES), 0.5)

parts = []

def finish(o, color, smooth=True):
    o["color"] = color
    if smooth:
        for p in o.data.polygons:
            p.use_smooth = True
    parts.append(o)
    return o

def sphere(loc, rad, color, seg=16, rings=10):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=1, location=loc)
    o = bpy.context.active_object
    o.scale = rad if isinstance(rad, (tuple, list)) else (rad, rad, rad)
    return finish(o, color)

def box(loc, size, color, bevel=0.0, rot=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.scale = size
    if rot:
        o.rotation_euler = rot
    if bevel > 0:
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        m = o.modifiers.new("b", 'BEVEL'); m.width = bevel; m.segments = 2
        bpy.ops.object.modifier_apply(modifier="b")
    return finish(o, color, smooth=bevel > 0)

def cyl(a, b, r, color, seg=12, r2=None):
    a, b = Vector(a), Vector(b)
    d = b - a
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=seg, radius=r, depth=d.length, location=(a + b) / 2)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=seg, radius1=r, radius2=r2, depth=d.length, location=(a + b) / 2)
    o = bpy.context.active_object
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    return finish(o, color)

def torus(loc, major, minor, color, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=24, minor_segments=8, location=loc)
    o = bpy.context.active_object
    o.rotation_euler = rot
    return finish(o, color)

def tube(points, r, color, res=6):
    """ống tròn chạy theo đường gấp khúc (bo mềm) - viền vàng, càng trượt, dây cương"""
    cu = bpy.data.curves.new("tube", 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = r
    cu.bevel_resolution = 2
    cu.use_fill_caps = True
    sp = cu.splines.new('NURBS')
    sp.points.add(len(points) - 1)
    for p, c in zip(sp.points, points):
        p.co = (c[0], c[1], c[2], 1)
    sp.order_u = min(4, len(points))
    sp.use_endpoint_u = True
    sp.resolution_u = res
    o = bpy.data.objects.new("tube", cu)
    bpy.context.collection.objects.link(o)
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.convert(target='MESH')
    o = bpy.context.active_object
    return finish(o, color)

def panel(profile, x0, x1, color, bevel=0.012):
    """tấm hông: đa giác profile (y, z) đùn theo trục X từ x0 tới x1"""
    me = bpy.data.meshes.new("panel")
    bm = bmesh.new()
    vs = [bm.verts.new((x0, y, z)) for (y, z) in profile]
    f = bm.faces.new(vs)
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    nv = [e for e in r['geom'] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(x1 - x0, 0, 0), verts=nv)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new("panel", me)
    bpy.context.collection.objects.link(o)
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    if bevel > 0:
        m = o.modifiers.new("b", 'BEVEL'); m.width = bevel; m.segments = 2; m.limit_method = 'ANGLE'
        bpy.ops.object.modifier_apply(modifier="b")
    return finish(o, color, smooth=False)

def bake(objs, name):
    for o in objs:
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        me = o.data
        if not me.uv_layers:
            me.uv_layers.new(name="UVMap")
        uv = me.uv_layers.active.data
        u, v = uv_of(o["color"])
        for loop in me.loops:
            uv[loop.index].uv = (u, v)
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

# ---------------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
img = bpy.data.images.load(PALETTE_PATH)
mat = bpy.data.materials.new("Sleigh")
mat.use_nodes = True
tex = mat.node_tree.nodes.new("ShaderNodeTexImage"); tex.image = img; tex.interpolation = 'Closest'
mat.node_tree.links.new(tex.outputs[0], mat.node_tree.nodes["Principled BSDF"].inputs[0])

W = 0.21          # nửa bề ngang thân xe (mép ngoài tấm hông) - rộng gần bằng xe buýt cho dễ nhìn
T = 0.045         # độ dày tấm hông
# profile tấm hông nhìn ngang (y = dọc xe, z = cao): đuôi cuộn cao phía sau, lõm ở chỗ ngồi, mũi cuộn phía trước
PROFILE = [
    (-0.40, 0.09), (0.08, 0.09), (0.17, 0.13), (0.22, 0.21), (0.23, 0.30), (0.20, 0.36),
    (0.15, 0.37), (0.12, 0.33), (0.13, 0.29), (0.09, 0.25), (0.00, 0.22), (-0.20, 0.22),
    (-0.28, 0.27), (-0.33, 0.36), (-0.37, 0.46), (-0.43, 0.52), (-0.50, 0.52), (-0.54, 0.47),
    (-0.53, 0.41), (-0.48, 0.38), (-0.46, 0.30), (-0.45, 0.18),
]
# đường mép trên của tấm hông (cho viền vàng), từ mũi cuộn tới đuôi cuộn
TOP_EDGE = [(0.13, 0.33), (0.15, 0.375), (0.20, 0.365), (0.235, 0.30), (0.22, 0.22)]
TOP_EDGE2 = [(0.09, 0.255), (0.0, 0.225), (-0.20, 0.225), (-0.28, 0.275), (-0.33, 0.36), (-0.37, 0.46),
             (-0.43, 0.525), (-0.50, 0.525), (-0.545, 0.47), (-0.53, 0.405), (-0.48, 0.38)]

def build_sleigh():
    # 2 tấm hông đỏ
    for s in (-1, 1):
        x_out, x_in = s * W, s * (W - T)
        panel(PROFILE, min(x_out, x_in), max(x_out, x_in), 'RED')
        # (đã bỏ viền chạy theo mép tấm hông: thân đỏ trơn cho dễ nhìn)
        # hoa văn xoắn vàng ở mặt ngoài tấm hông
        torus((s * (W + 0.003), -0.12, 0.155), 0.045, 0.009, 'GOLD', rot=(0, math.pi / 2, 0))
        torus((s * (W + 0.003), -0.42, 0.30), 0.05, 0.009, 'GOLD', rot=(0, math.pi / 2, 0))
        torus((s * (W + 0.003), 0.17, 0.25), 0.035, 0.009, 'GOLD', rot=(0, math.pi / 2, 0))
    # lòng xe: đáy + vách sau + vách trước (giữa 2 tấm hông)
    wi = W - T
    box((0, -0.16, 0.13), (2 * wi, 0.52, 0.08), 'LBROWN')   # lòng xe màu nâu: tách màu với thân đỏ mà không chói
    box((0, -0.44, 0.31), (2 * wi, 0.07, 0.40), 'RED', bevel=0.015)
    box((0, 0.135, 0.22), (2 * wi, 0.05, 0.20), 'RED', bevel=0.012)
    # ghế: đệm vàng nhạt + tựa lưng đỏ đậm -> nhìn từ trên thấy rõ lòng xe khác màu thân
    box((0, -0.24, 0.20), (2 * wi - 0.01, 0.30, 0.06), 'BROWN', bevel=0.02)
    box((0, -0.385, 0.33), (2 * wi - 0.01, 0.05, 0.22), 'DARKRED', bevel=0.02)
    # càng trượt đen: thò ra ngoài thân, mũi cuộn tròn phía trước
    for s in (-1, 1):
        x = s * (W + 0.02)
        tube([(x, -0.50, 0.03), (x, -0.20, 0.025), (x, 0.15, 0.025), (x, 0.27, 0.04),
              (x, 0.33, 0.10), (x, 0.31, 0.17), (x, 0.26, 0.18), (x, 0.245, 0.13), (x, 0.28, 0.115)], 0.016, 'BLACK', res=8)
        tube([(x, -0.50, 0.03), (x, -0.55, 0.05), (x, -0.56, 0.08)], 0.016, 'BLACK')
        for y in (-0.36, -0.12, 0.08):
            cyl((x, y, 0.03), (s * (W - 0.01), y, 0.11), 0.011, 'BLACK', seg=8)
    # 2 hộp quà nhỏ đặt trên ghế ở 2 góc sau (không còn bao quà; chừa giữa ghế cho ông già Noel ngồi)
    for (x, y, z, sz, c, rc) in ((-0.11, -0.36, 0.27, 0.075, 'GREEN', 'YELLOW'),
                                 (0.11, -0.36, 0.27, 0.075, 'BLUE', 'YELLOW')):
        box((x, y, z), (sz, sz, sz), c, bevel=0.01)
        box((x, y, z), (sz + 0.006, 0.018, sz + 0.006), rc)
        box((x, y, z), (0.018, sz + 0.006, sz + 0.006), rc)
        torus((x, y, z + sz / 2 + 0.01), 0.018, 0.007, rc, rot=(math.pi / 2, 0, 0))

def build_deer():
    """tuần lộc đang phi về phía trước (theo mẫu): thân nâu, bụng + đốm kem, gạc xoè, mũi đỏ, vòng cổ vàng"""
    y0 = 0.40
    sphere((0, y0, 0.25), (0.075, 0.13, 0.072), 'BROWN', seg=18, rings=12)
    sphere((0, y0, 0.22), (0.055, 0.10, 0.045), 'WHITE', seg=14, rings=8)      # bụng kem
    for (dx, dy) in ((-0.04, -0.06), (0.045, 0.02), (-0.03, 0.06), (0.035, -0.08)):
        sphere((dx * 1.6, y0 + dy, 0.30), (0.018, 0.022, 0.01), 'YELLOW', seg=8, rings=5)  # đốm trên lưng
    # chân: chân trước duỗi ra trước, chân sau đạp về sau (dáng phi)
    for s in (-1, 1):
        x = s * 0.04
        cyl((x, y0 + 0.08, 0.22), (x, y0 + 0.17, 0.10), 0.017, 'BROWN', seg=8)
        cyl((x, y0 + 0.17, 0.10), (x, y0 + 0.22, 0.12), 0.014, 'BROWN', seg=8)
        sphere((x, y0 + 0.225, 0.12), 0.018, 'BLACK', seg=8, rings=6)
        cyl((x, y0 - 0.08, 0.22), (x, y0 - 0.14, 0.10), 0.019, 'BROWN', seg=8)
        cyl((x, y0 - 0.14, 0.10), (x, y0 - 0.20, 0.06), 0.015, 'BROWN', seg=8)
        sphere((x, y0 - 0.205, 0.055), 0.018, 'BLACK', seg=8, rings=6)
    sphere((0, y0 - 0.13, 0.29), (0.025, 0.03, 0.03), 'WHITE', seg=8, rings=6)   # đuôi
    # cổ + đầu ngẩng cao
    cyl((0, y0 + 0.09, 0.28), (0, y0 + 0.13, 0.40), 0.037, 'BROWN', seg=12)
    sphere((0, y0 + 0.15, 0.44), (0.05, 0.065, 0.05), 'BROWN', seg=16, rings=10)
    sphere((0, y0 + 0.205, 0.43), (0.032, 0.035, 0.028), 'WHITE', seg=10, rings=6)  # mõm
    sphere((0, y0 + 0.24, 0.435), 0.022, 'NOSE', seg=10, rings=6)
    for s in (-1, 1):
        sphere((s * 0.028, y0 + 0.185, 0.47), 0.011, 'BLACK', seg=8, rings=5)
        sphere((s * 0.05, y0 + 0.13, 0.47), (0.012, 0.025, 0.008), 'BROWN', seg=8, rings=5)  # tai
        # gạc xoè rộng (nhìn từ trên vẫn thấy rõ)
        a = (s * 0.02, y0 + 0.14, 0.48)
        b = (s * 0.08, y0 + 0.12, 0.56)
        c = (s * 0.14, y0 + 0.10, 0.61)
        tube([a, b, c], 0.009, 'BLACK')
        for t in ((s * 0.07, y0 + 0.17, 0.62), (s * 0.12, y0 + 0.15, 0.66), (s * 0.17, y0 + 0.06, 0.66)):
            m = b if t[0] * s < 0.1 else c
            tube([m, t], 0.008, 'BLACK')
    # vòng cổ vàng + chuông
    torus((0, y0 + 0.11, 0.33), 0.042, 0.012, 'GOLD', rot=(math.radians(60), 0, 0))
    sphere((0, y0 + 0.155, 0.31), 0.016, 'GOLD', seg=10, rings=6)
    # dây cương vàng nối mũi xe với vòng cổ
    for s in (-1, 1):
        tube([(s * (W - 0.02), 0.20, 0.30), (s * 0.08, 0.27, 0.30), (s * 0.04, y0 + 0.10, 0.33)], 0.007, 'GOLD')

def build_rider():
    """ông già Noel ngồi trong xe, 2 tay cầm cương (nhìn từ trên thấy rõ mũ + quả bông + râu trắng)"""
    y, z = -0.22, 0.23
    sphere((0, y, z + 0.12), (0.12, 0.10, 0.12), 'RED', seg=18, rings=12)       # thân
    torus((0, y, z + 0.06), 0.11, 0.025, 'WHITE')                               # gấu áo lông trắng
    torus((0, y, z + 0.11), 0.118, 0.015, 'BLACK')                              # thắt lưng
    box((0, y + 0.115, z + 0.11), (0.05, 0.012, 0.035), 'GOLD')
    for s in (-1, 1):                                                           # đùi đặt lên ghế
        cyl((s * 0.05, y, z + 0.04), (s * 0.05, y + 0.14, z + 0.04), 0.04, 'RED', seg=10)
        box((s * 0.05, y + 0.17, z + 0.02), (0.06, 0.08, 0.06), 'BLACK', bevel=0.012)
        # tay vươn ra trước cầm dây cương
        cyl((s * 0.11, y + 0.02, z + 0.18), (s * 0.08, y + 0.15, z + 0.13), 0.032, 'RED', seg=10)
        torus((s * 0.08, y + 0.15, z + 0.13), 0.028, 0.01, 'WHITE', rot=(math.pi / 2, 0, 0))
        sphere((s * 0.075, y + 0.175, z + 0.125), 0.028, 'WHITE', seg=10, rings=6)
        tube([(s * 0.075, y + 0.18, z + 0.125), (s * 0.10, 0.10, 0.31), (s * (W - 0.02), 0.20, 0.30)], 0.006, 'GOLD')
    sphere((0, y + 0.01, z + 0.29), 0.085, 'SKIN', seg=18, rings=12)            # đầu
    sphere((0, y + 0.06, z + 0.25), (0.075, 0.06, 0.07), 'WHITE', seg=14, rings=10)  # râu
    sphere((0, y + 0.085, z + 0.29), 0.018, 'SKIN', seg=10, rings=6)            # mũi
    for s in (-1, 1):
        sphere((s * 0.028, y + 0.075, z + 0.315), 0.01, 'BLACK', seg=8, rings=5)
        sphere((s * 0.03, y + 0.085, z + 0.275), (0.03, 0.014, 0.013), 'WHITE', seg=8, rings=5)  # ria
    torus((0, y + 0.005, z + 0.34), 0.08, 0.022, 'WHITE')                       # viền mũ
    cyl((0, y + 0.005, z + 0.345), (0, y - 0.03, z + 0.45), 0.08, 'RED', seg=16, r2=0.035)
    cyl((0, y - 0.03, z + 0.445), (0.02, y - 0.10, z + 0.49), 0.036, 'RED', seg=12, r2=0.012)
    sphere((0.025, y - 0.11, z + 0.49), 0.03, 'WHITE', seg=10, rings=6)         # quả bông

def finish_mesh(name):
    o = bake(list(parts), name)
    o.data.transform(Matrix.Translation((0, 0.02, 0)))   # cân giữa khung va chạm y ±0.5
    o.data.materials.append(mat)
    ws = [v.co for v in o.data.vertices]
    print(name, "bbox", [round(min(p[i] for p in ws), 3) for i in range(3)], [round(max(p[i] for p in ws), 3) for i in range(3)], "verts", len(ws))
    return o

parts = []; build_sleigh(); build_deer()
empty = finish_mesh("Sleigh")
parts = []; build_sleigh(); build_deer(); build_rider()
ride = finish_mesh("SleighRider")
ride.location.x = 1.0   # chỉ để tách nhau khi xem trong Blender; export dùng toạ độ mesh, node vị trí bị Cocos bỏ qua
bpy.ops.object.select_all(action='DESELECT')
empty.select_set(True); ride.select_set(True)
ride.location.x = 0.0
bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT, "Sleigh.glb"), export_format='GLB',
                          use_selection=True, export_yup=True, export_apply=True, export_image_format='NONE')
print("DONE")
