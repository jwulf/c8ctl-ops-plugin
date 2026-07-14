/** ops repair process-instance — repair active incidents scoped to selected process instances. */

import type { Incident, ProcessInstanceFilter } from "../engine/api.ts";
import type { OpsContext } from "../engine/context.ts";
import { discoverAll } from "../engine/discovery.ts";
import { REPAIR_SCHEMA, runRepair } from "../engine/repair.ts";
import { baseReport, finalize } from "../engine/report.ts";
import { describeScope } from "../engine/types.ts";
import { keyList, str, unique } from "../engine/util.ts";

const COMMAND = "ops repair process-instance";

export async function run(ctx: OpsContext): Promise<void> {
	const startedAt = Date.now();
	const report = baseReport(ctx, { schemaVersion: REPAIR_SCHEMA, command: COMMAND, startedAt });
	const lines: string[] = [];
	const emit = (outcome: Parameters<typeof finalize>[1]) =>
		ctx.emit(finalize(report, outcome, startedAt), () => lines);

	lines.push(
		ctx.dryRun ? "dry run: repair process-instance incidents" : "repair process-instance incidents",
	);

	const explicitKeys = keyList(ctx.flags.raw.key);
	const processInstanceKeys =
		explicitKeys.length > 0 ? explicitKeys : await discoverProcessInstances(ctx, report, lines);

	const incidents = await collectIncidents(ctx, processInstanceKeys, report);
	await runRepair(ctx, report, lines, startedAt, incidents, emit);
}

async function discoverProcessInstances(
	ctx: OpsContext,
	report: Record<string, unknown>,
	lines: string[],
): Promise<string[]> {
	const state = str(ctx.flags.raw.state) ?? "ACTIVE";
	const filter: ProcessInstanceFilter = {
		hasIncident: true,
		...(state && state !== "all" ? { state: state.toUpperCase() } : {}),
		...(str(ctx.flags.raw.bpmnProcessId)
			? { processDefinitionId: str(ctx.flags.raw.bpmnProcessId) }
			: {}),
		...(str(ctx.flags.raw.pdKey) ? { processDefinitionKey: str(ctx.flags.raw.pdKey) } : {}),
		...(str(ctx.flags.raw.parentKey)
			? { parentProcessInstanceKey: str(ctx.flags.raw.parentKey) }
			: {}),
	};
	const discovery = await discoverAll(
		(limit, after) => ctx.api.searchProcessInstancesPage(filter, limit, after),
		{ limit: ctx.flags.limit, batchSize: ctx.flags.batchSize },
	);
	const keys = unique(discovery.items.map((pi) => pi.processInstanceKey));
	report.selection = {
		mode: "search",
		filters: filter,
		processInstanceCount: keys.length,
		scope: discovery.scope,
		processInstanceKeys: keys,
	};
	if (discovery.scope.limited || ctx.verbose) lines.push(describeScope(discovery.scope));
	return keys;
}

async function collectIncidents(
	ctx: OpsContext,
	processInstanceKeys: readonly string[],
	report: Record<string, unknown>,
): Promise<Incident[]> {
	const state = str(ctx.flags.raw.incidentState) ?? "ACTIVE";
	const errorType = str(ctx.flags.raw.errorType);
	const all: Incident[] = [];
	const skipped: string[] = [];
	for (const key of processInstanceKeys) {
		const incidents = await ctx.api.incidentsForProcessInstance(
			key,
			state === "all" ? undefined : state.toUpperCase(),
		);
		const filtered = errorType
			? incidents.filter((i) => (i.errorType ?? "").toLowerCase() === errorType.toLowerCase())
			: incidents;
		if (filtered.length === 0) skipped.push(key);
		all.push(...filtered);
	}
	report.discovery = {
		mode: "process-instance",
		requestedProcessInstanceKeys: [...processInstanceKeys],
		incidentCount: all.length,
		skippedProcessInstanceKeys: skipped,
		incidentKeys: all.map((i) => i.incidentKey),
	};
	if (skipped.length > 0) {
		report.notices = [`${skipped.length} process instance(s) had no matching active incidents`];
	}
	return all;
}
