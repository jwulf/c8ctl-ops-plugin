/** ops execute smoke-test — deploy an embedded fixture, run instances, walk families, and clean up. */

import type { OpsContext } from "../engine/context.ts";
import { collectDescendants } from "../engine/family.ts";
import { runPool } from "../engine/pool.ts";
import { baseReport, finalize } from "../engine/report.ts";
import { num } from "../engine/util.ts";
import {
	SMOKE_TEST_BPMN,
	SMOKE_TEST_PROCESS_ID,
	SMOKE_TEST_RESOURCE_NAME,
} from "../fixtures/smoke-test.ts";

const SCHEMA = "ops.smoke-test.v1";
const COMMAND = "ops execute smoke-test";

export async function run(ctx: OpsContext): Promise<void> {
	const startedAt = Date.now();
	const report = baseReport(ctx, { schemaVersion: SCHEMA, command: COMMAND, startedAt });
	const lines: string[] = [];
	const emit = (outcome: Parameters<typeof finalize>[1]) =>
		ctx.emit(finalize(report, outcome, startedAt), () => lines);

	const count = Math.max(1, num(ctx.flags.raw.count) ?? 1);
	const cleanup = ctx.flags.raw.noCleanup !== true;

	lines.push(ctx.dryRun ? "dry run: smoke test" : "smoke test");

	// Phase 1: Plan — connectivity check.
	try {
		await ctx.api.getTopology();
		report.plan = { status: "confirmed", connectivity: "ok", plannedInstances: count, cleanup };
		lines.push("plan: connectivity ok");
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		report.plan = { status: "failed", connectivity: "failed", errors: [message] };
		report.deployment = { status: "skipped" };
		report.run = { status: "skipped" };
		report.walk = { status: "skipped" };
		report.cleanup = { status: "skipped" };
		report.errors.push(message);
		lines.push(`plan: connectivity failed: ${message}`);
		lines.push("outcome: failed");
		await emit("failed");
		return;
	}

	if (ctx.dryRun) {
		report.deployment = { status: "skipped" };
		report.run = { status: "skipped" };
		report.walk = { status: "skipped" };
		report.cleanup = { status: "skipped" };
		lines.push(
			`plan: deploy fixture ${SMOKE_TEST_RESOURCE_NAME}, start ${count} process instance(s), walk families, ${cleanup ? "clean up" : "retain"} resources`,
		);
		lines.push("outcome: planned");
		await emit("planned");
		return;
	}

	if (!(await ctx.confirm(confirmationPrompt(count, cleanup)))) {
		report.deployment = { status: "skipped" };
		report.run = { status: "skipped" };
		report.walk = { status: "skipped" };
		report.cleanup = { status: "skipped" };
		report.notices.push("aborted by user");
		lines.push("aborted by user");
		await emit("planned");
		return;
	}

	// Phase 2: Deployment.
	let processDefinitionKey: string | undefined;
	try {
		const deployment = await ctx.api.deployResource(SMOKE_TEST_RESOURCE_NAME, SMOKE_TEST_BPMN);
		processDefinitionKey = deployment.processDefinitionKey;
		report.deployment = {
			status: "confirmed",
			resourceName: SMOKE_TEST_RESOURCE_NAME,
			processDefinitionId: SMOKE_TEST_PROCESS_ID,
			processDefinitionKey,
		};
		lines.push(
			`deploy: confirmed process definition ${processDefinitionKey ?? SMOKE_TEST_PROCESS_ID}`,
		);
	} catch (err) {
		return failFrom(ctx, report, lines, emit, "deployment", err, ["run", "walk", "cleanup"]);
	}

	// Phase 3: Run — create N instances.
	const createWorkers = ctx.workerCount(count);
	const createResults = await runPool(
		Array.from({ length: count }, (_, i) => i),
		{ workers: createWorkers, failFast: ctx.flags.failFast },
		async () => {
			const pi = await ctx.api.createProcessInstance({
				processDefinitionId: SMOKE_TEST_PROCESS_ID,
			});
			return pi.processInstanceKey;
		},
	);
	const createdKeys = createResults
		.map((r) => r.value)
		.filter((k): k is string => typeof k === "string" && k.length > 0);
	const createErrors = createResults.filter((r) => r.error).map((r) => r.error?.message ?? "error");
	report.run = {
		status: createErrors.length > 0 ? "failed" : "confirmed",
		requested: count,
		created: createdKeys.length,
		processInstanceKeys: createdKeys,
		errors: createErrors,
	};
	lines.push(`run: created ${createdKeys.length}/${count} process instance(s)`);
	if (createErrors.length > 0) report.errors.push(...createErrors);

	// Phase 4: Walk — traverse each created family.
	const walkResults = await runPool(
		createdKeys,
		{ workers: ctx.workerCount(createdKeys.length), failFast: ctx.flags.failFast },
		async (rootKey) => (await collectDescendants(ctx.api, rootKey)).length,
	);
	const walkErrors = walkResults.filter((r) => r.error).map((r) => r.error?.message ?? "error");
	const walkedFamilies = walkResults.filter((r) => r.value !== undefined).length;
	const elementsWalked = walkResults.reduce((n, r) => n + (r.value ?? 0), 0);
	report.walk = {
		status: walkErrors.length > 0 ? "failed" : "confirmed",
		walkedFamilies,
		processInstancesVisited: elementsWalked,
		errors: walkErrors,
	};
	lines.push(
		`walk: visited ${elementsWalked} process instance(s) across ${walkedFamilies} family(ies)`,
	);
	if (walkErrors.length > 0) report.errors.push(...walkErrors);

	// Phase 5: Cleanup.
	if (!cleanup) {
		report.cleanup = {
			status: "skipped",
			processInstancesRetained: createdKeys.length,
			processDefinitionRetained: processDefinitionKey,
		};
		lines.push("cleanup: retained created resources");
	} else {
		const cleanupErrors = await runCleanup(ctx, createdKeys, processDefinitionKey, report, lines);
		if (cleanupErrors.length > 0) report.errors.push(...cleanupErrors);
	}

	const outcome = report.errors.length > 0 ? "partial" : "executed";
	lines.push(`outcome: ${outcome}`);
	await emit(outcome);
}

