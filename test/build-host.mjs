import { build } from "esbuild";
await build({ entryPoints: ["test/host.js"], bundle: true, format: "esm", target: "es2022", outfile: "test/.host.bundle.js", platform: "browser" });
