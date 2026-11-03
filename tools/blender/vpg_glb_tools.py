"""VPG GLB Tools: import VPG Rig 2.0 animation GLBs into Blender with a workable armature.

glTF does not store bone lengths, so Blender's importer guesses them from the distance
to each bone's children. The VPG helper bones (root, ik_*, socket_*) sit at the origin
with children out at the hands, so they come in 0.9-1.6 m long, and the importer's
icosphere bone shapes are sized from those guesses. This add-on:

  * shortens the helper bones along their own axis (head and roll unchanged, so rest
    matrices, skinning, animation and re-export are unaffected),
  * drops the icosphere bone shapes and uses plain octahedral bones drawn in front,
  * puts the helper bones in a hidden "Helpers" bone collection, the rest in "Body",
  * sets the scene to 30 fps before importing. The clips are baked at 30 Hz and the
    importer converts seconds to frames at the scene rate, so at Blender's default
    24 fps keys land on fractional frames and re-export resamples them at 24 Hz,
    which the game's clip loader rejects.

Clips keep their original glTF animation names (re-export writes the action name);
the source file path is stored on each action as the custom property "vpg_source".

Install: Edit > Preferences > Add-ons > (dropdown, top right) > Install from Disk...
Or open this file in Blender's Text Editor and press Run Script.

Use:
  File > Import > VPG Animation (.glb)
      "New Rig per File"      each file gets its own armature + meshes in a collection
                              named after the file (e.g. a move and its -target pair).
      "Actions on Active Rig" keep only each file's animation, as an action on the
                              selected VPG armature; switch clips in the Action Editor.
  Object > VPG: Clean Up Rig  fix an armature that was imported the normal way.
  File > Export > VPG Animation (.glb)
                              export the active VPG rig with exactly its current action,
                              keeping the clip name and the "Armature"/"Mannequin_*" node
                              names. (Blender's default "Actions" export mode writes every
                              action whose bone names match, i.e. every clip in the file,
                              and the game's loader requires exactly one.) The file dialog
                              starts at the clip's source file.
"""

bl_info = {
    "name": "VPG GLB Tools",
    "version": (1, 0, 0),
    "blender": (4, 2, 0),
    "location": "File > Import/Export > VPG Animation (.glb); Object > VPG: Clean Up Rig",
    "description": "Import and export VPG Rig 2.0 animation GLBs with a usable armature",
    "category": "Import-Export",
}

import os
import re
from contextlib import contextmanager

import bpy
from bpy.props import CollectionProperty, EnumProperty, IntProperty, StringProperty
from bpy.types import Operator, OperatorFileListElement
from bpy_extras.io_utils import ExportHelper, ImportHelper

HELPER_PREFIXES = ("ik_", "socket_")
HELPER_LENGTHS = {"root": 0.15}
DEFAULT_HELPER_LENGTH = 0.08
VPG_MARKER_BONES = {"root", "pelvis", "ik_hand_gun", "socket_offhand"}
TRACKED_DATA = ("objects", "meshes", "armatures", "materials", "images", "textures", "actions", "collections")


def is_helper(name):
    return name == "root" or name.startswith(HELPER_PREFIXES)


def is_vpg_rig(obj):
    return obj is not None and obj.type == 'ARMATURE' and VPG_MARKER_BONES.issubset(obj.data.bones.keys())


def ensure_object_mode(context):
    if context.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')


def remove_unused_shapes(shapes):
    in_use = {
        pb.custom_shape
        for o in bpy.data.objects
        if o.type == 'ARMATURE'
        for pb in o.pose.bones
        if pb.custom_shape
    }
    for shape in shapes - in_use:
        mesh = shape.data if shape.type == 'MESH' else None
        colls = list(shape.users_collection)
        bpy.data.objects.remove(shape, do_unlink=True)
        if mesh and mesh.users == 0:
            bpy.data.meshes.remove(mesh)
        for coll in colls:
            if coll.name.startswith("glTF_not_exported") and not coll.all_objects:
                bpy.data.collections.remove(coll)


def clean_up_rig(context, arm):
    """Make an imported VPG armature workable without changing any rest or animated transform."""
    data = arm.data

    shapes = {pb.custom_shape for pb in arm.pose.bones if pb.custom_shape}
    for pb in arm.pose.bones:
        pb.custom_shape = None
    remove_unused_shapes(shapes)

    view_layer = context.view_layer
    prev_active = view_layer.objects.active
    ensure_object_mode(context)
    view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    for eb in data.edit_bones:
        if is_helper(eb.name):
            eb.length = HELPER_LENGTHS.get(eb.name, DEFAULT_HELPER_LENGTH)
    bpy.ops.object.mode_set(mode='OBJECT')
    view_layer.objects.active = prev_active

    body = data.collections_all.get("Body") or data.collections.new("Body")
    helpers = data.collections_all.get("Helpers") or data.collections.new("Helpers")
    for bone in data.bones:
        for coll in list(bone.collections):
            coll.unassign(bone)
        (helpers if is_helper(bone.name) else body).assign(bone)
    helpers.is_visible = False
    for coll in list(data.collections_all):
        if coll not in (body, helpers) and not coll.bones and not coll.children:
            data.collections.remove(coll)

    data.display_type = 'OCTAHEDRAL'
    arm.show_in_front = True


