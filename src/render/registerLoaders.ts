import { registerBuiltInLoaders } from "@babylonjs/loaders/dynamic";

/**
 * Registers the glTF loader (and its extensions) as lazy chunks fetched on the
 * first load, so Draco, meshopt, PBR variants etc. stay out of the main bundle.
 *
 * Every renderer imports this module for its side effect; ES modules evaluate
 * once, so the loaders are registered once however many screens need them.
 */
registerBuiltInLoaders();
