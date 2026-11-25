import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { IAnimationKey } from "@babylonjs/core/Animations/animationKey";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

export interface RigTarget {
  /** First node of each name, so bones can be matched across files. */
  nodes: Map<string, TransformNode>;
  /** Each node's position as loaded, before any animation ran. */
  rest: Map<string, Vector3>;
}

export interface LoadedAsset extends RigTarget {
  /** Path of the file, relative to its folder. */
  path: string;
  container: AssetContainer;
}

export function describeAsset(path: string, container: AssetContainer): LoadedAsset {
  const nodes = new Map<string, TransformNode>();
  for (const node of [...container.transformNodes, ...container.meshes]) {
    if (!nodes.has(node.name)) nodes.set(node.name, node);
  }
  const rest = new Map<string, Vector3>();
  for (const [name, node] of nodes) rest.set(name, node.position.clone());
  return { path, container, nodes, rest };
}

/**
 * Every character uses the VPG Rig 2.0 skeleton (same bone names, same rest rotations),
 * but bone lengths differ between characters. Clips key translation on every bone, so
 * copying them verbatim would force the clip's proportions onto the character. Instead,
 * translation keys become: character rest + (clip key - clip rest). Rotations carry over
 * as-is; scale keys are always 1.0 and are skipped.
 */
export function retarget(clip: LoadedAsset, char: RigTarget, scene: Scene): { group: AnimationGroup; fps: number } {
  const source = clip.container.animationGroups[0];
  if (!source) throw new Error("This file has no animation.");
  const group = new AnimationGroup(source.name, scene);
  for (const { animation, target } of source.targetedAnimations) {
    const node = char.nodes.get(target.name);
    if (!node || animation.targetProperty === "scaling") continue;
    const anim = animation.clone();
    if (animation.targetProperty === "position") {
      const clipRest = clip.rest.get(target.name);
      const charRest = char.rest.get(target.name);
      if (clipRest && charRest) {
        const offset = charRest.subtract(clipRest);
        anim.setKeys(animation.getKeys().map((k: IAnimationKey) => ({ ...k, value: (k.value as Vector3).add(offset) })));
      }
    }
    group.addTargetedAnimation(anim, node);
  }
  const fps = source.targetedAnimations[0]?.animation.framePerSecond || 60;
  return { group, fps };
}