async function runCleanup(
	ctx: OpsContext,
	createdKeys: string[],
	processDefinitionKey: string | undefined,
	report: Record<string, unknown>,
	lines: string[],
): Promise<string[]> {
	const deleteResults = await runPool(
		createdKeys,
		{ workers: ctx.workerCount(createdKeys.length), failFast: false },
		async (key) => {
			await ctx.api.deleteProcessInstance(key);
			return true;
		},
	);
	const deleted = deleteResults.filter((r) => r.value === true).length;
	const errors = deleteResults.filter((r) => r.error).map((r) => `${r.item}: ${r.error?.message}`);

	// Only delete the definition when no unrelated instances remain.
	let definitionDeleted = false;
	let definitionEligible = false;
	if (processDefinitionKey && errors.length === 0) {
		const remaining = await ctx.api.searchProcessInstancesPage({ processDefinitionKey }, 1);
		definitionEligible = remaining.items.length === 0;
		if (definitionEligible) {
			try {
				await ctx.api.deleteResource(processDefinitionKey);
				definitionDeleted = true;
			} catch (err) {
				errors.push(
					`definition ${processDefinitionKey}: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		}
	}

	report.cleanup = {
		status: errors.length > 0 ? "failed" : "confirmed",
		processInstancesDeleted: deleted,
		processDefinitionEligible: definitionEligible,
		processDefinitionDeleted: definitionDeleted,
		errors,
	};
	lines.push(
		`cleanup: deleted ${deleted}/${createdKeys.length} process instance(s)${definitionDeleted ? "; deleted process definition" : definitionEligible ? "" : "; retained process definition (unrelated instances exist)"}`,
	);
	return errors;
}

async function failFrom(
	ctx: OpsContext,
	report: Record<string, unknown>,
	lines: string[],
	emit: (outcome: Parameters<typeof finalize>[1]) => Promise<void>,
	phase: string,
	err: unknown,
	skip: string[],
): Promise<void> {
	const message = err instanceof Error ? err.message : String(err);
	report[phase] = { status: "failed", errors: [message] };
	for (const s of skip) report[s] = { status: "skipped" };
	const errors = Array.isArray(report.errors) ? report.errors : [];
	report.errors = [...errors.filter((e): e is string => typeof e === "string"), message];
	lines.push(`${phase}: failed: ${message}`);
	lines.push("outcome: failed");
	await emit("failed");
}

function confirmationPrompt(count: number, cleanup: boolean): string {
	const clause = cleanup ? "then clean up created resources" : "then retain created resources";
	return `smoke test: deploy fixture, start ${count} process instance(s), walk process-instance families, ${clause}. Do you want to proceed?`;
}
