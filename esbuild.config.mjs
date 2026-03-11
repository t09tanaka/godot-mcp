import { build, context } from "esbuild";

const isWatch = process.argv.includes("--watch");

const options = {
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node18",
  format: "esm",
  outfile: "addons/mcp_bridge/server/index.js",
  banner: {
    js: "#!/usr/bin/env node",
  },
  external: [],
  minify: false,
  sourcemap: false,
};

if (isWatch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await build(options);
  console.log("Build complete: addons/mcp_bridge/server/index.js");
}
