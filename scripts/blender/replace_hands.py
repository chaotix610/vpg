"""Replace the hands of VPG Rig 2.0 characters with aki-man's five-finger hands.

Meant for characters made by convert_n64_to_vpg.py: their N64 hands are a rigid palm + thumb
(hand_*) and one curled four-finger block (middle_01_*). aki-man.glb went through the same
N64 pipeline and then got proper hands with full finger chains; this copies them over.
convert_n64_to_vpg.py already runs this step by default; use this script on its own for
characters converted with --n64-hands or by other means.

Per character and side:
  1. Delete the old hand (verts mostly weighted to hand/finger bones) but keep its wrist ring:
     the 7 verts the forearm bridge faces attach to, so the forearm UVs and seam stay as they were.
  2. Copy aki-man's hand faces (UVs, normals, finger weights), placed relative to hand_* (every
     VPG character shares the same bone orientations, so this is a pure translation).
  3. Close the wrist: aki-man's hand is a closed shell, so its flat wrist-end cap is removed and
     the open edge is stitched to the target's open forearm ring with a band of triangles
     (walked by angle around the arm). Forearm and hand then share those vertices; there are no
     holes and no T-junctions. The hand's wrist edge is seated WRIST_GAP past the ring.
  4. Move the five finger chains on the rig to aki-man's layout relative to hand_*, so the
     fingers bend at the same knuckles. Rotations are untouched (still identical to the template).
  5. Texture: aki-man's glove textures (white with orange pads) recoloured to skin: pads removed,
     the glove's shading kept as creases, tinted so the hand's mean colour matches the
     character's original hand texture.

Usage:
  blender --background --factory-startup --python scripts/blender/replace_hands.py -- [--out DIR] [--donor GLB] FILE.glb ...
      Rewrites each file in place unless --out is given. --donor defaults to
      public/assets/characters/models/aki-man.glb.
  From Python in a live session: exec the file, then call
      replace_hands(target_armature, target_mesh, donor_armature, donor_mesh, stem).
"""
import math
import os
import sys
from collections import Counter

import bpy
import numpy as np
from mathutils import Matrix, Vector

_here = os.path.dirname(os.path.abspath(globals().get("__file__", "") or "."))
if _here not in sys.path:
    sys.path.insert(0, _here)
import convert_n64_to_vpg as conv  # noqa: E402  (shared import/export helpers)

DONOR_GLB = os.path.join(conv.MODELS_DIR, "aki-man.glb")
HAND_PREFIXES = ("hand_", "thumb_", "index_", "middle_", "ring_", "pinky_")
FINGER_CHAINS = ("thumb", "index", "middle", "ring", "pinky")
END_CAP_TOLERANCE = 0.0015  # donor faces this close to the hand's wrist end plane form its end cap
WRIST_GAP = 0.01            # the hand's wrist edge sits this far past the forearm ring (stitch band length)
WRIST_BLEND = 0.03          # hand verts within this distance of the wrist edge are eased along with it


def is_hand_group(name):
    return name.startswith(HAND_PREFIXES)


def side_of(x):
    return "l" if x > 0 else "r"


# ---------------------------------------------------------------- mesh snapshot

class MeshData:
    """Plain-Python copy of a mesh: world positions, faces, per-corner UVs/normals, weights."""

    def __init__(self, obj):
        me = obj.data
        mw = obj.matrix_world
        self.obj = obj
        self.co = [mw @ v.co for v in me.vertices]
        self.faces = [tuple(p.vertices) for p in me.polygons]
        self.mat = [p.material_index for p in me.polygons]
        self.materials = list(me.materials)
        uv = me.uv_layers.active.data
        normals = me.corner_normals
        n3 = mw.to_3x3().normalized()
        self.uvs = [tuple(tuple(uv[l].uv) for l in p.loop_indices) for p in me.polygons]
        self.nrm = [tuple(tuple((n3 @ normals[l].vector).normalized()) for l in p.loop_indices) for p in me.polygons]
        names = {g.index: g.name for g in obj.vertex_groups}
        self.weights = [{names[g.group]: g.weight for g in v.groups if g.weight > 1e-5} for v in me.vertices]

    def hand_share(self, i):
        w = self.weights[i]
        total = sum(w.values()) or 1.0
        return sum(v for k, v in w.items() if is_hand_group(k)) / total