def gltf_import(filepath, **options):
    """Run Blender's glTF importer and return the datablocks it created, by type."""
    supported = bpy.ops.import_scene.gltf.get_rna_type().properties.keys()
    options = {k: v for k, v in options.items() if k in supported}
    before = {key: set(getattr(bpy.data, key)) for key in TRACKED_DATA}
    bpy.ops.import_scene.gltf(filepath=filepath, **options)
    return {key: [d for d in getattr(bpy.data, key) if d not in before[key]] for key in TRACKED_DATA}


def bind_action_to(obj, action):
    """Name the action's object slot after obj so picking it in the Action Editor just works."""
    for slot in getattr(action, "slots", ()):
        if slot.target_id_type == 'OBJECT' and slot.name_display != obj.name:
            slot.name_display = obj.name


def assign_action(obj, action):
    bind_action_to(obj, action)
    anim = obj.animation_data or obj.animation_data_create()
    anim.action = action
    if hasattr(anim, "action_slot") and anim.action_slot is None and len(action.slots):
        anim.action_slot = action.slots[0]


def fit_scene_to_action(scene, action):
    start, end = action.frame_range
    scene.frame_start = int(start)
    scene.frame_end = int(round(end))
    scene.frame_set(scene.frame_start)


def remove_created(created, keep=()):
    for obj in created["objects"]:
        bpy.data.objects.remove(obj, do_unlink=True)
    for key in ("meshes", "armatures", "materials", "textures", "images"):
        coll = getattr(bpy.data, key)
        for block in created[key]:
            if block not in keep and block.users == 0:
                coll.remove(block)
    for coll in created["collections"]:
        bpy.data.collections.remove(coll)


class VPG_OT_import_glb(Operator, ImportHelper):
    """Import VPG Rig 2.0 animation GLBs with a cleaned-up armature"""

    bl_idname = "vpg.import_glb"
    bl_label = "Import VPG Animation"
    bl_options = {'REGISTER', 'UNDO'}

    filename_ext = ".glb"
    filter_glob: StringProperty(default="*.glb;*.gltf", options={'HIDDEN'})
    files: CollectionProperty(type=OperatorFileListElement, options={'HIDDEN', 'SKIP_SAVE'})
    directory: StringProperty(subtype='DIR_PATH', options={'HIDDEN', 'SKIP_SAVE'})

    mode: EnumProperty(
        name="Mode",
        items=(
            ('RIG', "New Rig per File",
             "Each file becomes its own armature and meshes, in a collection named after the file"),
            ('ACTIONS', "Actions on Active Rig",
             "Keep only each file's animation, as an action on the selected VPG armature"),
        ),
        default='RIG',
    )
    fps: IntProperty(
        name="Scene FPS",
        description="Frame rate set on the scene before importing; the VPG clips are baked at 30 Hz",
        default=30, min=1, max=240,
    )

    def execute(self, context):
        paths = [os.path.join(self.directory, f.name) for f in self.files if f.name] or [self.filepath]
        paths.sort()
        ensure_object_mode(context)
        context.scene.render.fps = self.fps
        context.scene.render.fps_base = 1.0

        if self.mode == 'ACTIONS':
            rig = context.active_object
            if not is_vpg_rig(rig):
                self.report({'ERROR'}, "Select a VPG armature first (import one with 'New Rig per File')")
                return {'CANCELLED'}
            return self.import_as_actions(context, rig, paths)
        return self.import_as_rigs(context, paths)

    def import_as_rigs(self, context, paths):
        last_rig = None
        for path in paths:
            stem = os.path.splitext(os.path.basename(path))[0]
            created = gltf_import(path, bone_heuristic='BLENDER', disable_bone_shape=True,
                                  import_scene_as_collection=False)
            rig = next((o for o in created["objects"] if is_vpg_rig(o)), None)
            if rig is None:
                self.report({'WARNING'}, f"{stem}: no VPG armature found, imported as-is")
                continue

            coll = bpy.data.collections.new(stem)
            context.scene.collection.children.link(coll)
            for obj in created["objects"]:
                coll.objects.link(obj)
                for other in list(obj.users_collection):
                    if other != coll:
                        other.objects.unlink(obj)

            for action in created["actions"]:
                action["vpg_source"] = path
                bind_action_to(rig, action)
            clean_up_rig(context, rig)
            last_rig = rig

        if last_rig is None:
            return {'CANCELLED'}
        bpy.ops.object.select_all(action='DESELECT')
        last_rig.select_set(True)
        context.view_layer.objects.active = last_rig
        if last_rig.animation_data and last_rig.animation_data.action:
            fit_scene_to_action(context.scene, last_rig.animation_data.action)
        self.report({'INFO'}, f"Imported {len(paths)} VPG rig(s)")
        return {'FINISHED'}

    def import_as_actions(self, context, rig, paths):
        last_action = None
        for path in paths:
            stem = os.path.splitext(os.path.basename(path))[0]
            created = gltf_import(path, bone_heuristic='BLENDER', disable_bone_shape=True,
                                  import_select_created_objects=False)
            actions = created["actions"]
            for action in actions:
                action["vpg_source"] = path
                action.use_fake_user = True
                bind_action_to(rig, action)
            remove_created(created)
            if actions:
                last_action = actions[-1]
            else:
                self.report({'WARNING'}, f"{stem}: no animation found")

        bpy.ops.object.select_all(action='DESELECT')
        rig.select_set(True)
        context.view_layer.objects.active = rig
        if last_action:
            assign_action(rig, last_action)
            fit_scene_to_action(context.scene, last_action)
        self.report({'INFO'}, f"Added {len(paths)} clip(s) to {rig.name}")
        return {'FINISHED'}


