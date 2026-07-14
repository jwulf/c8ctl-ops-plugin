/** ops execute retention-policy — delete finished process instances older than a retention age. */

import type { ProcessInstanceFilter } from "../engine/api.ts";
import type { OpsContext } from "../engine/context.ts";
import { discoverAll } from "../engine/discovery.ts";
import { type FamilyDeletePlan, planFamilyDelete } from "../engine/family.ts";
import { blockedByNonFinal, blockedMessage, runDelete } from "../engine/purge.ts";
import { baseReport, finalize } from "../engine/report.ts";
import { describeScope } from "../engine/types.ts";
import { num, str } from "../engine/util.ts";

const SCHEMA = "ops.retention-policy.v1";
const COMMAND = "ops execute retention-policy";

export async function run(ctx: OpsContext): Promise<void> {
	const startedAt = Date.now();
	const report = baseReport(ctx, { schemaVersion: SCHEMA, command: COMMAND, startedAt });
	const lines: string[] = [];
	const emit = (outcome: Parameters<typeof finalize>[1]) =>
		ctx.emit(finalize(report, outcome, startedAt), () => lines);

	const retentionDays = num(ctx.flags.raw.retentionDays);
	if (retentionDays === undefined || retentionDays < 0) {
		throw new Error(
			"ops execute retention-policy requires --retention-days (non-negative integer)",
		);
	}

	const boundary = new Date(startedAt - retentionDays * 86_400_000).toISOString();
	const state = str(ctx.flags.raw.state);
	const filter: ProcessInstanceFilter = {
		endDate: { before: boundary },
		...(state && state !== "all" ? { state: state.toUpperCase() } : {}),
		...(str(ctx.flags.raw.bpmnProcessId)
			? { processDefinitionId: str(ctx.flags.raw.bpmnProcessId) }
			: {}),
		...(str(ctx.flags.raw.pdKey) ? { processDefinitionKey: str(ctx.flags.raw.pdKey) } : {}),
		...(str(ctx.flags.raw.parentKey)
			? { parentProcessInstanceKey: str(ctx.flags.raw.parentKey) }
			: {}),
	};

	lines.push(ctx.dryRun ? "dry run: execute retention-policy" : "execute retention-policy");
	ctx.progress(
		`retention: candidates finished on or before ${boundary} (retention-days ${retentionDays})`,
	);

	const discovery = await discoverAll(
		(limit, after) => ctx.api.searchProcessInstancesPage(filter, limit, after),
		{ limit: ctx.flags.limit, batchSize: ctx.flags.batchSize },
	);
	const seedKeys = discovery.items.map((pi) => pi.processInstanceKey);
	report.discovery = {
		retentionDays,
		derivedEndDateBoundary: boundary,
		filters: filter,
		candidateCount: seedKeys.length,
		scope: discovery.scope,
		seedKeys,
	};
	lines.push(`retention candidates: ${seedKeys.length}`);
	if (discovery.scope.limited || ctx.verbose) lines.push(describeScope(discovery.scope));

	if (seedKeys.length === 0) {
		report.deletePlan = { status: "skipped" };
		report.deletion = { status: "skipped" };
		report.notices.push("no retention candidates found");
		lines.push("outcome: planned");
		await emit("planned");
		return;
	}

	const plan = await planFamilyDelete(ctx.api, seedKeys, {
		workers: ctx.workerCount(seedKeys.length),
		failFast: ctx.flags.failFast,
		includeNonFinalRoots: false,
	});
	report.deletePlan = { status: "planned", ...plan };
	renderPlanLine(lines, ctx, plan);

	if (ctx.dryRun) {
		report.deletion = { status: "skipped" };
		lines.push("outcome: planned");
		await emit("planned");
		return;
	}

	if (blockedByNonFinal(plan, ctx.flags.force)) {
		const message = blockedMessage(plan);
		report.deletion = { status: "blocked", errors: [message] };
		report.errors.push(message);
		lines.push(`blocked: ${message}`);
		lines.push("outcome: failed");
		await emit("failed");
		return;
	}

	if (plan.resolvedRootKeys.length === 0) {
		report.deletion = { status: "skipped" };
		report.notices.push("no final-root retention scope resolved");
		lines.push("outcome: planned");
		await emit("planned");
		return;
	}

	if (!(await ctx.confirm(confirmationPrompt(plan)))) {
		report.deletion = { status: "skipped" };
		report.notices.push("aborted by user");
		lines.push("aborted by user");
		await emit("planned");
		return;
	}

	const deletion = await runDelete(ctx, plan);
	report.deletion = deletion;
	const outcome = deletion.errors.length > 0 ? "partial" : "executed";
	lines.push(
		`deleted: ${deletion.items.filter((i) => i.deleted).length}/${deletion.submittedRootKeys.length} root(s)${deletion.noWait ? " (submitted, not awaited)" : ""}`,
	);
	lines.push(`outcome: ${outcome}`);
	await emit(outcome);
}

function renderPlanLine(lines: string[], ctx: OpsContext, plan: FamilyDeletePlan): void {
	const verb = ctx.dryRun ? "would be" : "will be";
	lines.push(
		`delete preview: ${plan.seedKeys.length} retention candidate(s), ${plan.affectedKeys.length} affected process instance(s) across ${plan.resolvedRootKeys.length} root(s) ${verb} deleted`,
	);
	if (plan.nonFinalAffectedKeys.length > 0) {
		lines.push(
			`non-final affected process instances: ${plan.nonFinalAffectedKeys.length} (use --force to cancel before delete)`,
		);
	}
	if (plan.skippedSeedKeys.length > 0) {
		lines.push(`skipped: ${plan.skippedSeedKeys.length} candidate(s) whose root is not final`);
	}
}

function confirmationPrompt(plan: FamilyDeletePlan): string {
	let prompt = `retention cleanup: ${plan.seedKeys.length} retention candidate(s), ${plan.affectedKeys.length} affected process instance(s) across ${plan.resolvedRootKeys.length} root(s) will be deleted`;
	if (plan.skippedSeedKeys.length > 0) {
		prompt += `; ${plan.skippedSeedKeys.length} retention candidate(s) skipped because their root is not final`;
	}
	return `${prompt}. Do you want to proceed?`;
}
