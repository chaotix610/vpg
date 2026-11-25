"""Convert Quaternius (Universal Base Characters / Superhero) glTFs to VPG Rig 2.0 GLBs.

Source rig: the 65-bone Quaternius/UE-style skeleton (root, pelvis, spine_01..03, neck_01,
Head, clavicles, arms, five-finger chains, legs, ball/leaf bones). It is the VPG rig minus the
six helper bones (ik_hand_root, ik_hand_gun, ik_hand_l, ik_hand_r, socket_offhand,
socket_offhand_grip), but its rest rotations differ from VPG's by up to ~14 degrees (spine_03,
neck_01, feet). The viewer copies clip rotations onto bones unchanged, so the rest rotations
must be exactly the template's (public/assets/characters/models/mannequin-blue.glb).

Per file:
  1. Import; fix image paths the source files get wrong (e.g. T_Eye_Normal_png.png ->
     T_Eye_Normal.png).
  2. Scale uniformly about the origin so hip height (thigh heads) equals the template's, as
     convert_n64_to_vpg.py does; this keeps feet planted when the viewer retargets clip
     translations (char rest + clip delta). Bake the scale into the meshes.
  3. Copy the template armature and move every bone head onto the source joint without
     rotating it. pelvis keeps the template's exact position (as aki-man and steve-austin
     do); root, ik_hand_root, ik_hand_gun and socket_offhand stay at the origin; ik_hand_l/r
     and socket_offhand_grip follow the template's offset from the hand, scaled to the hand.
  4. Re-skin every mesh to the new armature (vertex group names already match).
  5. Export <out>/<stem>.glb: armature node = <stem>, meshes = <stem>_<part>.

Hair "Rigged to Head Bone" files carry the full skeleton of the body they were modelled on
(female or male), so the same steps put them on exactly the converted body's rig.

Usage:
  blender --background --factory-startup --python scripts/blender/convert_quaternius_to_vpg.py
      Converts local/characters/quarternius/base_characters/*.gltf into
      public/assets/characters/models/quarternius/base-characters/ and
      local/characters/quarternius/hairstyles/Rigged to Head Bone/glTF/*.gltf into
      public/assets/characters/models/quarternius/hairstyles/ (existing files are overwritten).
  From Python in a live session: exec the file, then call main().
"""
import glob
import os
import re

import bpy
from mathutils import Matrix, Vector


def _repo_root():
    here = globals().get("__file__")
    if here:
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isdir(os.path.join(root, "public", "assets", "characters")):
            return root
    return os.getcwd()


REPO = _repo_root()
TEMPLATE_GLB = os.path.join(REPO, "public", "assets", "characters", "models", "mannequin-blue.glb")
SRC_DIR = os.path.join(REPO, "local", "characters", "quarternius")
OUT_DIR = os.path.join(REPO, "public", "assets", "characters", "models", "quarternius")
JOBS = [
    (os.path.join(SRC_DIR, "base_characters"), os.path.join(OUT_DIR, "base-characters")),
    (os.path.join(SRC_DIR, "hairstyles", "Rigged to Head Bone", "glTF"), os.path.join(OUT_DIR, "hairstyles")),
]
TEMPLATE_NAME = "VPG_TEMPLATE"
HELPERS_AT_ORIGIN = ("root", "ik_hand_root", "ik_hand_gun", "socket_offhand")
TRACKED = ("objects", "actions", "meshes", "armatures", "materials", "images", "collections")


def stem_for(path):
    name = os.path.splitext(os.path.basename(path))[0]
    name = re.sub(r"_FullBody$", "", name)
    name = re.sub(r"(?<=[a-z])(?=[A-Z])", "_", name)  # SimpleParted -> Simple_Parted
    return re.sub(r"[\s_]+", "-", name).lower()


def ensure_object_mode():
    if bpy.context.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')


def select_only(*objs, active=None):
    vl = bpy.context.view_layer
    for o in vl.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    vl.objects.active = active or objs[0]


