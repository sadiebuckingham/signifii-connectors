import { build } from "esbuild";
await build({ entryPoints: ["core/mcp/test-host/host.js"], bundle: true, format: "esm", target: "es2022", outfile: "core/mcp/test-host/.host.bundle.js", platform: "browser" });
