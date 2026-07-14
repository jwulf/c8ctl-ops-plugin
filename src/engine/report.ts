/** Report envelope construction and Markdown rendering shared by all playbooks. */

import type { OpsContext } from "./context.ts";
import type { OpsReport, Outcome } from "./types.ts";
import { isRecord } from "./util.ts";

/** Build the common report envelope from context + timing. */
export function baseReport(
	ctx: OpsContext,
	{
		schemaVersion,
		command,
		startedAt,
	}: { schemaVersion: string; command: string; startedAt: number },
): OpsReport {
	const now = Date.now();
	return {
		schemaVersion,
		command,
		startedAt: new Date(startedAt).toISOString(),
		finishedAt: new Date(now).toISOString(),
		durationMs: now - startedAt,
		dryRun: ctx.dryRun,
		autoConfirm: ctx.flags.autoConfirm,
		automation: ctx.flags.automation,
		noWait: ctx.flags.noWait,
		force: ctx.flags.force,
		profile: ctx.profile,
		tenantId: ctx.tenantId,
		outcome: "planned",
		errors: [],
		notices: [],
	};
}

export function finalize(report: OpsReport, outcome: Outcome, startedAt: number): OpsReport {
	const now = Date.now();
	report.outcome = outcome;
	report.finishedAt = new Date(now).toISOString();
	report.durationMs = now - startedAt;
	return report;
}

const META_KEYS = [
	"command",
	"outcome",
	"dryRun",
	"schemaVersion",
	"startedAt",
	"finishedAt",
	"durationMs",
	"profile",
	"tenantId",
	"autoConfirm",
	"automation",
	"noWait",
	"force",
];

/** Render a report as a deterministic Markdown audit document. */
export function renderMarkdown(report: OpsReport): string {
	const lines: string[] = [];
	lines.push(`# ${title(report.command)}`);
	lines.push("");
	lines.push("## Run");
	lines.push("");
	lines.push("| Field | Value |");
	lines.push("| --- | --- |");
	for (const key of META_KEYS) {
		const value = report[key];
		if (value === undefined) continue;
		lines.push(`| ${key} | ${inline(value)} |`);
	}
	lines.push("");

	for (const [key, value] of Object.entries(report)) {
		if (META_KEYS.includes(key)) continue;
		if (key === "errors" || key === "notices") continue;
		if (value === undefined) continue;
		lines.push(`## ${humanize(key)}`);
		lines.push("");
		renderSection(lines, value);
		lines.push("");
	}

	renderList(lines, "Notices", report.notices);
	renderList(lines, "Errors", report.errors);

	return `${lines
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trimEnd()}\n`;
}

function renderList(lines: string[], heading: string, value: unknown): void {
	if (!Array.isArray(value) || value.length === 0) return;
	lines.push(`## ${heading}`);
	lines.push("");
	for (const item of value) lines.push(`- ${inline(item)}`);
	lines.push("");
}

function renderSection(lines: string[], value: unknown): void {
	if (Array.isArray(value)) {
		if (value.length === 0) {
			lines.push("_none_");
			return;
		}
		if (value.every((v) => !isRecord(v))) {
			for (const item of value) lines.push(`- ${inline(item)}`);
			return;
		}
		renderTable(lines, value.filter(isRecord));
		return;
	}
	if (isRecord(value)) {
		lines.push("| Field | Value |");
		lines.push("| --- | --- |");
		for (const [k, v] of Object.entries(value)) {
			if (v === undefined) continue;
			lines.push(`| ${humanize(k)} | ${inline(v)} |`);
		}
		return;
	}
	lines.push(inline(value));
}

function renderTable(lines: string[], rows: Record<string, unknown>[]): void {
	const columns: string[] = [];
	for (const row of rows) {
		for (const key of Object.keys(row)) {
			if (!columns.includes(key)) columns.push(key);
		}
	}
	if (columns.length === 0) {
		lines.push("_none_");
		return;
	}
	lines.push(`| ${columns.join(" | ")} |`);
	lines.push(`| ${columns.map(() => "---").join(" | ")} |`);
	for (const row of rows) {
		lines.push(`| ${columns.map((c) => inline(row[c])).join(" | ")} |`);
	}
}

function inline(value: unknown): string {
	if (value === undefined || value === null) return "";
	if (Array.isArray(value)) {
		if (value.length === 0) return "_none_";
		return value.map((v) => inline(v)).join(", ");
	}
	if (isRecord(value)) return JSON.stringify(value);
	return String(value).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function humanize(key: string): string {
	return key
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.replace(/[_-]/g, " ")
		.replace(/^\w/, (c) => c.toUpperCase());
}

function title(command: string): string {
	return `${command} — audit report`;
}