def gltf_import(path):
    before = {k: set(getattr(bpy.data, k)) for k in TRACKED}
    bpy.ops.import_scene.gltf(filepath=path, disable_bone_shape=True, import_shading='NORMALS')
    return {k: [d for d in getattr(bpy.data, k) if d not in before[k]] for k in TRACKED}


def remove_created(created, keep=()):
    for o in created["objects"]:
        if o not in keep and o.name in bpy.data.objects:
            bpy.data.objects.remove(o, do_unlink=True)
    for k in ("actions", "meshes", "armatures", "materials", "images"):
        pool = getattr(bpy.data, k)
        for d in created[k]:
            if d.name in pool and d.users == 0:
                pool.remove(d)


def load_template():
    tmpl = bpy.data.objects.get(TEMPLATE_NAME)
    if tmpl is not None:
        return tmpl, False
    created = gltf_import(TEMPLATE_GLB)
    tmpl = next(o for o in created["objects"] if o.type == 'ARMATURE')
    remove_created(created, keep=(tmpl,))
    tmpl.name = TEMPLATE_NAME
    tmpl.matrix_world = Matrix.Identity(4)
    tmpl.hide_set(True)
    bpy.context.view_layer.update()
    return tmpl, True


def remove_template(tmpl):
    data = tmpl.data
    bpy.data.objects.remove(tmpl, do_unlink=True)
    if data.users == 0:
        bpy.data.armatures.remove(data)


def fix_missing_images(images, src_dir):
    """Point images at files that exist, e.g. T_Eye_Normal_png.png -> T_Eye_Normal.png."""
    fixed = []
    for img in images:
        path = bpy.path.abspath(img.filepath) if img.filepath else ""
        if img.packed_file or (path and os.path.isfile(path)):
            continue
        base = os.path.basename(path or img.name)
        for cand in (base.replace("_png.png", ".png"), base.replace(".png", "_png.png")):
            for d in (src_dir, os.path.join(src_dir, "..", "..", "Textures")):
                p = os.path.normpath(os.path.join(d, cand))
                if os.path.isfile(p):
                    img.filepath = p
                    img.reload()
                    fixed.append((base, cand))
                    break
            else:
                continue
            break
        else:
            fixed.append((base, None))
    return fixed


def world_heads(arm):
    W = arm.matrix_world
    return {b.name: W @ b.head_local for b in arm.data.bones}


def vpg_heads(J, T):
    N = {}
    for name in T:
        if name in HELPERS_AT_ORIGIN or name == "pelvis":
            N[name] = T[name].copy()
        elif name in J:
            N[name] = J[name].copy()
    for s in ("l", "r"):
        sh = (N[f"middle_01_{s}"] - N[f"hand_{s}"]).length / (T[f"middle_01_{s}"] - T[f"hand_{s}"]).length
        N[f"ik_hand_{s}"] = N[f"hand_{s}"] + (T[f"ik_hand_{s}"] - T[f"hand_{s}"]) * sh
    N["socket_offhand_grip"] = N["hand_l"] + (T["socket_offhand_grip"] - T["hand_l"]) * (
        (N["middle_01_l"] - N["hand_l"]).length / (T["middle_01_l"] - T["hand_l"]).length)
    missing = set(T) - set(N)
    assert not missing, f"no position for {missing}"
    return N


def build_armature(tmpl, N, stem, length_scale, coll):
    data = tmpl.data.copy()
    data.name = stem
    arm = bpy.data.objects.new(stem, data)
    coll.objects.link(arm)
    arm.matrix_world = Matrix.Identity(4)
    ensure_object_mode()
    select_only(arm)
    bpy.ops.object.mode_set(mode='EDIT')
    for eb in data.edit_bones:
        eb.use_connect = False
    for eb in data.edit_bones:
        length = eb.length
        eb.matrix = Matrix.Translation(N[eb.name]) @ eb.matrix.to_3x3().to_4x4()  # move, don't rotate
        eb.length = length * length_scale
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