class VPG_OT_clean_up_rig(Operator):
    """Shorten oversized helper bones, drop icosphere bone shapes and hide helpers"""

    bl_idname = "vpg.clean_up_rig"
    bl_label = "VPG: Clean Up Rig"
    bl_options = {'REGISTER', 'UNDO'}

    @classmethod
    def poll(cls, context):
        return context.active_object is not None and context.active_object.type == 'ARMATURE'

    def execute(self, context):
        clean_up_rig(context, context.active_object)
        return {'FINISHED'}


@contextmanager
def original_names(blocks):
    """Temporarily strip Blender's .001 suffixes so exported node/mesh names match the source files."""
    renamed = []  # (block, original name), in rename order
    try:
        for block, pool in blocks:
            base = re.sub(r"\.\d{3}$", "", block.name)
            if base == block.name:
                continue
            holder = pool.get(base)
            if holder is not None:
                renamed.append((holder, holder.name))
                holder.name = base + ".vpg_tmp"
            renamed.append((block, block.name))
            block.name = base
        yield
    finally:
        for block, name in reversed(renamed):
            block.name = name


class VPG_OT_export_glb(Operator, ExportHelper):
    """Export the active VPG rig with exactly its current action, as the game expects"""

    bl_idname = "vpg.export_glb"
    bl_label = "Export VPG Animation"
    bl_options = {'REGISTER'}

    filename_ext = ".glb"
    filter_glob: StringProperty(default="*.glb", options={'HIDDEN'})

    @classmethod
    def poll(cls, context):
        rig = context.active_object
        return is_vpg_rig(rig) and rig.animation_data is not None and rig.animation_data.action is not None

    def invoke(self, context, event):
        source = context.active_object.animation_data.action.get("vpg_source")
        if source:
            self.filepath = source
        return super().invoke(context, event)

    def execute(self, context):
        ensure_object_mode(context)
        rig = context.active_object
        action = rig.animation_data.action
        if context.scene.render.fps != 30 or context.scene.render.fps_base != 1.0:
            self.report({'WARNING'}, "Scene is not 30 fps; the game expects 30 Hz clips")

        meshes = [c for c in rig.children if c.type == 'MESH']
        prev_selected = list(context.selected_objects)
        prev_active = context.view_layer.objects.active
        bpy.ops.object.select_all(action='DESELECT')
        for obj in (rig, *meshes):
            obj.select_set(True)
        context.view_layer.objects.active = rig

        blocks = [(rig, bpy.data.objects)] + [(m, bpy.data.objects) for m in meshes] \
            + [(m.data, bpy.data.meshes) for m in meshes]
        try:
            with original_names(blocks):
                bpy.ops.export_scene.gltf(
                    filepath=self.filepath,
                    export_format='GLB',
                    use_selection=True,
                    export_animation_mode='ACTIVE_ACTIONS',
                    export_nla_strips_merged_animation_name=action.name,
                )
        finally:
            bpy.ops.object.select_all(action='DESELECT')
            for obj in prev_selected:
                obj.select_set(True)
            context.view_layer.objects.active = prev_active

        self.report({'INFO'}, f"Exported '{action.name}' to {self.filepath}")
        return {'FINISHED'}


def menu_import(self, context):
    self.layout.operator(VPG_OT_import_glb.bl_idname, text="VPG Animation (.glb)")


def menu_export(self, context):
    self.layout.operator(VPG_OT_export_glb.bl_idname, text="VPG Animation (.glb)")


def menu_object(self, context):
    self.layout.separator()
    self.layout.operator(VPG_OT_clean_up_rig.bl_idname)


classes = (VPG_OT_import_glb, VPG_OT_export_glb, VPG_OT_clean_up_rig)


def register():
    for cls in classes:
        bpy.utils.register_class(cls)
    bpy.types.TOPBAR_MT_file_import.append(menu_import)
    bpy.types.TOPBAR_MT_file_export.append(menu_export)
    bpy.types.VIEW3D_MT_object.append(menu_object)


def unregister():
    bpy.types.VIEW3D_MT_object.remove(menu_object)
    bpy.types.TOPBAR_MT_file_export.remove(menu_export)
    bpy.types.TOPBAR_MT_file_import.remove(menu_import)
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)


if __name__ == "__main__":
    register()
