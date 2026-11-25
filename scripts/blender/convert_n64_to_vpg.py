"""Convert N64-style 19-bone character GLBs to VPG Rig 2.0.

Source rig (one rigidly skinned mesh, arms hanging down, origin at mid-body):

  Pelvis > LowerAbdomen > UpperBody > Neck > Head
         |              UpperBody > {Left,Right}UpperArm > Forearm > Hand > Fingers
         > {Left,Right}UpperLeg > LowerLeg > Foot

Output: the mesh skinned to the 71-bone VPG rig, rest rotations identical to
public/assets/characters/models/mannequin-blue.glb, no animations, ready for
public/assets/characters/models/ (the viewer lists every .glb in that folder).

Per file:
  1. Import; drop the source clips and the root_motion empty.
  2. Face -Y in Blender (glTF +Z), scale uniformly so hip height equals the template's
     thigh height, soles on z=0, hips centred on the template's hips. Matching hip height
     keeps feet planted when the viewer retargets clip translations (char rest + clip delta).
  3. Raise the arms into the VPG T-pose (every arm segment along +/-X) and bake it into the mesh.
  4. Copy the template armature and translate each bone onto the source joints without
     rotating it, so the exported rest rotations stay identical to every other VPG character.
     pelvis keeps the template's exact position (as aki-man does); spine_01 = LowerAbdomen,
     spine_03 = UpperBody, middle_01 = Fingers; bones with no source joint (spine_02,
     clavicles, other fingers, ball, IK/socket helpers) follow the template layout, scaled.
  5. Rename vertex groups (GROUP_MAP) and skin the mesh to the new armature. The finger block
     goes rigidly on middle_01: VPG clips drive only the four *_01 finger bones, all with the
     same rotation (the N64 Fingers curl). The thumb is part of the palm and stays on hand.
  6. Swap the N64 hands for aki-man's five-finger hands (replace_hands.py: mesh, finger weights,
     finger bone layout, skin-tinted textures). Skip with --n64-hands.
  7. Export <out_dir>/<stem>.glb; stem is the file name in kebab-case (the_rock_01a -> the-rock-01a).
     Armature node = <stem>, mesh = <stem>_mesh, as in aki-man.glb.

Usage:
  blender --background --factory-startup --python scripts/blender/convert_n64_to_vpg.py -- [--out DIR] [--n64-hands] [FILE.glb ...]
      No files: converts every .glb in local/characters/conversion-jobs/.
      Default --out: public/assets/characters/models/ (existing files with the same name are overwritten).
  Inside Blender (Text Editor > Run Script) it does the same as running with no arguments.
  From Python in a live session: exec the file, then call convert(src_path[, stem, out_path, hands]).
"""
import os
import re
import sys
from math import pi

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
JOBS_DIR = os.path.join(REPO, "local", "characters", "conversion-jobs")
MODELS_DIR = os.path.join(REPO, "public", "assets", "characters", "models")
TEMPLATE_NAME = "VPG_TEMPLATE"

GROUP_MAP = {
    "Pelvis": "pelvis",
    "LowerAbdomen": "spine_01",
    "UpperBody": "spine_03",
    "Neck": "neck_01",
    "Head": "Head",
    "LeftUpperArm": "upperarm_l", "LeftForearm": "lowerarm_l", "LeftHand": "hand_l", "LeftFingers": "middle_01_l",
    "RightUpperArm": "upperarm_r", "RightForearm": "lowerarm_r", "RightHand": "hand_r", "RightFingers": "middle_01_r",
    "LeftUpperLeg": "thigh_l", "LeftLowerLeg": "calf_l", "LeftFoot": "foot_l",
    "RightUpperLeg": "thigh_r", "RightLowerLeg": "calf_r", "RightFoot": "foot_r",
}
TRACKED = ("objects", "actions", "meshes", "armatures", "materials", "images", "collections")


def kebab(name):
    return re.sub(r"[\s_]+", "-", os.path.splitext(os.path.basename(name))[0]).lower()


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


def load_template():
    """The VPG template armature (from mannequin-blue.glb), at the origin. Returns (armature, loaded_now)."""
    tmpl = bpy.data.objects.get(TEMPLATE_NAME)
    if tmpl is not None:
        return tmpl, False
    created = gltf_import(TEMPLATE_GLB)
    tmpl = next(o for o in created["objects"] if o.type == 'ARMATURE')
    for o in created["objects"]:
        if o is not tmpl:
            bpy.data.objects.remove(o, do_unlink=True)
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


def world_heads(arm, posed=True):
    W = arm.matrix_world
    if posed:
        return {pb.name: W @ pb.head for pb in arm.pose.bones}
    return {b.name: W @ b.head_local for b in arm.data.bones}


