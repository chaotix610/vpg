/**
 * Application data module. Teaching focus: how authored configuration is normalized into a small runtime API used by screens and game systems.
 * File: src/content/mainMenu.ts
 *
 * Read the public types and exported functions first; callers show how this
 * module participates in the larger data → rules → presentation pipeline.
 */
import menuJson from "#data/ui/main-menu.json";
import { resolveAsset } from "./assets";

/**
 * The menu tree, loaded from data/ui/main-menu.json.
 *
 * Menu content is data so pages and copy can be edited without touching UI
 * code. Authored JSON is validated against schemas/main-menu.schema.json
 * by `npm run validate:data` and during the production build.
 */

export interface ParagraphBlock {
  type: "paragraph";
  text: string;
}

export interface DefinitionListBlock {
  type: "definitionList";
  items: { term: string; definition: string }[];
}

export type InstructionBlock = ParagraphBlock | DefinitionListBlock;

export interface Instructions {
  title: string;
  blocks: InstructionBlock[];
}

export interface MenuItem {
  id: string;
  displayName: string;
  /** A page key in `pages`, or a dotted application route id. */
  target: string;
  instructions: Instructions;
}

export interface MenuPage {
  id: string;
  displayName: string;
  headingImage: string | null;
  menuItems: MenuItem[];
}

export interface MainMenuData {
  version: string;
  pages: Record<string, MenuPage>;
}

export const MAIN_MENU = menuJson as unknown as MainMenuData;

/** The page every session starts on. */
export const ROOT_PAGE = "mainMenu";

export function pageByKey(key: string): MenuPage | null {
  return MAIN_MENU.pages[key] ?? null;
}

/**
 * What selecting an item should do.
 *
 * A bare camelCase target names another page and is handled by the menu
 * itself. A dotted target is a route the application resolves - some are
 * implemented, most are not yet.
 */
export type MenuTarget =
  | { kind: "page"; key: string }
  | { kind: "route"; id: string };

export function resolveTarget(target: string): MenuTarget {
  if (!target.includes(".") && MAIN_MENU.pages[target]) {
    return { kind: "page", key: target };
  }
  return { kind: "route", id: target };
}

/** The URL for a page's heading image, or null when no artwork is configured. */
export function headingUrl(page: MenuPage): string | null {
  return page.headingImage ? resolveAsset(page.headingImage) : null;
}
