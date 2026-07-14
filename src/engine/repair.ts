/** Shared incident-repair engine used by the repair-incident and repair-process-instance playbooks. */

import type { Incident } from "../engine/api.ts";
import type { OpsContext } from "../engine/context.ts";
import { runPool } from "../engine/pool.ts";
import type { finalize } from "../engine/report.ts";
import { parseJsonObject, unique } from "../engine/util.ts";

export const REPAIR_SCHEMA = "ops.repair.v1";

export interface RepairOptions {
	retries: number;
	timeoutMs?: number;
	variables?: Record<string, unknown>;
}

export interface RepairFrozenSet {
	incidentKeys: string[];
	processInstanceKeys: string[];
	jobKeys: string[];
	variableScopeKeys: string[];
}

interface IncidentRepairItem {
	incidentKey: string;
	processInstanceKey?: string;
	jobKey?: string;
	retriesUpdated: boolean;
	timeoutUpdated: boolean;
	resolved: boolean;
	error?: string;
}

interface VariableScopeItem {
	processInstanceKey: string;
	updated: boolean;
	error?: string;
}

/** Read repair options (retries/timeout/vars) from coerced plugin flags. */
export function repairOptionsFromFlags(ctx: OpsContext): RepairOptions {
	const raw = ctx.flags.raw;
	const retries = typeof raw.retries === "number" ? raw.retries : 1;
	const timeoutMs =
		typeof raw.jobTimeoutMs === "number" && raw.jobTimeoutMs > 0 ? raw.jobTimeoutMs : undefined;
	let variables: Record<string, unknown> | undefined;
	if (typeof raw.vars === "string" && raw.vars.trim() !== "") {
		variables = parseJsonObject(raw.vars, "vars");
	}
	return { retries, timeoutMs, variables };
}

export function freeze(incidents: readonly Incident[], options: RepairOptions): RepairFrozenSet {
	const processInstanceKeys = unique(
		incidents.map((i) => i.processInstanceKey).filter((k): k is string => !!k),
	);
	return {
		incidentKeys: unique(incidents.map((i) => i.incidentKey)),
		processInstanceKeys,
		jobKeys: unique(incidents.map((i) => i.jobKey).filter((k): k is string => !!k)),
		variableScopeKeys: options.variables ? processInstanceKeys : [],
	};
}

/**
 * Execute the shared repair workflow over a frozen incident set: optionally set
 * variables per process-instance scope, update related job retries/timeout,
 * resolve each incident, then (unless --no-wait) verify no active incidents
 * remain. Fills `report` sections and emits via `emit`.
 */
