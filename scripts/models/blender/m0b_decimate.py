"""
M0b: decimate a processed scatter prop to a triangle budget with no seam lock
(the static helper locks UV seams, which stops Tripo atlases far above the
budget of a prop seen from 60 m and more). Collapse keeps UVs per corner, so
the texture holds; normals are recomputed smooth by angle.

  blender -b --factory-startup --python-exit-code 1 -P m0b_decimate.py -- <in.glb> <out.glb> <triangles>
"""
import sys
import bpy

args = sys.argv[sys.argv.index("--") + 1:]
source, target, budget = args[0], args[1], int(args[2])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=source, merge_vertices=True)
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
for obj in meshes:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    count = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    if count > budget:
        modifier = obj.modifiers.new("M0bDecimate", "DECIMATE")
        modifier.decimate_type = "COLLAPSE"
        modifier.ratio = budget / count
        modifier.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    print("[m0b-decimate]", obj.name, count, "->", sum(len(p.vertices) - 2 for p in obj.data.polygons), flush=True)
bpy.ops.export_scene.gltf(filepath=target, export_format="GLB", export_yup=True, export_apply=True, export_animations=False, export_skins=False)