def mesh_world_verts(mesh):
    """Evaluated (deformed) vertex positions in world space."""
    ev = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me = ev.to_mesh()
    pts = [mesh.matrix_world @ v.co for v in me.vertices]
    ev.to_mesh_clear()
    return pts


def setup_source(arm, mesh, tmpl):
    """Face -Y, scale so hip height == template thigh height, soles on z=0, hips on the template's."""
    for pb in arm.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    if arm.animation_data:
        arm.animation_data.action = None
    bpy.context.view_layer.update()

    T = world_heads(tmpl, posed=False)
    t_hip = (T["thigh_l"] + T["thigh_r"]) / 2

    H = world_heads(arm)
    sole = min(p.z for p in mesh_world_verts(mesh))
    s = t_hip.z / ((H["LeftUpperLeg"].z + H["RightUpperLeg"].z) / 2 - sole)
    k = arm.matrix_world.to_scale().x * s
    arm.matrix_world = Matrix.Diagonal((k, k, k, 1.0))
    bpy.context.view_layer.update()

    H = world_heads(arm)
    if H["LeftUpperArm"].x < H["RightUpperArm"].x:  # character's left must be on +X
        arm.matrix_world = Matrix.Rotation(pi, 4, 'Z') @ arm.matrix_world
        bpy.context.view_layer.update()
        H = world_heads(arm)

    hip = (H["LeftUpperLeg"] + H["RightUpperLeg"]) / 2
    sole = min(p.z for p in mesh_world_verts(mesh))
    arm.matrix_world = Matrix.Translation(Vector((t_hip.x - hip.x, t_hip.y - hip.y, -sole))) @ arm.matrix_world
    bpy.context.view_layer.update()
    return s


def align_bone(arm, name, target_dir, child=None):
    """Rotate a pose bone about its head so head->child head (or its Y axis) points along target_dir."""
    W = arm.matrix_world
    pb = arm.pose.bones[name]
    if child:
        cur = (W @ arm.pose.bones[child].head) - (W @ pb.head)
    else:
        cur = W.to_3x3() @ (pb.matrix.to_3x3() @ Vector((0, 1, 0)))
    q = cur.normalized().rotation_difference(target_dir.normalized())
    W3 = W.to_3x3().normalized()
    R = (W3.inverted() @ q.to_matrix() @ W3).to_4x4()
    h = pb.head.copy()
    pb.matrix = Matrix.Translation(h) @ R @ Matrix.Translation(-h) @ pb.matrix
    bpy.context.view_layer.update()


def t_pose(arm):
    for side, sign in (("Left", 1), ("Right", -1)):
        d = Vector((sign, 0, 0))
        align_bone(arm, f"{side}UpperArm", d, f"{side}Forearm")
        align_bone(arm, f"{side}Forearm", d, f"{side}Hand")
        align_bone(arm, f"{side}Hand", d, f"{side}Fingers")
        align_bone(arm, f"{side}Fingers", d)


