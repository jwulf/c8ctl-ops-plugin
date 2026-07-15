#!/usr/bin/env node
/**
 * Idempotent npm publish for this single-package repo.
 *
 * Reads name+version from package.json and only publishes when that exact
 * version is not already on the registry, so the release workflow can run on
 * every push to main without failing on "you cannot publish over an existing
 * version". Auth is via GitHub Actions OIDC (npm Trusted Publishing) — no
 * long-lived NPM_TOKEN is required and provenance is signed automatically.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const pkgPath = fileURLToPath(new URL("../package.json", import.meta.url));
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
const { name, version } = pkg;

function publishedVersions() {
	try {
		const out = execFileSync("npm", ["view", `${name}`, "versions", "--json"], {
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "ignore"],
		});
		const parsed = JSON.parse(out);
		return Array.isArray(parsed) ? parsed : [parsed];
	} catch {
		// 404 (package does not exist yet) → nothing published.
		return [];
	}
}

if (publishedVersions().includes(version)) {
	console.log(`${name}@${version} already published — nothing to do.`);
	process.exit(0);
}

console.log(`Publishing ${name}@${version}...`);
execFileSync("npm", ["publish", "--provenance", "--access", "public"], {
	stdio: "inherit",
});
console.log(`Published ${name}@${version}.`);
