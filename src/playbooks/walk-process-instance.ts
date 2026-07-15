/** ops walk process-instance — inspect the parent/child relationships of process instances (read-only). */

import type { Incident, ProcessInstance } from "../engine/api.ts";
import type { OpsContext } from "../engine/context.ts";
import { baseReport, finalize } from "../engine/report.ts";
import { keyList, str } from "../engine/util.ts";
import { type WalkMode, type WalkResult, walk } from "../engine/walk.ts";

const SCHEMA = "ops.walk.v1";
const COMMAND = "ops walk process-instance";

interface SeedRender {
	result: WalkResult;
	incidents: Map<string, Incident[]>;
}

export async function run(ctx: OpsContext): Promise<void> {
	const startedAt = Date.now();
	const report = baseReport(ctx, { schemaVersion: SCHEMA, command: COMMAND, startedAt });
	const lines: string[] = [];
	const emit = (outcome: Parameters<typeof finalize>[1]) =>
		ctx.emit(finalize(report, outcome, startedAt), () => lines);

	const seeds = resolveSeeds(ctx);
	if (seeds.length === 0) {
		const message = "walk process-instance requires at least one --key (process-instance key)";
		report.errors.push(message);
		lines.push(message);
		await emit("failed");
		return;
	}

	const mode = resolveMode(ctx);
	const flat = ctx.flags.raw.flat === true;
	const withIncidents = ctx.flags.raw.withIncidents === true;
	report.mode = mode;
	report.render = flat ? "flat" : "tree";
	report.seeds = seeds;

	const renders: SeedRender[] = [];
	const walkSummaries: Record<string, unknown>[] = [];
	let sawWarning = false;

	for (const seedKey of seeds) {
		const result = await walk(ctx.api, seedKey, mode);
		const incidents = withIncidents
			? await collectIncidents(ctx, result)
			: new Map<string, Incident[]>();
		renders.push({ result, incidents });

		if (result.warning) {
			sawWarning = true;
			report.notices.push(`${seedKey}: ${result.warning}`);
		}
		walkSummaries.push({
			seedKey,
			mode,
			rootKey: result.rootKey,
			seedFound: result.seedFound,
			orphaned: result.orphaned,
			...(result.missingAncestor ? { missingAncestor: result.missingAncestor } : {}),
			instanceCount: result.keys.length,
			incidentCount: countIncidents(incidents),
			processInstanceKeys: result.keys,
		});
	}

	report.walks = walkSummaries;

	// Human rendering: one section per seed.
	for (const { result, incidents } of renders) {
		if (renders.length > 1) lines.push(`# ${result.seedKey} (${result.mode})`);
		renderResult(lines, result, incidents, flat);
		if (result.warning) lines.push(`warning: ${result.warning}`);
		if (renders.length > 1) lines.push("");
	}

	await emit(sawWarning ? "partial" : "executed");
}

function resolveSeeds(ctx: OpsContext): string[] {
	const keys = keyList(ctx.flags.raw.key);
	const piKey = str(ctx.flags.raw.piKey);
	if (piKey && !keys.includes(piKey)) keys.push(piKey);
	return keys;
}

function resolveMode(ctx: OpsContext): WalkMode {
	if (ctx.flags.raw.parent === true) return "parent";
	if (ctx.flags.raw.children === true) return "children";
	return "family";
}

async function collectIncidents(
	ctx: OpsContext,
	result: WalkResult,
): Promise<Map<string, Incident[]>> {
	const byKey = new Map<string, Incident[]>();
	for (const key of result.keys) {
		const pi = result.chain.get(key);
		// Skip a definite no-incident instance to save a round-trip; when the flag
		// is unknown (undefined) we still query to be safe.
		if (pi && pi.hasIncident === false) continue;
		const incidents = await ctx.api.incidentsForProcessInstance(key, "ACTIVE");
		if (incidents.length > 0) byKey.set(key, incidents);
	}
	return byKey;
}

