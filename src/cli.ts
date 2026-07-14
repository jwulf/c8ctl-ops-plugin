/**
 * Flag coercion and playbook routing for the single `ops` plugin command.
 *
 * c8ctl delivers plugin flags keyed by their declared (kebab-case) names and
 * owns the global flags (dry-run, json, verbose, profile) via the runtime. Here
 * we normalise the declared flags into the strongly-typed {@link OpsFlags} the
 * engine consumes and dispatch `verb resource` to the matching playbook.
 */

import { OpsContext, type OpsFlags } from "./engine/context.ts";
import { num, str } from "./engine/util.ts";
import { run as purgeDefinitions } from "./playbooks/purge-definitions.ts";
import { run as purgeIncidents } from "./playbooks/purge-incidents.ts";
import { run as purgeOrphan } from "./playbooks/purge-orphan.ts";
import { run as repairIncident } from "./playbooks/repair-incident.ts";
import { run as repairProcessInstance } from "./playbooks/repair-process-instance.ts";
import { run as retentionPolicy } from "./playbooks/retention-policy.ts";
import { run as smokeTest } from "./playbooks/smoke-test.ts";

type Playbook = (ctx: OpsContext) => Promise<void>;

/** Canonical `verb/resource` routes plus convenient aliases. */
const ROUTES: Record<string, Playbook> = {
	"execute/smoke-test": smokeTest,
	"execute/retention-policy": retentionPolicy,
	"purge/orphan-process-instances": purgeOrphan,
	"purge/process-instances-with-incidents": purgeIncidents,
	"purge/all-process-definitions": purgeDefinitions,
	"repair/incident": repairIncident,
	"repair/process-instance": repairProcessInstance,
};

const ALIASES: Record<string, string> = {
	"smoke-test": "execute/smoke-test",
	smoketest: "execute/smoke-test",
	"retention-policy": "execute/retention-policy",
	retention: "execute/retention-policy",
	"orphan-process-instances": "purge/orphan-process-instances",
	orphans: "purge/orphan-process-instances",
	"process-instances-with-incidents": "purge/process-instances-with-incidents",
	incidents: "purge/process-instances-with-incidents",
	"all-process-definitions": "purge/all-process-definitions",
	definitions: "purge/all-process-definitions",
	"repair-incident": "repair/incident",
	"repair-process-instance": "repair/process-instance",
};

export function listRoutes(): string[] {
	return Object.keys(ROUTES);
}

/** Resolve a playbook from the positional args (`verb resource` or an alias). */
export function resolvePlaybook(args: readonly string[]): { key: string; run: Playbook } {
	const [verb, resource] = args;
	if (!verb) {
		throw usageError();
	}
	const aliasKey = ALIASES[verb];
	const aliasRun = aliasKey ? ROUTES[aliasKey] : undefined;
	if (aliasKey && aliasRun && (!resource || !ROUTES[`${verb}/${resource}`])) {
		return { key: aliasKey, run: aliasRun };
	}
	const key = resource ? `${verb}/${resource}` : "";
	const run = ROUTES[key];
	if (!run) {
		throw usageError(verb, resource);
	}
	return { key, run };
}

function usageError(verb?: string, resource?: string): Error {
	const attempted = [verb, resource].filter(Boolean).join(" ");
	const known = listRoutes()
		.map((k) => `ops ${k.replace("/", " ")}`)
		.join("\n  ");
	const prefix = attempted ? `unknown ops command: ${attempted}\n\n` : "missing ops command\n\n";
	return new Error(`${prefix}Available commands:\n  ${known}`);
}

function bool(value: unknown): boolean {
	return value === true;
}

function int(value: unknown, fallback: number): number {
	const n = num(value);
	return n === undefined ? fallback : Math.trunc(n);
}

function intOrUndefined(value: unknown): number | undefined {
	const n = num(value);
	return n === undefined ? undefined : Math.trunc(n);
}

/** Coerce host-delivered flag values into typed {@link OpsFlags}. */
export function coerceFlags(flags: Record<string, unknown> = {}): OpsFlags {
	const reportFormat = str(flags["report-format"]);
	return {
		limit: Math.max(0, int(flags.limit, 0)),
		batchSize: Math.max(1, int(flags["batch-size"], 100)),
		autoConfirm: bool(flags["auto-confirm"]),
		automation: bool(flags.automation),
		force: bool(flags.force),
		noWait: bool(flags["no-wait"]),
		workers: intOrUndefined(flags.workers),
		noWorkerLimit: bool(flags["no-worker-limit"]),
		failFast: bool(flags["fail-fast"]),
		reportFile: str(flags["report-file"]),
		reportFormat:
			reportFormat === "json" ? "json" : reportFormat === "markdown" ? "markdown" : undefined,
		raw: {
			retentionDays: intOrUndefined(flags["retention-days"]),
			state: str(flags.state),
			incidentState: str(flags["incident-state"]),
			bpmnProcessId: str(flags["bpmn-process-id"]),
			pdKey: str(flags["pd-key"]),
			piKey: str(flags["pi-key"]),
			parentKey: str(flags["parent-key"]),
			errorType: str(flags["error-type"]),
			elementId: str(flags["element-id"]),
			latest: bool(flags.latest),
			key: str(flags.key),
			retries: intOrUndefined(flags.retries),
			jobTimeoutMs: intOrUndefined(flags["job-timeout-ms"]),
			vars: str(flags.vars),
			count: intOrUndefined(flags.count),
			noCleanup: bool(flags["no-cleanup"]),
		},
	};
}

/** Entry point invoked by the exported command handler. */
export async function dispatch(
	args: readonly string[],
	flags?: Record<string, unknown>,
): Promise<void> {
	const { run } = resolvePlaybook(args);
	const ctx = new OpsContext(coerceFlags(flags));
	await run(ctx);
}
