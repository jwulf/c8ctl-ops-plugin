/** ops purge process-instances-with-incidents — delete families of process instances that have incidents. */

import type { IncidentFilter } from "../engine/api.ts";
import type { OpsContext } from "../engine/context.ts";
import { discoverAll } from "../engine/discovery.ts";
import { type FamilyDeletePlan, planFamilyDelete } from "../engine/family.ts";
import { blockedByNonFinal, blockedMessage, runDelete } from "../engine/purge.ts";
import { baseReport, finalize } from "../engine/report.ts";
import { describeScope } from "../engine/types.ts";
import { str, unique } from "../engine/util.ts";

const SCHEMA = "ops.process-instances-with-incidents.v1";
const COMMAND = "ops purge process-instances-with-incidents";

export async function run(ctx: OpsContext): Promise<void> {
	const startedAt = Date.now();
	const report = baseReport(ctx, { schemaVersion: SCHEMA, command: COMMAND, startedAt });
	const lines: string[] = [];
	const emit = (outcome: Parameters<typeof finalize>[1]) =>
		ctx.emit(finalize(report, outcome, startedAt), () => lines);

	const state = str(ctx.flags.raw.incidentState) ?? "ACTIVE";
	const filter: IncidentFilter = {
		...(state && state !== "all" ? { state: state.toUpperCase() } : {}),
		...(str(ctx.flags.raw.errorType) ? { errorType: str(ctx.flags.raw.errorType) } : {}),
		...(str(ctx.flags.raw.bpmnProcessId)
			? { processDefinitionId: str(ctx.flags.raw.bpmnProcessId) }
			: {}),
		...(str(ctx.flags.raw.pdKey) ? { processDefinitionKey: str(ctx.flags.raw.pdKey) } : {}),
	};

	lines.push(
		ctx.dryRun
			? "dry run: purge process-instances-with-incidents"
			: "purge process-instances-with-incidents",
	);

	const discovery = await discoverAll(
		(limit, after) => ctx.api.searchIncidentsPage(filter, limit, after),
		{ limit: ctx.flags.limit, batchSize: ctx.flags.batchSize },
	);
	const incidentKeys = discovery.items.map((i) => i.incidentKey);
	const missingPi = discovery.items.filter((i) => !i.processInstanceKey).length;
	const seedKeys = unique(
		discovery.items
			.map((i) => i.processInstanceKey)
			.filter((k): k is string => typeof k === "string" && k.length > 0),
	);
	report.discovery = {
		filters: filter,
		incidentCount: incidentKeys.length,
		candidateProcessInstanceCount: seedKeys.length,
		incidentsWithoutProcessInstance: missingPi,
		scope: discovery.scope,
		incidentKeys,
		seedKeys,
	};
	lines.push(`incidents: ${incidentKeys.length}; candidate process instances: ${seedKeys.length}`);
	if (missingPi > 0) {
		report.notices.push(`${missingPi} incident(s) skipped: no process-instance key`);
		lines.push(`skipped ${missingPi} incident(s) with no process-instance key`);
	}
	if (discovery.scope.limited || ctx.verbose) lines.push(describeScope(discovery.scope));

	if (seedKeys.length === 0) {
		report.deletePlan = { status: "skipped" };
		report.deletion = { status: "skipped" };
		report.notices.push("no process instances with incidents found");
		lines.push("outcome: planned");
		await emit("planned");
		return;
	}

	const plan = await planFamilyDelete(ctx.api, seedKeys, {
		workers: ctx.workerCount(seedKeys.length),
		failFast: ctx.flags.failFast,
		includeNonFinalRoots: true,
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
		`delete preview: ${plan.seedKeys.length} process instance(s) with incidents, ${plan.affectedKeys.length} affected process instance(s) across ${plan.resolvedRootKeys.length} root(s) ${verb} deleted`,
	);
	if (plan.nonFinalAffectedKeys.length > 0) {
		lines.push(
			`non-final affected process instances: ${plan.nonFinalAffectedKeys.length} (use --force to cancel before delete)`,
		);
	}
}

function confirmationPrompt(plan: FamilyDeletePlan): string {
	return `incident purge: ${plan.seedKeys.length} process instance(s) with incidents, ${plan.affectedKeys.length} affected process instance(s) across ${plan.resolvedRootKeys.length} root(s) will be deleted. Do you want to proceed?`;
}
