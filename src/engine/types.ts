/** Shared workflow vocabulary for the ops engine, mirrored across all playbooks. */

export type StepStatus = "planned" | "confirmed" | "submitted" | "skipped" | "blocked" | "failed";

export type Outcome = "planned" | "executed" | "partial" | "blocked" | "failed";

/**
 * Records whether paged discovery saw the full matching scope or was capped by
 * `--limit`. Every playbook report carries this so humans, JSON, and Markdown
 * consumers can tell a complete run from a user-limited one.
 */
export interface DiscoveryScopeStatus {
	complete: boolean;
	limited: boolean;
	limit: number; // 0 = uncapped
	batchSize: number;
	pages: number;
	candidatesSeen: number;
	candidatesFrozen: number;
}

export interface ReportMeta {
	schemaVersion: string;
	command: string;
	startedAt: string;
	finishedAt: string;
	durationMs: number;
	dryRun: boolean;
	autoConfirm: boolean;
	automation: boolean;
	noWait: boolean;
	force: boolean;
	profile?: string;
	tenantId?: string;
}

export interface OpsReport extends ReportMeta {
	outcome: Outcome;
	errors: string[];
	notices: string[];
	// Playbook-specific sections are attached by each playbook.
	[section: string]: unknown;
}

export function discoveryScope(
	seen: number,
	frozen: number,
	pages: number,
	limit: number,
	batchSize: number,
): DiscoveryScopeStatus {
	const limited = limit > 0 && frozen >= limit && seen >= frozen;
	return {
		complete: !limited,
		limited,
		limit,
		batchSize,
		pages,
		candidatesSeen: seen,
		candidatesFrozen: frozen,
	};
}

export function describeScope(scope: DiscoveryScopeStatus): string {
	if (scope.limited) {
		return `discovery user-limited: limit ${scope.limit}; pages ${scope.pages}; batch size ${scope.batchSize}`;
	}
	return `discovery complete: pages ${scope.pages}; batch size ${scope.batchSize}`;
}