def hand_parts(md, threshold):
    """Per side: hand verts, wrist ring verts (hand verts on faces that also touch the arm), hand faces, caps."""
    out = {}
    hand = {i for i in range(len(md.co)) if md.hand_share(i) >= threshold}
    for s in ("l", "r"):
        hv = {i for i in hand if side_of(md.co[i].x) == s}
        ring = set()
        for f in md.faces:
            inside = [i in hv for i in f]
            if any(inside) and not all(inside):
                ring.update(i for i in f if i in hv)
        faces = [k for k, f in enumerate(md.faces) if all(i in hv for i in f)]
        caps = [k for k in faces if all(i in ring for i in md.faces[k])]
        out[s] = {"verts": hv, "ring": ring, "faces": [k for k in faces if k not in caps], "caps": caps}
    return out


def pos_key(p):
    return (round(p.x, 5), round(p.y, 5), round(p.z, 5))


def unique_by_position(md, ids):
    """One representative vertex per distinct position (glTF splits vertices at UV seams)."""
    reps = {}
    for i in sorted(ids):
        reps.setdefault(pos_key(md.co[i]), i)
    return list(reps.values())


def boundary_loop(md, face_ids):
    """The open edge loop of a set of faces, compared by position. Returns
    {position key: (vertex, uv, face)} for every loop vertex, taken from the face that owns the open edge."""
    count, owner = Counter(), {}
    for k in face_ids:
        f = md.faces[k]
        for c in range(len(f)):
            a, b = f[c], f[(c + 1) % len(f)]
            e = frozenset((pos_key(md.co[a]), pos_key(md.co[b])))
            count[e] += 1
            owner.setdefault(e, (k, c))
    loop = {}
    for e, n in count.items():
        if n != 1:
            continue
        k, c = owner[e]
        f = md.faces[k]
        for cc in (c, (c + 1) % len(f)):
            loop.setdefault(pos_key(md.co[f[cc]]), (f[cc], md.uvs[k][cc], k))
    return loop


def zipper(ring, loop, cy, cz):
    """Triangulate the band between two closed loops around the arm (lists of (id, position)),
    walking both by angle around (cy, cz). No T-junctions, every vertex used."""
    ang = lambda p: math.atan2(p.z - cz, p.y - cy)
    A = sorted(ring, key=lambda t: ang(t[1]))
    B = sorted(loop, key=lambda t: ang(t[1]))
    base = ang(A[0][1])
    j0 = min(range(len(B)), key=lambda j: abs(math.remainder(ang(B[j][1]) - base, 2 * math.pi)))
    B = B[j0:] + B[:j0]
    a_ang = [(ang(p) - base) % (2 * math.pi) for _, p in A] + [2 * math.pi]
    d0 = math.remainder(ang(B[0][1]) - base, 2 * math.pi)
    b_ang = [d0 + (ang(p) - ang(B[0][1])) % (2 * math.pi) for _, p in B] + [d0 + 2 * math.pi]
    A, B = A + A[:1], B + B[:1]
    tris, i, j = [], 0, 0
    n, m = len(A) - 1, len(B) - 1
    while i < n or j < m:
        if j >= m or (i < n and a_ang[i + 1] <= b_ang[j + 1]):
            tris.append((A[i][0], A[i + 1][0], B[j][0]))
            i += 1
        else:
            tris.append((A[i][0], B[j + 1][0], B[j][0]))
            j += 1
    return tris


def smoothstep(t):
    t = min(max(t, 0.0), 1.0)
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- textures