def vpg_heads(J, T, toe_y):
    """World head position for every VPG bone. J = posed source joints, T = template heads."""
    N = {"root": T["root"].copy(), "pelvis": T["pelvis"].copy()}
    N["spine_01"] = J["LowerAbdomen"].copy()
    N["spine_03"] = J["UpperBody"].copy()
    r = (T["spine_02"].z - T["spine_01"].z) / (T["spine_03"].z - T["spine_01"].z)
    N["spine_02"] = N["spine_01"].lerp(N["spine_03"], r)
    N["neck_01"] = J["Neck"].copy()
    N["Head"] = J["Head"].copy()
    for helper in ("ik_hand_root", "ik_hand_gun", "socket_offhand"):
        N[helper] = T[helper].copy()

    for s, side in (("l", "Left"), ("r", "Right")):
        N[f"upperarm_{s}"] = J[f"{side}UpperArm"].copy()
        N[f"lowerarm_{s}"] = J[f"{side}Forearm"].copy()
        N[f"hand_{s}"] = J[f"{side}Hand"].copy()
        N[f"middle_01_{s}"] = J[f"{side}Fingers"].copy()

        # clavicle: x scaled with shoulder width, y offset from spine_03, z offset from the shoulder
        sx = N[f"upperarm_{s}"].x / T[f"upperarm_{s}"].x
        tc, tu = T[f"clavicle_{s}"], T[f"upperarm_{s}"]
        N[f"clavicle_{s}"] = Vector((
            N[f"upperarm_{s}"].x + (tc.x - tu.x) * sx,
            N["spine_03"].y + (tc.y - T["spine_03"].y),
            N[f"upperarm_{s}"].z + (tc.z - tu.z),
        ))

        # fingers, thumb and hand IK target: template layout scaled to the hand -> knuckle distance
        sh = (N[f"middle_01_{s}"] - N[f"hand_{s}"]).length / (T[f"middle_01_{s}"] - T[f"hand_{s}"]).length
        for f in ("index", "ring", "pinky"):
            N[f"{f}_01_{s}"] = N[f"middle_01_{s}"] + (T[f"{f}_01_{s}"] - T[f"middle_01_{s}"]) * sh
        N[f"thumb_01_{s}"] = N[f"hand_{s}"] + (T[f"thumb_01_{s}"] - T[f"hand_{s}"]) * sh
        for f in ("index", "middle", "ring", "pinky", "thumb"):
            chain = [f"{f}_01_{s}", f"{f}_02_{s}", f"{f}_03_{s}", f"{f}_04_leaf_{s}"]
            for parent, child in zip(chain, chain[1:]):
                N[child] = N[parent] + (T[child] - T[parent]) * sh
        N[f"ik_hand_{s}"] = N[f"hand_{s}"] + (T[f"ik_hand_{s}"] - T[f"hand_{s}"]) * sh

        N[f"thigh_{s}"] = J[f"{side}UpperLeg"].copy()
        N[f"calf_{s}"] = J[f"{side}LowerLeg"].copy()
        N[f"foot_{s}"] = J[f"{side}Foot"].copy()
        # ball / toe tip: template layout, y scaled to the real foot length, z to the ankle height
        sy = (N[f"foot_{s}"].y - toe_y[s]) / (T[f"foot_{s}"].y - T[f"ball_leaf_{s}"].y)
        sz = N[f"foot_{s}"].z / T[f"foot_{s}"].z
        for parent, child in ((f"foot_{s}", f"ball_{s}"), (f"ball_{s}", f"ball_leaf_{s}")):
            d = T[child] - T[parent]
            N[child] = N[parent] + Vector((d.x, d.y * sy, d.z * sz))

    N["socket_offhand_grip"] = N["ik_hand_l"].copy()
    return N


def build_armature(tmpl, N, stem, length_scale, coll):
    data = tmpl.data.copy()
    data.name = stem
    arm = bpy.data.objects.new(stem, data)
    coll.objects.link(arm)
    arm.matrix_world = Matrix.Identity(4)
    missing = set(b.name for b in data.bones) - set(N)
    assert not missing, f"no position for {missing}"

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


def max_rotation_diff(arm, tmpl):
    worst = 0.0
    for b in arm.data.bones:
        a = b.matrix_local.to_quaternion().rotation_difference(tmpl.data.bones[b.name].matrix_local.to_quaternion()).angle
        worst = max(worst, min(a, 2 * pi - a))  # q and -q are the same rotation
    return worst


def strip_suffixes(pairs):
    """Temporarily drop Blender's .001 suffixes so exported names match the source file."""
    renamed = []
    for block, pool in pairs:
        base = re.sub(r"\.\d{3}$", "", block.name)
        if base == block.name:
            continue
        holder = pool.get(base)
        if holder is not None:
            renamed.append((holder, holder.name))
            holder.name = base + ".vpg_tmp"
        renamed.append((block, block.name))
        block.name = base
    return renamed


def export_glb(arm, mesh, path):
    ensure_object_mode()
    select_only(arm, mesh, active=arm)
    opts = dict(
        filepath=path, export_format='GLB', use_selection=True,
        export_animations=False, export_skins=True, export_morph=False, export_apply=False,
        export_yup=True, export_texcoords=True, export_normals=True, export_tangents=False,
        export_materials='EXPORT', export_image_format='AUTO', export_def_bones=False,
        export_cameras=False, export_lights=False, export_extras=False,
    )
    supported = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    pairs = [(arm, bpy.data.objects), (mesh, bpy.data.objects), (mesh.data, bpy.data.meshes)]
    pairs += [(m, bpy.data.materials) for m in mesh.data.materials if m]
    renamed = strip_suffixes(pairs)
    try:
        bpy.ops.export_scene.gltf(**{k: v for k, v in opts.items() if k in supported})
    finally:
        for block, name in reversed(renamed):
            block.name = name


_DONOR = None  # aki-man armature + mesh, loaded on first use when hands are replaced


def _hands_module():
    here = os.path.dirname(os.path.abspath(globals().get("__file__", "") or "."))
    if here not in sys.path:
        sys.path.insert(0, here)
    import replace_hands
    return replace_hands


