/** ops purge all-process-definitions — delete process definitions and (with --force) their running instances. */

import type { C8Api, ProcessDefinition, ProcessDefinitionFilter } from "../engine/api.ts";
import { isTerminal } from "../engine/api.ts";
import type { OpsContext } from "../engine/context.ts";
import { discoverAll } from "../engine/discovery.ts";
import { runPool } from "../engine/pool.ts";
import { baseReport, finalize } from "../engine/report.ts";
import { describeScope } from "../engine/types.ts";
import { str, unique } from "../engine/util.ts";

const SCHEMA = "ops.all-process-definitions.v1";
const COMMAND = "ops purge all-process-definitions";

interface DefinitionImpact {
	processDefinitionKey: string;
	processDefinitionId?: string;
	version?: number;
	affectedProcessInstanceCount: number;
	activeProcessInstanceKeys: string[];
}

interface DefinitionDeleteItem {
	processDefinitionKey: string;
	canceledInstances: number;
	deleted: boolean;
	error?: string;
}

export async function run(ctx: OpsContext): Promise<void> {
	const startedAt = Date.now();
	const report = baseReport(ctx, { schemaVersion: SCHEMA, command: COMMAND, startedAt });
	const lines: string[] = [];
	const emit = (outcome: Parameters<typeof finalize>[1]) =>
		ctx.emit(finalize(report, outcome, startedAt), () => lines);

	lines.push(
		ctx.dryRun ? "dry run: purge all-process-definitions" : "purge all-process-definitions",
	);

	const definitions = await discoverDefinitions(ctx);
	const candidateKeys = unique(definitions.items.map((d) => d.processDefinitionKey));
	report.discovery = {
		filters: definitionFilter(ctx),
		latestOnly: ctx.flags.raw.latest === true,
		candidateProcessDefinitionCount: candidateKeys.length,
		scope: definitions.scope,
		candidateProcessDefinitionKeys: candidateKeys,
	};
	lines.push(`process-definition candidates: ${candidateKeys.length}`);
	if (definitions.scope.limited || ctx.verbose) lines.push(describeScope(definitions.scope));

	if (candidateKeys.length === 0) {
		report.deletePlan = { status: "skipped" };
		report.deletion = { status: "skipped" };
		report.notices.push("no process definitions found");
		lines.push("outcome: planned");
		await emit("planned");
		return;
	}

	const impacts = await planImpact(
		ctx.api,
		definitions.items,
		ctx.workerCount(candidateKeys.length),
	);
	const activeCount = impacts.reduce((n, i) => n + i.activeProcessInstanceKeys.length, 0);
	const affectedCount = impacts.reduce((n, i) => n + i.affectedProcessInstanceCount, 0);
	const requiresForce = !ctx.flags.force && activeCount > 0;
	report.deletePlan = {
		status: "planned",
		candidateProcessDefinitionCount: candidateKeys.length,
		activeProcessInstanceCount: activeCount,
		affectedProcessInstanceCount: affectedCount,
		requiresForce,
		items: impacts,
	};
	const verb = ctx.dryRun ? "would be" : "will be";
	lines.push(
		`delete preview: ${candidateKeys.length} process definition(s), ${affectedCount} affected process instance(s) (${activeCount} active) ${verb} deleted`,
	);
	if (activeCount > 0) {
		lines.push(`active process instances: ${activeCount} (use --force to cancel before delete)`);
	}

	if (ctx.dryRun) {
		report.deletion = { status: "skipped" };
		lines.push("outcome: planned");
		await emit("planned");
		return;
	}

	if (requiresForce) {
		const message = `refusing to delete all-process-definitions purge scope: ${activeCount} active process instance(s) are affected; no delete request was submitted; use --force to cancel active process instances before delete`;
		report.deletion = { status: "blocked", errors: [message] };
		report.errors.push(message);
		lines.push(`blocked: ${message}`);
		lines.push("outcome: failed");
		await emit("failed");
		return;
	}

	if (!(await ctx.confirm(confirmationPrompt(candidateKeys.length, activeCount, affectedCount)))) {
		report.deletion = { status: "skipped" };
		report.notices.push("aborted by user");
		lines.push("aborted by user");
		await emit("planned");
		return;
	}

	const items = await executeDelete(ctx, impacts);
	const errors = items.filter((i) => i.error).map((i) => `${i.processDefinitionKey}: ${i.error}`);
	const deleted = items.filter((i) => i.deleted).length;
	report.deletion = {
		status: errors.length > 0 ? "failed" : ctx.flags.noWait ? "submitted" : "confirmed",
		submittedProcessDefinitionKeys: candidateKeys,
		items,
		submitted: items.length > 0,
		confirmed: errors.length === 0 && !ctx.flags.noWait,
		noWait: ctx.flags.noWait,
		errors,
	};
	if (errors.length > 0) report.errors.push(...errors);
	const outcome = errors.length > 0 ? (deleted > 0 ? "partial" : "failed") : "executed";
	lines.push(
		`deleted: ${deleted}/${candidateKeys.length} definition(s)${ctx.flags.noWait ? " (submitted, not awaited)" : ""}`,
	);
	lines.push(`outcome: ${outcome}`);
	await emit(outcome);
}

