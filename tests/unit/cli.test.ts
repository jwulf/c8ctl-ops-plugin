import assert from "node:assert/strict";
import { test } from "node:test";
import { coerceFlags, listRoutes, resolvePlaybook } from "../../src/cli.ts";
import { renderMarkdown } from "../../src/engine/report.ts";
import type { OpsReport } from "../../src/engine/types.ts";
import { discoveryScope } from "../../src/engine/types.ts";

test("cli: coerceFlags applies defaults", () => {
	const flags = coerceFlags({});
	assert.equal(flags.limit, 0);
	assert.equal(flags.batchSize, 100);
	assert.equal(flags.force, false);
	assert.equal(flags.workers, undefined);
	assert.deepEqual(flags.raw.retentionDays, undefined);
});

test("cli: coerceFlags coerces types from strings", () => {
	const flags = coerceFlags({
		limit: "50",
		"batch-size": "25",
		force: true,
		workers: "8",
		"retention-days": "30",
		"job-timeout-ms": "60000",
		retries: "3",
		count: "5",
		"report-format": "json",
		state: "active",
		key: "1,2,3",
	});
	assert.equal(flags.limit, 50);
	assert.equal(flags.batchSize, 25);
	assert.equal(flags.force, true);
	assert.equal(flags.workers, 8);
	assert.equal(flags.reportFormat, "json");
	assert.equal(flags.raw.retentionDays, 30);
	assert.equal(flags.raw.jobTimeoutMs, 60000);
	assert.equal(flags.raw.retries, 3);
	assert.equal(flags.raw.count, 5);
	assert.equal(flags.raw.state, "active");
	assert.equal(flags.raw.key, "1,2,3");
});

test("cli: resolvePlaybook resolves canonical and alias routes", () => {
	assert.equal(resolvePlaybook(["execute", "smoke-test"]).key, "execute/smoke-test");
	assert.equal(resolvePlaybook(["smoke-test"]).key, "execute/smoke-test");
	assert.equal(resolvePlaybook(["retention"]).key, "execute/retention-policy");
	assert.equal(
		resolvePlaybook(["purge", "orphan-process-instances"]).key,
		"purge/orphan-process-instances",
	);
	assert.equal(resolvePlaybook(["repair", "incident"]).key, "repair/incident");
	assert.equal(resolvePlaybook(["walk", "process-instance"]).key, "walk/process-instance");
	assert.equal(resolvePlaybook(["walk"]).key, "walk/process-instance");
});

test("cli: coerceFlags carries walk toggles", () => {
	const flags = coerceFlags({ parent: true, "with-incidents": true });
	assert.equal(flags.raw.parent, true);
	assert.equal(flags.raw.children, false);
	assert.equal(flags.raw.flat, false);
	assert.equal(flags.raw.withIncidents, true);
});

test("cli: resolvePlaybook throws on unknown command", () => {
	assert.throws(() => resolvePlaybook(["purge", "nope"]), /unknown ops command/);
	assert.throws(() => resolvePlaybook([]), /missing ops command/);
});

test("cli: every route is reachable", () => {
	for (const key of listRoutes()) {
		const [verb, resource] = key.split("/");
		assert.ok(verb);
		assert.equal(resolvePlaybook([verb, resource ?? ""]).key, key);
	}
});

test("types: discoveryScope flags a user-limited run", () => {
	const complete = discoveryScope(10, 10, 1, 0, 100);
	assert.equal(complete.complete, true);
	const limited = discoveryScope(50, 20, 2, 20, 100);
	assert.equal(limited.limited, true);
	assert.equal(limited.complete, false);
});

test("report: renderMarkdown emits deterministic audit doc", () => {
	const report: OpsReport = {
		schemaVersion: "ops.test.v1",
		command: "ops execute test",
		startedAt: "2026-01-01T00:00:00.000Z",
		finishedAt: "2026-01-01T00:00:01.000Z",
		durationMs: 1000,
		dryRun: true,
		autoConfirm: false,
		automation: false,
		noWait: false,
		force: false,
		outcome: "planned",
		errors: [],
		notices: ["all good"],
		discovery: { candidateCount: 2, keys: ["a", "b"] },
	};
	const md = renderMarkdown(report);
	assert.match(md, /# ops execute test — audit report/);
	assert.match(md, /\| command \| ops execute test \|/);
	assert.match(md, /## Discovery/);
	assert.match(md, /## Notices/);
});