def convert(src, stem=None, out=None, hands=True):
    """Convert one GLB. Leaves the result (armature + mesh) in a collection named after the stem.
    hands=True swaps the N64 hands for aki-man's (see replace_hands.py)."""
    global _DONOR
    stem = stem or kebab(src)
    out = out or os.path.join(MODELS_DIR, stem + ".glb")
    ensure_object_mode()
    tmpl, _ = load_template()

    created = gltf_import(src)
    arm = next((o for o in created["objects"] if o.type == 'ARMATURE' and "Pelvis" in o.data.bones), None)
    if arm is None:
        raise ValueError(f"{src}: no 19-bone (Pelvis/LowerAbdomen/...) armature found")
    meshes = [o for o in created["objects"] if o.type == 'MESH' and o.parent == arm]
    if len(meshes) != 1:
        raise ValueError(f"{src}: expected one skinned mesh, found {len(meshes)}")
    mesh = meshes[0]
    missing = [g.name for g in mesh.vertex_groups if g.name not in GROUP_MAP]
    if missing:
        raise ValueError(f"{src}: vertex groups with no VPG equivalent: {missing}")

    coll = bpy.data.collections.new(stem)
    bpy.context.scene.collection.children.link(coll)
    for o in (arm, mesh):
        for c in list(o.users_collection):
            c.objects.unlink(o)
        coll.objects.link(o)
    for o in created["objects"]:
        if o not in (arm, mesh):
            bpy.data.objects.remove(o, do_unlink=True)
    for a in created["actions"]:
        bpy.data.actions.remove(a)
    for c in created["collections"]:
        if not c.all_objects:
            bpy.data.collections.remove(c)

    s = setup_source(arm, mesh, tmpl)
    t_pose(arm)
    J = world_heads(arm)

    pts = mesh_world_verts(mesh)
    toe_y = {}
    for side_key, side in (("l", "Left"), ("r", "Right")):
        gi = mesh.vertex_groups[f"{side}Foot"].index
        toe_y[side_key] = min(pts[v.index].y for v in mesh.data.vertices
                              if any(g.group == gi and g.weight > 0.5 for g in v.groups))

    # bake the T-pose into the mesh and put it in world space with no parent
    select_only(mesh)
    for md in list(mesh.modifiers):
        if md.type == 'ARMATURE':
            bpy.ops.object.modifier_apply(modifier=md.name)
    mw = mesh.matrix_world.copy()
    mesh.parent = None
    mesh.data.transform(mw)
    mesh.matrix_world = Matrix.Identity(4)

    old_data = arm.data
    bpy.data.objects.remove(arm, do_unlink=True)
    bpy.data.armatures.remove(old_data)

    new_arm = build_armature(tmpl, vpg_heads(J, world_heads(tmpl, posed=False), toe_y), stem, s, coll)
    for g in mesh.vertex_groups:
        g.name = GROUP_MAP[g.name]
    mesh.parent = new_arm
    mesh.matrix_parent_inverse = Matrix.Identity(4)
    mesh.modifiers.new("Armature", 'ARMATURE').object = new_arm
    mesh.name = f"{stem}_mesh"
    mesh.data.name = stem

    if hands:
        rh = _hands_module()
        if _DONOR is None or any(o.name not in bpy.data.objects for o in _DONOR):
            _DONOR = rh.load_donor()
        rh.replace_hands(new_arm, mesh, *_DONOR, stem)

    worst = max_rotation_diff(new_arm, tmpl)
    if worst > 1e-3:
        raise RuntimeError(f"{stem}: rest rotations drifted from the template by {worst:.4f} rad")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    export_glb(new_arm, mesh, out)
    zs = [p.z for p in mesh_world_verts(mesh)]
    print(f"{stem}: scale x{s:.4f}, height {max(zs) - min(zs):.3f} m -> {out}")
    return new_arm, mesh


def main(argv):
    global _DONOR
    out_dir, files, hands = MODELS_DIR, [], True
    it = iter(argv)
    for a in it:
        if a == "--out":
            out_dir = os.path.abspath(next(it))
        elif a == "--n64-hands":
            hands = False
        else:
            files.append(os.path.abspath(a))
    if not files:
        files = sorted(os.path.join(JOBS_DIR, f) for f in os.listdir(JOBS_DIR) if f.lower().endswith(".glb"))
    if not files:
        print(f"Nothing to convert in {JOBS_DIR}")
        return
    tmpl, loaded = load_template()
    try:
        for f in files:
            stem = kebab(f)
            convert(f, stem, os.path.join(out_dir, stem + ".glb"), hands)
    finally:
        if loaded:
            remove_template(tmpl)
        if _DONOR is not None:
            _hands_module().remove_donor(_DONOR)
            _DONOR = None


if __name__ == "__main__":
    main(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