def export_glb(arm, meshes, path):
    ensure_object_mode()
    select_only(arm, *meshes, active=arm)
    opts = dict(
        filepath=path, export_format='GLB', use_selection=True,
        export_animations=False, export_skins=True, export_morph=False, export_apply=False,
        export_yup=True, export_texcoords=True, export_normals=True, export_tangents=False,
        export_materials='EXPORT', export_image_format='AUTO', export_def_bones=False,
        export_cameras=False, export_lights=False, export_extras=False,
    )
    supported = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    bpy.ops.export_scene.gltf(**{k: v for k, v in opts.items() if k in supported})


def part_name(stem, mesh_obj, n_meshes):
    if n_meshes == 1:
        return f"{stem}_mesh"
    low = mesh_obj.name.lower()
    for part in ("eyebrows", "eyes"):
        if low.startswith(part):
            return f"{stem}_{part}"
    return f"{stem}_body"


def convert(src, out_path, tmpl, coll):
    stem = os.path.splitext(os.path.basename(out_path))[0]
    created = gltf_import(src)
    log = {"src": src, "out": out_path}
    log["images"] = fix_missing_images(created["images"], os.path.dirname(src))

    src_arm = next(o for o in created["objects"] if o.type == 'ARMATURE')
    meshes = [o for o in created["objects"] if o.type == 'MESH']
    for pb in src_arm.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()

    T = world_heads(tmpl)
    J = world_heads(src_arm)
    t_hip = (T["thigh_l"].z + T["thigh_r"].z) / 2
    s_hip = (J["thigh_l"].z + J["thigh_r"].z) / 2
    s = t_hip / s_hip
    S = Matrix.Diagonal((s, s, s, 1.0))
    J = {k: S @ v for k, v in J.items()}
    log["scale"] = s

    # Bake world transform * scale into each mesh, unparented.
    for m in meshes:
        mw = S @ m.matrix_world
        m.parent = None
        for mod in [md for md in m.modifiers if md.type == 'ARMATURE']:
            m.modifiers.remove(mod)
        m.data = m.data.copy() if m.data.users > 1 else m.data
        m.data.transform(mw)
        m.matrix_world = Matrix.Identity(4)

    arm = build_armature(tmpl, vpg_heads(J, T), stem, s, coll)

    for m in meshes:
        for c in m.users_collection:
            c.objects.unlink(m)
        coll.objects.link(m)
        m.parent = arm
        m.matrix_parent_inverse = Matrix.Identity(4)
        mod = m.modifiers.new("Armature", 'ARMATURE')
        mod.object = arm
        unknown = [g.name for g in m.vertex_groups if g.name not in arm.data.bones]
        if unknown:
            log.setdefault("unknown_groups", {})[m.name] = unknown
    for m in meshes:
        new = part_name(stem, m, len(meshes))
        m.name = new
        m.data.name = new
    bpy.context.view_layer.update()

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    export_glb(arm, meshes, out_path)
    log["meshes"] = [m.name for m in meshes]

    arm_data = arm.data
    bpy.data.objects.remove(arm, do_unlink=True)
    bpy.data.armatures.remove(arm_data)
    remove_created(created)
    return log


def main():
    ensure_object_mode()
    tmpl, loaded = load_template()
    coll = bpy.data.collections.new("VPG_QUATERNIUS_TMP")
    bpy.context.scene.collection.children.link(coll)
    logs = []
    try:
        for src_dir, out_dir in JOBS:
            for src in sorted(glob.glob(os.path.join(src_dir, "*.gltf"))):
                out = os.path.join(out_dir, stem_for(src) + ".glb")
                logs.append(convert(src, out, tmpl, coll))
                print("converted", logs[-1])
    finally:
        bpy.data.collections.remove(coll)
        if loaded:
            remove_template(tmpl)
    return logs


if __name__ == "__main__":
    main()
