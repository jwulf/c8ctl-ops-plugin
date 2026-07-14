/**
 * Shared execution context for ops playbooks: runtime flags, the Camunda API
 * façade, progress logging, confirmation prompts, and report emission.
 */
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import type { PluginLogger } from "../runtime.ts";
import { runtime } from "../runtime.ts";
import { C8Api } from "./api.ts";
import { determineWorkers } from "./pool.ts";
import { renderMarkdown } from "./report.ts";
import type { OpsReport } from "./types.ts";

export interface OpsFlags {
	// Discovery / paging
	limit: number; // 0 = uncapped
	batchSize: number;
	// Execution controls
	autoConfirm: boolean;
	automation: boolean;
	force: boolean;
	noWait: boolean;
	workers?: number;
	noWorkerLimit: boolean;
	failFast: boolean;
	// Reporting
	reportFile?: string;
	reportFormat?: "markdown" | "json";
	// Everything else, playbook-specific (already coerced by cli.ts)
	raw: Record<string, unknown>;
}

export class OpsContext {
	readonly api: C8Api;
	readonly logger: PluginLogger;
	readonly flags: OpsFlags;
	readonly dryRun: boolean;
	readonly json: boolean;
	readonly verbose: boolean;
	readonly profile?: string;
	readonly tenantId: string;

	constructor(flags: OpsFlags) {
		const rt = runtime();
		this.flags = flags;
		this.api = new C8Api(rt.createClient(rt.activeProfile));
		this.logger = rt.getLogger();
		this.dryRun = rt.dryRun === true;
		this.json = rt.outputMode === "json";
		this.verbose = rt.verbose === true;
		this.profile = rt.activeProfile;
		this.tenantId = safeTenant(rt);
	}

	/** Human-facing progress line (suppressed in JSON mode). */
	progress(message: string): void {
		if (!this.json) this.logger.info(message);
	}

	/** Whether confirmation is implicitly granted (no prompt needed). */
	get implicitlyConfirmed(): boolean {
		return this.flags.autoConfirm || this.flags.automation;
	}

	/**
	 * Ask the user to confirm a mutation. Returns true when confirmed. In
	 * automation / auto-confirm mode returns true without prompting. In a
	 * non-interactive session without those flags it throws, so unattended runs
	 * fail clearly instead of hanging on a prompt.
	 */
	async confirm(prompt: string): Promise<boolean> {
		if (this.implicitlyConfirmed) return true;
		if (!process.stdin.isTTY) {
			throw new Error(
				`${prompt}\nRefusing to prompt in a non-interactive session. Re-run with --auto-confirm or --automation, or preview with --dry-run.`,
			);
		}
		const rl = createInterface({ input: process.stdin, output: process.stderr });
		try {
			const answer = await new Promise<string>((resolve) => {
				rl.question(`${prompt} [y/N] `, resolve);
			});
			return /^y(es)?$/i.test(answer.trim());
		} finally {
			rl.close();
		}
	}

	/**
	 * Emit the final result: a JSON payload in JSON mode, otherwise a
	 * human-rendered summary. Writes an audit report file when --report-file is
	 * set. `human` renders the text summary lines.
	 */
	async emit(report: OpsReport, human: (report: OpsReport) => string[]): Promise<void> {
		if (this.flags.reportFile) {
			await this.writeReport(report);
		}
		if (this.json) {
			this.logger.json(report);
			return;
		}
		for (const line of human(report)) {
			this.logger.info(line);
		}
		if (this.flags.reportFile) {
			this.logger.info(`report written: ${this.flags.reportFile}`);
		}
	}

	private async writeReport(report: OpsReport): Promise<void> {
		const path = this.flags.reportFile;
		if (!path) return;
		const format = this.flags.reportFormat ?? inferFormat(path);
		const content =
			format === "json" ? `${JSON.stringify(report, null, 2)}\n` : renderMarkdown(report);
		await writeFile(path, content, "utf-8");
	}

	workerCount(itemCount: number): number {
		return determineWorkers(itemCount, this.flags.workers, this.flags.noWorkerLimit);
	}
}

function inferFormat(path: string): "markdown" | "json" {
	return /\.json$/i.test(path) ? "json" : "markdown";
}

function safeTenant(rt: ReturnType<typeof runtime>): string {
	try {
		return rt.resolveTenantId(rt.activeProfile);
	} catch {
		return "<default>";
	}
}
