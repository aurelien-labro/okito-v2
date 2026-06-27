/**
 * Build du widget en un fichier JS standalone (IIFE) à servir depuis le CDN.
 *
 * Pas de tree-shaking inter-fichiers nécessaire : tout est dans widget.ts.
 * On utilise esbuild pour la rapidité + le compactage des modules en IIFE.
 */
import { build } from "esbuild";

await build({
  entryPoints: ["src/widget.ts"],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2020"],
  outfile: "dist/widget.js",
  platform: "browser",
  legalComments: "none",
});

console.log("✓ widget bundle → dist/widget.js");