export async function runRepair(
	ctx: OpsContext,
	report: Record<string, unknown>,
	lines: string[],
	startedAt: number,
	incidents: readonly Incident[],
	emit: (outcome: Parameters<typeof finalize>[1]) => Promise<void>,
): Promise<void> {
	const options = repairOptionsFromFlags(ctx);
	const frozen = freeze(incidents, options);

	report.plan = {
		status: "planned",
		activeIncidentCount: frozen.incidentKeys.length,
		processInstanceCount: frozen.processInstanceKeys.length,
		relatedJobCount: frozen.jobKeys.length,
		variableScopeCount: frozen.variableScopeKeys.length,
		retries: options.retries,
		jobTimeoutMs: options.timeoutMs,
	};
	const verb = ctx.dryRun ? "would be" : "will be";
	lines.push(
		`repair preview: ${frozen.incidentKeys.length} active incident(s) ${verb} resolved; ${frozen.jobKeys.length} related job(s), ${frozen.variableScopeKeys.length} variable scope(s) ${verb} updated`,
	);
	lines.push(
		`job repair coverage: ${frozen.jobKeys.length} related job(s), ${frozen.incidentKeys.length - frozen.jobKeys.length} incident(s) without related jobs`,
	);

	if (frozen.incidentKeys.length === 0) {
		report.execution = { status: "skipped" };
		report.remaining = { status: "skipped" };
		report.notices = [...asArray(report.notices), "no active incidents to repair"];
		lines.push("outcome: planned");
		await emit("planned");
		return;
	}

	if (ctx.dryRun) {
		report.execution = { status: "skipped" };
		lines.push("outcome: planned");
		await emit("planned");
		return;
	}

	if (!(await ctx.confirm(confirmationPrompt(frozen)))) {
		report.execution = { status: "skipped" };
		report.notices = [...asArray(report.notices), "aborted by user"];
		lines.push("aborted by user");
		await emit("planned");
		return;
	}

	// Set variables once per process-instance scope before resolving incidents.
	const variableScopes: VariableScopeItem[] = [];
	const blockedScopes = new Set<string>();
	if (options.variables) {
		for (const key of frozen.variableScopeKeys) {
			try {
				await ctx.api.setProcessInstanceVariables(key, options.variables);
				variableScopes.push({ processInstanceKey: key, updated: true });
			} catch (err) {
				blockedScopes.add(key);
				variableScopes.push({
					processInstanceKey: key,
					updated: false,
					error: err instanceof Error ? err.message : String(err),
				});
			}
		}
	}

	const workers = ctx.workerCount(incidents.length);
	const results = await runPool(incidents, { workers, failFast: ctx.flags.failFast }, (incident) =>
		repairOne(ctx, incident, options, blockedScopes),
	);
	const items = results.map(
		(r) =>
			r.value ?? {
				incidentKey: r.item.incidentKey,
				processInstanceKey: r.item.processInstanceKey,
				jobKey: r.item.jobKey,
				retriesUpdated: false,
				timeoutUpdated: false,
				resolved: false,
				error: r.error?.message,
			},
	);

	const errors = items
		.filter((i) => i.error)
		.map((i) => `${i.incidentKey}: ${i.error}`)
		.concat(
			variableScopes.filter((v) => v.error).map((v) => `${v.processInstanceKey}: ${v.error}`),
		);
	const resolved = items.filter((i) => i.resolved).length;
	report.variableScopes = variableScopes;
	report.execution = {
		status: errors.length > 0 ? "failed" : ctx.flags.noWait ? "submitted" : "confirmed",
		items,
		resolvedIncidentCount: resolved,
		submitted: items.length > 0,
		noWait: ctx.flags.noWait,
		errors,
	};

	let remainingActive = 0;
	if (!ctx.flags.noWait) {
		remainingActive = await countRemainingActive(ctx, frozen.processInstanceKeys);
	}
	report.remaining = {
		status: ctx.flags.noWait ? "submitted" : "confirmed",
		checked: !ctx.flags.noWait,
		activeIncidentCount: remainingActive,
	};

	if (errors.length > 0) {
		report.errors = [...asArray(report.errors), ...errors];
	}
	const outcome = errors.length > 0 ? (resolved > 0 ? "partial" : "failed") : "executed";
	lines.push(
		`resolved: ${resolved}/${frozen.incidentKeys.length} incident(s)${ctx.flags.noWait ? " (submitted, not awaited)" : ""}`,
	);
	if (!ctx.flags.noWait) lines.push(`remaining active incidents: ${remainingActive}`);
	lines.push(`outcome: ${outcome}`);
	await emit(outcome);
}

async function repairOne(
	ctx: OpsContext,
	incident: Incident,
	options: RepairOptions,
	blockedScopes: Set<string>,
): Promise<IncidentRepairItem> {
	const item: IncidentRepairItem = {
		incidentKey: incident.incidentKey,
		processInstanceKey: incident.processInstanceKey,
		jobKey: incident.jobKey,
		retriesUpdated: false,
		timeoutUpdated: false,
		resolved: false,
	};
	if (incident.processInstanceKey && blockedScopes.has(incident.processInstanceKey)) {
		item.error = "variable update failed for process-instance scope; incident resolution skipped";
		return item;
	}
	if (incident.jobKey) {
		if (options.retries > 0) {
			await ctx.api.updateJob(incident.jobKey, { retries: options.retries });
			item.retriesUpdated = true;
		}
		if (options.timeoutMs !== undefined) {
			await ctx.api.updateJob(incident.jobKey, { timeout: options.timeoutMs });
			item.timeoutUpdated = true;
		}
	}
	await ctx.api.resolveIncident(incident.incidentKey);
	item.resolved = true;
	return item;
}

async function countRemainingActive(
	ctx: OpsContext,
	processInstanceKeys: string[],
): Promise<number> {
	let total = 0;
	for (const key of processInstanceKeys) {
		const remaining = await ctx.api.incidentsForProcessInstance(key, "ACTIVE");
		total += remaining.length;
	}
	return total;
}

function confirmationPrompt(frozen: RepairFrozenSet): string {
	return `incident repair: ${frozen.incidentKeys.length} active incident(s), ${frozen.processInstanceKeys.length} process instance(s), ${frozen.jobKeys.length} related job(s), ${frozen.variableScopeKeys.length} variable scope(s) will be repaired. Do you want to proceed?`;
}

function asArray(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}
