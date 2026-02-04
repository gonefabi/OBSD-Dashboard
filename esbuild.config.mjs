import esbuild from "esbuild";

const watch = process.argv.includes("--watch");

const options = {
  entryPoints: ["main.ts"],
  bundle: true,
  outfile: "main.js",
  format: "cjs",
  platform: "browser",
  target: ["es2018"],
  sourcemap: "inline",
  jsx: "transform",
  logLevel: "info",
  external: ["obsidian"],
};

if (watch) {
  const context = await esbuild.context(options);
  await context.watch();
  console.log("Watching for changes...");
} else {
  await esbuild.build(options);
}
