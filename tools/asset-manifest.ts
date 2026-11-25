import { readdirSync } from "node:fs";
import path from "node:path";
import type { Plugin, ResolvedConfig } from "vite";

// Browser paths omit public/; Vite serves and copies that directory as-is.
export const CHAR_DIR = "assets/characters/models/";
export const ANIM_DIR = "assets/animations/";
/** Arena models are few and small enough to index alongside the UI files. */
export const ENV_DIR = "assets/environments/";

const MANIFEST_ID = "virtual:asset-manifest";
const PUBLIC_ID = "virtual:public-assets";
const isGlb = (name: string) => /\.glb$/i.test(name);

function listFiles(dir: string, recursive: boolean, sub = ""): string[] {
  const entries = readdirSync(path.join(dir, sub), { withFileTypes: true });
  return entries.flatMap((entry) => {
    const relative = sub ? `${sub}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return recursive ? listFiles(dir, true, relative) : [];
    return entry.isFile() && !entry.name.startsWith(".") ? [relative] : [];
  }).sort();
}

/** Index runtime files without importing their binary contents into the JS bundle. */
export function assetManifest(): Plugin {
  let config: ResolvedConfig;
  const abs = (dir: string) => path.resolve(config.publicDir, dir);

  return {
    name: "vpg-asset-manifest",
    configResolved(resolved) {
      config = resolved;
    },
    resolveId(id) {
      if (id === MANIFEST_ID || id === PUBLIC_ID) return `\0${id}`;
    },
    load(id) {
      if (id === `\0${PUBLIC_ID}`) {
        // Character creator assets are indexed by their own lazy manifest.json,
        // so leave them out of the menu's eager asset list.
        const paths = listFiles(abs("assets"), true)
          .filter((file) => !isGlb(file) && !file.startsWith("characters/creator/"))
          .map((file) => `assets/${file}`);
        const models = listFiles(abs(ENV_DIR), true).filter(isGlb).map((file) => `${ENV_DIR}${file}`);
        return `export const paths = ${JSON.stringify(paths)};\nexport const models = ${JSON.stringify(models)};`;
      }
      if (id !== `\0${MANIFEST_ID}`) return;
      return [
        `export const CHAR_DIR = ${JSON.stringify(CHAR_DIR)};`,
        `export const ANIM_DIR = ${JSON.stringify(ANIM_DIR)};`,
        `export const characters = ${JSON.stringify(listFiles(abs(CHAR_DIR), false).filter(isGlb))};`,
        `export const animations = ${JSON.stringify(listFiles(abs(ANIM_DIR), true).filter(isGlb))};`,
      ].join("\n");
    },
    configureServer(server) {
      const onChange = (file: string) => {
        const relative = path.relative(abs("assets"), file);
        if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return;
        for (const id of [MANIFEST_ID, PUBLIC_ID]) {
          const module = server.environments.client.moduleGraph.getModuleById(`\0${id}`);
          if (module) server.environments.client.moduleGraph.invalidateModule(module);
        }
        server.ws.send({ type: "full-reload" });
      };
      server.watcher.on("add", onChange);
      server.watcher.on("unlink", onChange);
      server.httpServer?.once("close", () => {
        server.watcher.off("add", onChange);
        server.watcher.off("unlink", onChange);
      });
    },
  };
}