function definitionFilter(ctx: OpsContext): ProcessDefinitionFilter {
	return {
		...(str(ctx.flags.raw.bpmnProcessId)
			? { processDefinitionId: str(ctx.flags.raw.bpmnProcessId) }
			: {}),
		...(ctx.flags.raw.latest === true ? { isLatestVersion: true } : {}),
	};
}

async function discoverDefinitions(ctx: OpsContext) {
	const key = str(ctx.flags.raw.pdKey);
	if (key) {
		const page = await ctx.api.searchProcessDefinitionsPage({ processDefinitionKey: key }, 1);
		return {
			items: page.items,
			scope: {
				complete: true,
				limited: false,
				limit: ctx.flags.limit,
				batchSize: ctx.flags.batchSize,
				pages: 1,
				candidatesSeen: page.items.length,
				candidatesFrozen: page.items.length,
			},
		};
	}
	return discoverAll(
		(limit, after) => ctx.api.searchProcessDefinitionsPage(definitionFilter(ctx), limit, after),
		{ limit: ctx.flags.limit, batchSize: ctx.flags.batchSize },
	);
}

async function planImpact(
	api: C8Api,
	definitions: readonly ProcessDefinition[],
	workers: number,
): Promise<DefinitionImpact[]> {
	const results = await runPool(definitions, { workers, failFast: false }, async (def) => {
		const instances = await collectInstances(api, def.processDefinitionKey);
		const active = instances
			.filter((pi) => !isTerminal(pi.state))
			.map((pi) => pi.processInstanceKey);
		return {
			processDefinitionKey: def.processDefinitionKey,
			processDefinitionId: def.processDefinitionId,
			version: def.version,
			affectedProcessInstanceCount: instances.length,
			activeProcessInstanceKeys: active,
		} satisfies DefinitionImpact;
	});
	return results.map(
		(r) =>
			r.value ?? {
				processDefinitionKey: r.item.processDefinitionKey,
				affectedProcessInstanceCount: 0,
				activeProcessInstanceKeys: [],
			},
	);
}

async function collectInstances(api: C8Api, processDefinitionKey: string) {
	const result = await discoverAll(
		(limit, after) => api.searchProcessInstancesPage({ processDefinitionKey }, limit, after),
		{ limit: 0, batchSize: 100 },
	);
	return result.items;
}

async function executeDelete(
	ctx: OpsContext,
	impacts: readonly DefinitionImpact[],
): Promise<DefinitionDeleteItem[]> {
	const workers = ctx.workerCount(impacts.length);
	const results = await runPool(
		impacts,
		{ workers, failFast: ctx.flags.failFast },
		async (impact) => {
			const item: DefinitionDeleteItem = {
				processDefinitionKey: impact.processDefinitionKey,
				canceledInstances: 0,
				deleted: false,
			};
			if (ctx.flags.force && impact.activeProcessInstanceKeys.length > 0) {
				for (const key of impact.activeProcessInstanceKeys) {
					await ctx.api.cancelProcessInstance(key);
					item.canceledInstances++;
				}
			}
			await ctx.api.deleteResource(impact.processDefinitionKey);
			item.deleted = true;
			return item;
		},
	);
	return results.map(
		(r) =>
			r.value ?? {
				processDefinitionKey: r.item.processDefinitionKey,
				canceledInstances: 0,
				deleted: false,
				error: r.error?.message,
			},
	);
}

function confirmationPrompt(defs: number, active: number, affected: number): string {
	return `process-definition purge: ${defs} process definition(s), ${affected} affected process instance(s) (${active} active) will be deleted. Do you want to proceed?`;
}
