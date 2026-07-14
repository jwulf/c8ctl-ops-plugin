/** Shared delete-execution step for the family-scope purge/retention playbooks. */

import type { OpsContext } from "./context.ts";
import { type DeleteReport, type FamilyDeletePlan, executeFamilyDelete } from "./family.ts";
import type { StepStatus } from "./types.ts";

export interface DeletionResult {
	status: StepStatus;
	submittedRootKeys: string[];
	items: DeleteReport[];
	submitted: boolean;
	confirmed: boolean;
	noWait: boolean;
	errors: string[];
}

export function blockedByNonFinal(plan: FamilyDeletePlan, force: boolean): boolean {
	return plan.requiresCancelBeforeDelete && !force;
}

export function blockedMessage(plan: FamilyDeletePlan): string {
	return `refusing to delete process-instance scope: ${plan.nonFinalAffectedKeys.length} non-final affected process instance(s); no delete request was submitted; use --force to cancel the non-final affected scope before delete`;
}

/** Run the delete step for a resolved family plan and summarise the outcome. */
export async function runDelete(ctx: OpsContext, plan: FamilyDeletePlan): Promise<DeletionResult> {
	const workers = ctx.workerCount(plan.resolvedRootKeys.length);
	const items = await executeFamilyDelete(ctx.api, plan, {
		workers,
		failFast: ctx.flags.failFast,
		force: ctx.flags.force,
	});
	const errors = items.filter((i) => i.error).map((i) => `${i.rootKey}: ${i.error}`);
	const hadError = errors.length > 0;
	const confirmed = !hadError && !ctx.flags.noWait && items.every((i) => i.deleted);
	let status: StepStatus;
	if (hadError) status = "failed";
	else if (ctx.flags.noWait) status = "submitted";
	else status = "confirmed";
	return {
		status,
		submittedRootKeys: plan.resolvedRootKeys,
		items,
		submitted: items.length > 0,
		confirmed,
		noWait: ctx.flags.noWait,
		errors,
	};
}