function countIncidents(byKey: Map<string, Incident[]>): number {
	let total = 0;
	for (const list of byKey.values()) total += list.length;
	return total;
}

function renderResult(
	lines: string[],
	result: WalkResult,
	incidents: Map<string, Incident[]>,
	flat: boolean,
): void {
	if (result.keys.length === 0) return;

	if (result.mode === "parent") {
		renderChain(lines, result, incidents);
		return;
	}
	if (flat) {
		renderFlat(lines, result, incidents);
		return;
	}
	renderTree(lines, result, incidents);
}

/** Ancestry chain: seed at the bottom, root at the top, joined by up-arrows. */
function renderChain(
	lines: string[],
	result: WalkResult,
	incidents: Map<string, Incident[]>,
): void {
	// keys are seed-first; print root-first so the tree reads top-down.
	const ordered = [...result.keys].reverse();
	ordered.forEach((key, index) => {
		const prefix = index === 0 ? "" : "↑ ";
		lines.push(prefix + oneLine(result, key));
		pushIncidentLines(lines, incidents.get(key), index === 0 ? "  " : "  ");
	});
}

/** Flat list of every instance in breadth-first order. */
function renderFlat(lines: string[], result: WalkResult, incidents: Map<string, Incident[]>): void {
	for (const key of result.keys) {
		lines.push(oneLine(result, key));
		pushIncidentLines(lines, incidents.get(key), "  ");
	}
}

/** ASCII tree rooted at result.rootKey using the parent→children edges. */
function renderTree(lines: string[], result: WalkResult, incidents: Map<string, Incident[]>): void {
	lines.push(oneLine(result, result.rootKey));
	pushIncidentLines(lines, incidents.get(result.rootKey), "  ");
	const descend = (parentKey: string, prefix: string) => {
		const children = result.edges.get(parentKey) ?? [];
		children.forEach((childKey, index) => {
			const last = index === children.length - 1;
			lines.push(`${prefix}${last ? "└─ " : "├─ "}${oneLine(result, childKey)}`);
			pushIncidentLines(lines, incidents.get(childKey), `${prefix}${last ? "   " : "│  "}   `);
			descend(childKey, `${prefix}${last ? "   " : "│  "}`);
		});
	};
	descend(result.rootKey, "");
}

function pushIncidentLines(
	lines: string[],
	incidents: Incident[] | undefined,
	indent: string,
): void {
	if (!incidents || incidents.length === 0) return;
	for (const inc of incidents) {
		const parts = [inc.errorType ?? "INCIDENT"];
		if (inc.elementId) parts.push(`@${inc.elementId}`);
		if (inc.errorMessage) parts.push(`— ${inc.errorMessage}`);
		lines.push(`${indent}! ${parts.join(" ")}`);
	}
}

/** One-line summary of a process instance for human output. */
function oneLine(result: WalkResult, key: string): string {
	const pi = result.chain.get(key);
	if (!pi) return `${key} (not found)`;
	const parts: string[] = [pi.processInstanceKey];
	if (pi.state) parts.push(pi.state);
	if (pi.processDefinitionId) {
		parts.push(
			pi.processDefinitionVersion
				? `${pi.processDefinitionId} v${pi.processDefinitionVersion}`
				: pi.processDefinitionId,
		);
	}
	if (pi.hasIncident) parts.push("⚠");
	const markers: string[] = [];
	if (key === result.seedKey && result.mode === "family" && result.rootKey !== result.seedKey) {
		markers.push("seed");
	}
	if (key === result.missingAncestor && !seedExists(result, key)) markers.push("missing");
	const suffix = markers.length > 0 ? ` (${markers.join(", ")})` : "";
	return parts.join("  ") + suffix;
}

function seedExists(result: WalkResult, key: string): boolean {
	const pi = result.chain.get(key);
	return pi !== undefined && pi.state !== undefined;
}
