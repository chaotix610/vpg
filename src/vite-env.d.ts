/// <reference types="vite/client" />

declare module "virtual:asset-manifest" {
  /** Folder holding the character models, relative to the asset base. */
  export const CHAR_DIR: string;
  /** Folder holding the animation clips, relative to the asset base. */
  export const ANIM_DIR: string;
  /** Character model file names directly inside CHAR_DIR. */
  export const characters: string[];
  /** Animation clip paths relative to ANIM_DIR. */
  export const animations: string[];
}

declare module "virtual:public-assets" {
  /** Non-GLB files beneath public/assets, using browser-relative assets/... paths. */
  export const paths: string[];
  /** Arena GLBs beneath public/assets/environments, using assets/... paths. */
  export const models: string[];
}

interface ImportMetaEnv {
  /** Optional URL prefix to load assets from instead of the page's own origin. */
  readonly VITE_ASSET_BASE?: string;
}
