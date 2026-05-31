const esbuild = require("esbuild");
const path = require("path");

const entry = path.join(__dirname, "..", "public", "js", "editor-entry.js");
const outfile = path.join(__dirname, "..", "public", "js", "editor.bundle.js");

esbuild.buildSync({
  entryPoints: [entry],
  bundle: true,
  outfile,
  format: "iife",
  platform: "browser",
  target: ["es2020"],
  minify: false,
  sourcemap: true,
  logLevel: "info",
});

console.log("Built", outfile);
