/** ops purge orphan-process-instances — find and delete orphan child process-instance families. */

import type { ProcessInstance, ProcessInstanceFilter } from "../engine/api.ts";
import type { OpsContext } from "../engine/context.ts";
import { discoverWhere } from "../engine/discovery.ts";
import { type FamilyDeletePlan, planFamilyDelete } from "../engine/family.ts";
import { blockedByNonFinal, blockedMessage, runDelete } from "../engine/purge.ts";
import { baseReport, finalize } from "../engine/report.ts";
import { describeScope } from "../engine/types.ts";
import { str } from "../engine/util.ts";

const SCHEMA = "ops.orphan-process-instances.v1";
const COMMAND = "ops purge orphan-process-instances";

export async function run(ctx: OpsContext): Promise<void> {
	const startedAt = Date.now();
	const report = baseReport(ctx, { schemaVersion: SCHEMA, command: COMMAND, startedAt });
	const lines: string[] = [];
	const emit = (outcome: Parameters<typeof finalize>[1]) =>
		ctx.emit(finalize(report, outcome, startedAt), () => lines);

	const state = str(ctx.flags.raw.state);
	const filter: ProcessInstanceFilter = {
		parentProcessInstanceKey: { $exists: true },
		...(state && state !== "all" ? { state: state.toUpperCase() } : {}),
		...(str(ctx.flags.raw.bpmnProcessId)
			? { processDefinitionId: str(ctx.flags.raw.bpmnProcessId) }
			: {}),
		...(str(ctx.flags.raw.pdKey) ? { processDefinitionKey: str(ctx.flags.raw.pdKey) } : {}),
	};

	lines.push(
		ctx.dryRun ? "dry run: purge orphan process-instances" : "purge orphan process-instances",
	);

	const parentExists = new Map<string, boolean>();
	const isOrphan = async (pi: ProcessInstance): Promise<boolean> => {
		const parentKey = pi.parentProcessInstanceKey;
		if (!parentKey) return false;
		let exists = parentExists.get(parentKey);
		if (exists === undefined) {
			exists = (await ctx.api.getProcessInstance(parentKey)) !== undefined;
			parentExists.set(parentKey, exists);
		}
		return !exists;
	};

	const discovery = await discoverWhere(
		(limit, after) => ctx.api.searchProcessInstancesPage(filter, limit, after),
		isOrphan,
		{ limit: ctx.flags.limit, batchSize: ctx.flags.batchSize },
	);
	const seedKeys = discovery.items.map((pi) => pi.processInstanceKey);
	report.discovery = {
		filters: filter,
		orphanCandidateCount: seedKeys.length,
		scope: discovery.scope,
		orphanKeys: seedKeys,
	};
	lines.push(`orphan candidates: ${seedKeys.length}`);
	if (discovery.scope.limited || ctx.verbose) lines.push(describeScope(discovery.scope));

	if (seedKeys.length === 0) {
		report.deletePlan = { status: "skipped" };
		report.deletion = { status: "skipped" };
		report.notices.push("no orphan process instances found");
		lines.push("outcome: planned");
		await emit("planned");
		return;
	}

	// Orphans have a missing ancestor, so each orphan is treated as its own root.
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
		`delete preview: ${plan.seedKeys.length} orphan candidate(s), ${plan.affectedKeys.length} affected process instance(s) across ${plan.resolvedRootKeys.length} root(s) ${verb} deleted`,
	);
	if (plan.nonFinalAffectedKeys.length > 0) {
		lines.push(
			`non-final affected process instances: ${plan.nonFinalAffectedKeys.length} (use --force to cancel before delete)`,
		);
	}
}

function confirmationPrompt(plan: FamilyDeletePlan): string {
	return `orphan purge: ${plan.seedKeys.length} orphan candidate(s), ${plan.affectedKeys.length} affected process instance(s) across ${plan.resolvedRootKeys.length} root(s) will be deleted. Do you want to proceed?`;
}
