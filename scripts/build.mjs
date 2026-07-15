import { build } from "esbuild";

await build({
	entryPoints: ["src/index.ts"],
	bundle: true,
	platform: "node",
	target: "node22",
	format: "esm",
	outfile: "c8ctl-plugin.js",
	// The Camunda SDK is provided at runtime by the c8ctl host via
	// globalThis.c8ctl.createClient(); we only import it for types, which are
	// erased. Keep it external so it is never bundled.
	external: ["@camunda8/orchestration-cluster-api"],
	banner: {
		js: "// c8ctl-ops-plugin — generated bundle. Do not edit; edit src/ and run `npm run build`.",
	},
	logLevel: "info",
});
