/** ops repair incident — resolve incidents (with optional job retry/timeout and variable updates). */

import type { Incident, IncidentFilter } from "../engine/api.ts";
import type { OpsContext } from "../engine/context.ts";
import { discoverAll } from "../engine/discovery.ts";
import { REPAIR_SCHEMA, runRepair } from "../engine/repair.ts";
import { baseReport, finalize } from "../engine/report.ts";
import { describeScope } from "../engine/types.ts";
import { keyList, str } from "../engine/util.ts";

const COMMAND = "ops repair incident";

export async function run(ctx: OpsContext): Promise<void> {
	const startedAt = Date.now();
	const report = baseReport(ctx, { schemaVersion: REPAIR_SCHEMA, command: COMMAND, startedAt });
	const lines: string[] = [];
	const emit = (outcome: Parameters<typeof finalize>[1]) =>
		ctx.emit(finalize(report, outcome, startedAt), () => lines);

	lines.push(ctx.dryRun ? "dry run: repair incidents" : "repair incidents");

	const explicitKeys = keyList(ctx.flags.raw.key);
	const incidents =
		explicitKeys.length > 0
			? await resolveExplicit(ctx, explicitKeys, report)
			: await discoverIncidents(ctx, report, lines);

	await runRepair(ctx, report, lines, startedAt, incidents, emit);
}

async function resolveExplicit(
	ctx: OpsContext,
	keys: string[],
	report: Record<string, unknown>,
): Promise<Incident[]> {
	const incidents: Incident[] = [];
	const missing: string[] = [];
	for (const key of keys) {
		const page = await ctx.api.searchIncidentsPage({ incidentKey: key }, 1);
		const match = page.items[0];
		if (match) incidents.push(match);
		else missing.push(key);
	}
	report.discovery = {
		mode: "explicit",
		requestedIncidentKeys: keys,
		resolvedIncidentCount: incidents.length,
		missingIncidentKeys: missing,
	};
	if (missing.length > 0) {
		report.notices = [`${missing.length} incident key(s) not found`];
	}
	return incidents;
}

async function discoverIncidents(
	ctx: OpsContext,
	report: Record<string, unknown>,
	lines: string[],
): Promise<Incident[]> {
	const state = str(ctx.flags.raw.state) ?? "ACTIVE";
	const filter: IncidentFilter = {
		...(state && state !== "all" ? { state: state.toUpperCase() } : {}),
		...(str(ctx.flags.raw.errorType) ? { errorType: str(ctx.flags.raw.errorType) } : {}),
		...(str(ctx.flags.raw.bpmnProcessId)
			? { processDefinitionId: str(ctx.flags.raw.bpmnProcessId) }
			: {}),
		...(str(ctx.flags.raw.pdKey) ? { processDefinitionKey: str(ctx.flags.raw.pdKey) } : {}),
		...(str(ctx.flags.raw.piKey) ? { processInstanceKey: str(ctx.flags.raw.piKey) } : {}),
		...(str(ctx.flags.raw.elementId) ? { elementId: str(ctx.flags.raw.elementId) } : {}),
	};
	const discovery = await discoverAll(
		(limit, after) => ctx.api.searchIncidentsPage(filter, limit, after),
		{ limit: ctx.flags.limit, batchSize: ctx.flags.batchSize },
	);
	report.discovery = {
		mode: "search",
		filters: filter,
		incidentCount: discovery.items.length,
		scope: discovery.scope,
		incidentKeys: discovery.items.map((i) => i.incidentKey),
	};
	if (discovery.scope.limited || ctx.verbose) lines.push(describeScope(discovery.scope));
	return discovery.items;
}
