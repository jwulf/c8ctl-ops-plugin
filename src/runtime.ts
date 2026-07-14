/**
 * Typed access to the c8ctl plugin runtime that the host injects on
 * `globalThis.c8ctl`. See c8ctl PLUGIN-HELP.md.
 *
 * The host consumes and owns a fixed set of global flags before the plugin
 * handler runs: `help, version, profile, dry-run, verbose, fields, json, yes`
 * (short aliases `-h, -v, -y`). Those never arrive as plugin-declared flags —
 * we read the ones we care about (`dry-run`, `json`, `verbose`, `profile`)
 * from the runtime here.
 */
import type { CamundaClient, CamundaOptions } from "@camunda8/orchestration-cluster-api";

export type OutputMode = "text" | "json";

export interface PluginLogger {
	info(message: string): void;
	warn(message: string): void;
	error(message: string): void;
	success(message: string): void;
	json(payload: unknown): void;
	readonly mode?: OutputMode;
}

export interface C8ctlPluginRuntime {
	readonly version: string;
	readonly platform: string;
	activeProfile?: string;
	activeTenant?: string;
	outputMode: OutputMode;
	dryRun?: boolean;
	verbose?: boolean;
	createClient(profileFlag?: string, additionalSdkConfig?: Partial<CamundaOptions>): CamundaClient;
	resolveTenantId(profileFlag?: string): string;
	getLogger(mode?: OutputMode): PluginLogger;
}

export function runtime(): C8ctlPluginRuntime {
	const rt = globalThis.c8ctl;
	if (!rt) {
		throw new Error(
			"c8ctl runtime is not available. This plugin must be run through the c8ctl CLI.",
		);
	}
	// The host guarantees the shape; treat it as the runtime contract above.
	return rt as unknown as C8ctlPluginRuntime;
}

declare global {
	// eslint-disable-next-line no-var
	var c8ctl: unknown;
}
