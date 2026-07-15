/**
 * c8ctl ops plugin entry point.
 *
 * Exposes a single passthrough `ops` command that routes to the ops playbooks
 * (smoke-test, retention-policy, orphan/incident/definition purges, incident
 * and process-instance repair). Global flags (--dry-run, --json, --verbose,
 * --profile) are owned by c8ctl and read from the runtime; every flag declared
 * here is plugin-specific.
 */

import { dispatch } from "./cli.ts";
import { runtime } from "./runtime.ts";

interface FlagDef {
	type: "string" | "boolean";
	description: string;
	short?: string;
}

const flags: Record<string, FlagDef> = {
	// Discovery / paging
	limit: { type: "string", description: "Cap the frozen candidate scope (0 = uncapped)" },
	"batch-size": { type: "string", description: "Search page size during discovery", short: "b" },
	// Execution controls
	"auto-confirm": { type: "boolean", description: "Skip the confirmation prompt for mutations" },
	automation: { type: "boolean", description: "Non-interactive mode: proceed without prompting" },
	force: { type: "boolean", description: "Cancel non-final/active instances before deleting" },
	"no-wait": {
		type: "boolean",
		description: "Return once mutations are accepted, without confirming completion",
	},
	workers: {
		type: "string",
		description: "Max concurrent workers (default: min(count, 2*cpus, 32))",
		short: "w",
	},
	"no-worker-limit": {
		type: "boolean",
		description: "Use one worker per item when --workers is unset",
	},
	"fail-fast": { type: "boolean", description: "Stop scheduling work after the first error" },
	// Reporting
	"report-file": { type: "string", description: "Write an audit report to the given path" },
	"report-format": {
		type: "string",
		description: "Audit report format: markdown or json (default inferred from extension)",
	},
	// Selection / filters (playbook-specific)
	"retention-days": {
		type: "string",
		description: "retention-policy: delete finished instances at least N days old",
	},
	state: {
		type: "string",
		description: "Process-instance or incident state filter (default per playbook)",
		short: "s",
	},
	"incident-state": {
		type: "string",
		description: "Incident state filter for repair/purge-by-incident (default active)",
	},
	"bpmn-process-id": { type: "string", description: "Filter by BPMN process id" },
	"pd-key": { type: "string", description: "Filter by process-definition key" },
	"pi-key": { type: "string", description: "Filter by process-instance key" },
	"parent-key": { type: "string", description: "Filter by parent process-instance key" },
	"error-type": { type: "string", description: "Filter incidents by error type" },
	"element-id": { type: "string", description: "Filter incidents by BPMN element id" },
	latest: {
		type: "boolean",
		description: "purge definitions: only the latest version of each definition",
	},
	key: {
		type: "string",
		description: "Explicit key(s) to target, comma-separated (incident or process-instance)",
		short: "k",
	},
	retries: {
		type: "string",
		description: "repair: job retries to set (default 1; 0 skips the retry update)",
	},
	"job-timeout-ms": { type: "string", description: "repair: job timeout to set, in milliseconds" },
	vars: {
		type: "string",
		description: "repair: JSON object of variables to set once per process-instance scope",
	},
	count: {
		type: "string",
		description: "smoke-test: number of process instances to start (default 1)",
		short: "n",
	},
	"no-cleanup": {
		type: "boolean",
		description: "smoke-test: retain deployed/created resources instead of deleting them",
	},
	// Walk (read-only relationship inspection)
	parent: {
		type: "boolean",
		description: "walk: show the ancestry chain from the key up to its root",
	},
	children: {
		type: "boolean",
		description: "walk: show the key and all of its descendants",
	},
	flat: {
		type: "boolean",
		description: "walk: render the family as a flat list instead of an ASCII tree",
	},
	"with-incidents": {
		type: "boolean",
		description: "walk: annotate rows with their active incidents",
	},
};

async function handler(args: string[], commandFlags?: Record<string, unknown>): Promise<void> {
	try {
		await dispatch(args, commandFlags);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		try {
			runtime().getLogger().error(message);
		} catch {
			console.error(message);
		}
		process.exitCode = 1;
	}
}

export const commands = {
	ops: { flags, handler },
};

export const metadata = {
	name: "c8ctl-ops-plugin",
	commands: {
		ops: {
			description:
				"High-level Camunda 8 operations playbooks (smoke-test, retention, purge, repair, walk)",
			examples: [
				{
					command: "c8ctl ops execute smoke-test --dry-run",
					description: "Preview an end-to-end connectivity smoke test",
				},
				{
					command: "c8ctl ops execute smoke-test -n 5 --auto-confirm",
					description: "Deploy a fixture, start 5 instances, walk families, then clean up",
				},
				{
					command: "c8ctl ops execute retention-policy --retention-days 30 --dry-run",
					description: "Preview deletion of finished instances older than 30 days",
				},
				{
					command: "c8ctl ops purge orphan-process-instances --dry-run",
					description: "Find orphan child instances whose parent is gone",
				},
				{
					command: "c8ctl ops purge process-instances-with-incidents --force --auto-confirm",
					description: "Delete instance families that have incidents",
				},
				{
					command: "c8ctl ops purge all-process-definitions --latest --dry-run",
					description: "Preview deletion of the latest process definitions and their impact",
				},
				{
					command: "c8ctl ops repair incident --error-type IO_MAPPING_ERROR --retries 3",
					description: "Resolve matching incidents, bumping job retries to 3",
				},
				{
					command:
						"c8ctl ops repair process-instance --key 2251799813685249 --vars '{\"ok\":true}'",
					description: "Set variables then resolve incidents for a process instance",
				},
				{
					command: "c8ctl ops walk process-instance --key 2251799813685249",
					description: "Show the full process-instance family as an ASCII tree",
				},
				{
					command: "c8ctl ops walk process-instance --key 2251799813685249 --parent",
					description: "Show the ancestry chain from a key up to its root",
				},
				{
					command:
						"c8ctl ops walk process-instance --key 2251799813685249 --children --with-incidents",
					description: "List descendants of a key, annotated with active incidents",
				},
			],
		},
	},
};