def image_array(img):
    a = np.empty(img.size[0] * img.size[1] * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(img.size[1], img.size[0], 4)


def face_image(md, k):
    mat = md.materials[md.mat[k]]
    if mat is None or mat.node_tree is None:
        return None
    tex = next((n for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image), None)
    return tex.image if tex else None


def sample_mean_color(md, faces):
    """Mean texture colour over the given faces (barycentric samples on each face's triangles)."""
    cache, acc, count = {}, np.zeros(3), 0
    bary = [(a / 4, b / 4, 1 - a / 4 - b / 4) for a in range(5) for b in range(5 - a)]
    for k in faces:
        img = face_image(md, k)
        if img is None:
            continue
        if img.name not in cache:
            cache[img.name] = image_array(img)
        px = cache[img.name]
        h, w = px.shape[:2]
        uvs = md.uvs[k]
        for t in range(1, len(uvs) - 1):
            a, b, c = uvs[0], uvs[t], uvs[t + 1]
            for wa, wb, wc in bary:
                u = (wa * a[0] + wb * b[0] + wc * c[0]) % 1.0
                v = (wa * a[1] + wb * b[1] + wc * c[1]) % 1.0
                acc += px[min(int(v * h), h - 1), min(int(u * w), w - 1), :3]
                count += 1
    if not count:
        raise ValueError("no textured hand faces to sample a skin colour from")
    return acc / count


def _dilate(mask, r):
    out = mask.copy()
    for _ in range(r):
        m = out.copy()
        m[1:, :] |= out[:-1, :]
        m[:-1, :] |= out[1:, :]
        m[:, 1:] |= out[:, :-1]
        m[:, :-1] |= out[:, 1:]
        out = m
    return out


def _fill_enclosed(mask):
    """Add every unmasked region the mask fully encloses (not reachable from the image border)."""
    outside = np.zeros_like(mask)
    outside[0, :], outside[-1, :], outside[:, 0], outside[:, -1] = True, True, True, True
    outside &= ~mask
    while True:
        grown = _dilate(outside, 1) & ~mask
        if (grown == outside).all():
            return mask | ~outside
        outside = grown


def _box_blur(a, r):
    """Separable box blur with edge clamping, repeated 3x (~Gaussian)."""
    for _ in range(3):
        for axis in (0, 1):
            pad = [(0, 0), (0, 0)]
            pad[axis] = (r + 1, r)
            c = np.cumsum(np.pad(a, pad, mode='edge'), axis=axis)
            hi = np.take(c, range(2 * r + 1, c.shape[axis]), axis=axis)
            lo = np.take(c, range(0, c.shape[axis] - 2 * r - 1), axis=axis)
            a = (hi - lo) / (2 * r + 1)
    return a


def _inpaint(values, hole):
    """Fill hole pixels from their surroundings: normalized blur for the base, then diffusion."""
    known = (~hole).astype(np.float32)
    base = _box_blur(values * known, 6) / np.maximum(_box_blur(known, 6), 1e-6)
    out = np.where(hole, base, values)
    for _ in range(150):
        avg = (np.roll(out, 1, 0) + np.roll(out, -1, 0) + np.roll(out, 1, 1) + np.roll(out, -1, 1)) / 4
        out = np.where(hole, avg, out)
    return out


SHADING_STRENGTH = 0.7  # how much of the glove's shading survives as skin creases (0 = flat colour)


def skin_image(src, skin_mean, name, out_dir):
    """Glove texture -> skin: paint out the orange pads (and their outlines/shadows), keep the
    glove's shading as a luminance ratio, tint to skin."""
    px = image_array(src)
    rgb = px[..., :3]
    lum = rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    # pads plus their outline and the ~6 px drop shadow under each one
    pads = _dilate(_fill_enclosed((rgb[..., 0] - rgb[..., 2]) > 0.2), 7)
    white = np.percentile(lum[~pads], 90) if (~pads).any() else 1.0
    if pads.any():
        lum = _inpaint(lum, pads)
    ratio = np.clip(1.0 - SHADING_STRENGTH * (1.0 - lum / white), 0.0, 1.1)
    base = np.clip(skin_mean / max(float(ratio.mean()), 1e-3), 0.0, 1.0)
    out = px.copy()
    out[..., :3] = np.clip(ratio[..., None] * base, 0.0, 1.0)
    img = bpy.data.images.new(name, src.size[0], src.size[1], alpha=True)
    img.pixels.foreach_set(out.ravel())
    path = os.path.join(out_dir, name + ".png")
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    img.pack()
    return img


def skin_material(donor_mat, image, name):
    mat = donor_mat.copy()
    mat.name = name
    for n in mat.node_tree.nodes:
        if n.type == 'TEX_IMAGE':
            n.image = image
    return mat


# ---------------------------------------------------------------- rig

def move_finger_bones(target_arm, donor_arm):
    """Put every finger chain at the donor's position relative to hand_l / hand_r (translation only)."""
    dW, tW = donor_arm.matrix_world, target_arm.matrix_world
    dh = {s: dW @ donor_arm.data.bones[f"hand_{s}"].head_local for s in "lr"}
    th = {s: tW @ target_arm.data.bones[f"hand_{s}"].head_local for s in "lr"}
    new_heads = {}
    for s in "lr":
        for f in FINGER_CHAINS:
            for seg in ("01", "02", "03", "04_leaf"):
                name = f"{f}_{seg}_{s}"
                new_heads[name] = tW.inverted() @ (th[s] + (dW @ donor_arm.data.bones[name].head_local - dh[s]))
    conv.ensure_object_mode()
    conv.select_only(target_arm)
    bpy.ops.object.mode_set(mode='EDIT')
    for name, head in new_heads.items():
        eb = target_arm.data.edit_bones[name]
        donor_len = donor_arm.data.bones[name].length
        eb.matrix = Matrix.Translation(head) @ eb.matrix.to_3x3().to_4x4()
        eb.length = donor_len
    bpy.ops.object.mode_set(mode='OBJECT')


# ---------------------------------------------------------------- main operation

def replace_hands(t_arm, t_obj, d_arm, d_obj, stem, tex_dir=None):
    tex_dir = tex_dir or bpy.app.tempdir
    T, D = MeshData(t_obj), MeshData(d_obj)
    t_parts = hand_parts(T, 0.5)
    d_parts = hand_parts(D, 0.5)
    tW, dW = t_arm.matrix_world, d_arm.matrix_world
    th = {s: tW @ t_arm.data.bones[f"hand_{s}"].head_local for s in "lr"}
    dh = {s: dW @ d_arm.data.bones[f"hand_{s}"].head_local for s in "lr"}

    # skin colour from the old hand faces, before they go. Only materials used by nothing but the
    # hands: a material shared with the forearm is wrist tape/bands, not skin.
    old_hand_faces = [k for s in "lr" for k in t_parts[s]["faces"]]
    hand_set = set(old_hand_faces)
    shared = {T.mat[k] for k in range(len(T.faces)) if k not in hand_set}
    skin_faces = [k for k in old_hand_faces if T.mat[k] not in shared] or old_hand_faces
    skin = sample_mean_color(T, skin_faces)

    # donor materials -> skin-tinted copies
    donor_mats = sorted({D.mat[k] for s in "lr" for k in d_parts[s]["faces"]})
    new_mats = {}
    for mi in donor_mats:
        dm = D.materials[mi]
        img = face_image(D, next(k for s in "lr" for k in d_parts[s]["faces"] if D.mat[k] == mi))
        new_mats[mi] = skin_material(dm, skin_image(img, skin, f"{stem}_hand_{dm.name}", tex_dir), f"hand_{dm.name}")

    # ---- target part we keep
    drop_v = set()
    drop_f = set()
    for s in "lr":
        drop_v |= t_parts[s]["verts"] - t_parts[s]["ring"]
        drop_f |= set(t_parts[s]["faces"])  # caps (ring-only faces) are kept
    keep_v = [i for i in range(len(T.co)) if i not in drop_v]
    vmap = {old: new for new, old in enumerate(keep_v)}
    verts = [T.co[i] for i in keep_v]
    weights = [T.weights[i] for i in keep_v]
    faces, face_uv, face_nrm, face_mat = [], [], [], []
    used_t_mats = sorted({T.mat[k] for k in range(len(T.faces)) if k not in drop_f})
    mat_list = [T.materials[i] for i in used_t_mats]
    t_mat_index = {old: new for new, old in enumerate(used_t_mats)}
    for k, f in enumerate(T.faces):
        if k in drop_f:
            continue
        faces.append([vmap[i] for i in f])
        face_uv.append(T.uvs[k])
        face_nrm.append(T.nrm[k])
        face_mat.append(t_mat_index[T.mat[k]])
    d_mat_index = {}
    for mi, mat in new_mats.items():
        d_mat_index[mi] = len(mat_list)
        mat_list.append(mat)

    # target corner normals by position, to smooth-shade the stitch band at the ring
    t_nrm_at = {}
    for k, f in enumerate(T.faces):
        if k in drop_f:
            continue
        for c, i in enumerate(f):
            key = pos_key(T.co[i])
            t_nrm_at[key] = t_nrm_at.get(key, Vector()) + Vector(T.nrm[k][c])

    # ---- donor hands, stitched to the target's open wrist ring
    for s in "lr":
        dp, tp = d_parts[s], t_parts[s]
        offset = th[s] - dh[s]
        outward = 1.0 if s == "l" else -1.0
        along = lambda p: p.x * outward  # distance along the arm, growing towards the fingertips

        # The donor hand is a closed shell; drop the flat cap that closes its wrist end.
        hverts = {i for k in dp["faces"] for i in D.faces[k]}
        end = min(along(D.co[i]) for i in hverts)
        end_cap = {k for k in dp["faces"] if all(along(D.co[i]) < end + END_CAP_TOLERANCE for i in D.faces[k])}
        shell = [k for k in dp["faces"] if k not in end_cap]
        loop = boundary_loop(D, shell)
        if not end_cap or len(loop) < 3:
            raise ValueError(f"side {s}: could not find the flat wrist end of the donor hand")

        # Open target ring (where the old hand was attached).
        ring_ids = unique_by_position(T, tp["ring"])
        ring_along = sum(along(T.co[i]) for i in ring_ids) / len(ring_ids)
        loop_along = sum(along(D.co[v] + offset) for v, _, _ in loop.values()) / len(loop)
        # seat the hand's wrist edge just past the ring, easing the hand base over WRIST_BLEND
        shift = (ring_along + WRIST_GAP) - loop_along

        dvmap = {}
        for i in sorted({i for k in shell for i in D.faces[k]}):
            p = D.co[i] + offset
            f = smoothstep(1.0 - (along(p) - loop_along) / WRIST_BLEND)
            verts.append(Vector((p.x + outward * shift * f, p.y, p.z)))
            weights.append(D.weights[i])
            dvmap[i] = len(verts) - 1
        for k in shell:
            faces.append([dvmap[i] for i in D.faces[k]])
            face_uv.append(D.uvs[k])
            face_nrm.append(D.nrm[k])
            face_mat.append(d_mat_index[D.mat[k]])

        # Stitch: a band of triangles from the ring to the hand's wrist edge, sharing their vertices.
        cy = sum(T.co[i].y for i in ring_ids) / len(ring_ids)
        cz = sum(T.co[i].z for i in ring_ids) / len(ring_ids)
        uv_of, mat_of, nrm_of = {}, {}, {}
        for v, uv, k in loop.values():
            nv = dvmap[v]
            uv_of[nv] = uv
            mat_of[nv] = d_mat_index[D.mat[k]]
            nrm_of[nv] = Vector(D.nrm[k][D.faces[k].index(v)])
        for i in ring_ids:
            nrm_of[vmap[i]] = t_nrm_at[pos_key(T.co[i])].normalized()
        ring_pts = [(vmap[i], T.co[i]) for i in ring_ids]
        loop_pts = [(nv, verts[nv]) for nv in uv_of]
        for tri in zipper(ring_pts, loop_pts, cy, cz):
            P = [verts[i] for i in tri]
            n = (P[1] - P[0]).cross(P[2] - P[0])
            if n.length < 1e-12:
                continue
            centre = (P[0] + P[1] + P[2]) / 3
            if n.dot(Vector((0, centre.y - cy, centre.z - cz))) < 0:  # face away from the arm's axis
                tri = (tri[0], tri[2], tri[1])
            hand_v = next(i for i in tri if i in uv_of)
            faces.append(list(tri))
            face_uv.append(tuple(uv_of.get(i, uv_of[hand_v]) for i in tri))
            face_nrm.append(tuple(tuple(nrm_of[i]) for i in tri))
            face_mat.append(mat_of[hand_v])

    # ---- build the new mesh in the target's local space
    inv = t_obj.matrix_world.inverted()
    inv3 = inv.to_3x3().normalized()
    me = bpy.data.meshes.new(t_obj.data.name)
    me.from_pydata([inv @ v for v in verts], [], faces)
    for m in mat_list:
        me.materials.append(m)
    me.polygons.foreach_set("material_index", face_mat)
    me.polygons.foreach_set("use_smooth", [True] * len(faces))
    uv = me.uv_layers.new(name="UVMap")
    flat_uv = [c for f in face_uv for corner in f for c in corner]
    uv.data.foreach_set("uv", flat_uv)
    me.normals_split_custom_set([tuple((inv3 @ Vector(n)).normalized()) for f in face_nrm for n in f])
    me.validate(clean_customdata=False)

    old = t_obj.data
    name = old.name
    t_obj.data = me
    bpy.data.meshes.remove(old)
    me.name = name
    t_obj.vertex_groups.clear()
    groups = {}
    for vi, w in enumerate(weights):
        for g, val in w.items():
            if g not in groups:
                groups[g] = t_obj.vertex_groups.new(name=g)
            groups[g].add([vi], val, 'REPLACE')

    move_finger_bones(t_arm, d_arm)
    print(f"{stem}: hands replaced, skin {tuple(round(float(c), 3) for c in skin)}, "
          f"{len(T.co)} -> {len(verts)} verts, {len(T.faces)} -> {len(faces)} faces")


def load_donor(path=DONOR_GLB):
    created = conv.gltf_import(path)
    arm = next(o for o in created["objects"] if o.type == 'ARMATURE')
    mesh = next(o for o in created["objects"] if o.type == 'MESH' and o.parent == arm)
    for o in (arm, mesh):
        o.hide_set(True)
    return arm, mesh


def remove_donor(donor):
    for o in donor:
        data = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if data.users == 0:
            (bpy.data.armatures if isinstance(data, bpy.types.Armature) else bpy.data.meshes).remove(data)


def process_file(path, out, donor):
    created = conv.gltf_import(path)
    arm = next(o for o in created["objects"] if o.type == 'ARMATURE')
    mesh = next(o for o in created["objects"] if o.type == 'MESH' and o.parent == arm)
    stem = conv.kebab(path)
    replace_hands(arm, mesh, *donor, stem)
    conv.export_glb(arm, mesh, out)
    print(f"  -> {out}")


def main(argv):
    out_dir, donor_path, files = None, DONOR_GLB, []
    it = iter(argv)
    for a in it:
        if a == "--out":
            out_dir = os.path.abspath(next(it))
        elif a == "--donor":
            donor_path = os.path.abspath(next(it))
        else:
            files.append(os.path.abspath(a))
    if not files:
        print("usage: ... replace_hands.py -- [--out DIR] [--donor GLB] FILE.glb ...")
        return
    conv.ensure_object_mode()
    donor = load_donor(donor_path)
    try:
        for f in files:
            out = os.path.join(out_dir, os.path.basename(f)) if out_dir else f
            if out_dir:
                os.makedirs(out_dir, exist_ok=True)
            process_file(f, out, donor)
    finally:
        remove_donor(donor)


if __name__ == "__main__":
    main(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
