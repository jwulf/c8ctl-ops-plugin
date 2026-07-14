/**
 * Typed façade over the Camunda 8 Orchestration Cluster SDK client.
 *
 * The generated SDK types are intentionally very precise; to keep the ops
 * engine readable and fully typed against our own small domain model we adapt
 * the client through a single structural boundary here. Every Camunda call the
 * plugin makes lives in this file, so paging, eventual-consistency handling,
 * and response normalisation are defined exactly once.
 */
import type { CamundaClient } from "@camunda8/orchestration-cluster-api";
import { asRecord, num, str } from "./util.ts";

const NO_WAIT_CONSISTENCY = { consistency: { waitUpToMs: 0 } };

type Json = Record<string, unknown>;
type SearchFn = (input: Json, consistency: unknown) => Promise<unknown>;
type MutateFn = (input: Json) => Promise<unknown>;

interface Sdk {
	searchProcessInstances: SearchFn;
	searchIncidents: SearchFn;
	searchProcessDefinitions: SearchFn;
	getProcessInstance(input: Json, consistency: unknown): Promise<unknown>;
	cancelProcessInstance: MutateFn;
	deleteProcessInstance: MutateFn;
	resolveIncident: MutateFn;
	updateJob: MutateFn;
	createElementInstanceVariables: MutateFn;
	createProcessInstance: MutateFn;
	deployResourcesFromFiles?: (files: string[]) => Promise<unknown>;
	createDeployment: (input: { resources: unknown[] }) => Promise<unknown>;
	deleteResource: MutateFn;
	getTopology(): Promise<unknown>;
}

export type PiState = "ACTIVE" | "COMPLETED" | "TERMINATED";

export interface ProcessInstance {
	processInstanceKey: string;
	processDefinitionKey?: string;
	processDefinitionId?: string; // BPMN process id
	processDefinitionVersion?: number;
	state?: string;
	parentProcessInstanceKey?: string;
	startDate?: string;
	endDate?: string;
	hasIncident?: boolean;
	tenantId?: string;
}

export interface Incident {
	incidentKey: string;
	processInstanceKey?: string;
	processDefinitionKey?: string;
	processDefinitionId?: string;
	errorType?: string;
	errorMessage?: string;
	state?: string;
	jobKey?: string;
	elementId?: string;
	elementInstanceKey?: string;
	creationTime?: string;
	tenantId?: string;
}

export interface ProcessDefinition {
	processDefinitionKey: string;
	processDefinitionId?: string;
	name?: string;
	version?: number;
	versionTag?: string;
	resourceName?: string;
	tenantId?: string;
}

export interface Page<T> {
	items: T[];
	endCursor?: string;
	totalItems: number;
	hasMore: boolean;
}

export interface ProcessInstanceFilter {
	processInstanceKey?: string;
	processDefinitionKey?: string;
	processDefinitionId?: string;
	processDefinitionVersion?: number;
	state?: string;
	parentProcessInstanceKey?: string | Record<string, unknown>;
	hasIncident?: boolean;
	tenantId?: string;
	endDate?: Json;
	startDate?: Json;
}

export interface IncidentFilter {
	state?: string;
	errorType?: string;
	errorMessage?: string;
	processDefinitionId?: string;
	processDefinitionKey?: string;
	processInstanceKey?: string;
	elementId?: string;
	elementInstanceKey?: string;
	incidentKey?: string;
	tenantId?: string;
	creationTime?: Json;
}

export interface ProcessDefinitionFilter {
	processDefinitionKey?: string;
	processDefinitionId?: string;
	version?: number;
	versionTag?: string;
	isLatestVersion?: boolean;
	tenantId?: string;
}

function pageOf<T>(raw: unknown, map: (r: Json) => T): Page<T> {
	const rec = asRecord(raw);
	const rawItems = Array.isArray(rec.items) ? rec.items : [];
	const items = rawItems.map((it) => map(asRecord(it)));
	const pageMeta = asRecord(rec.page);
	const endCursor = str(pageMeta.endCursor);
	const totalItems = num(pageMeta.totalItems) ?? items.length;
	const hasMore = pageMeta.hasMoreTotalItems === true;
	return { items, endCursor, totalItems, hasMore };
}

function mapProcessInstance(r: Json): ProcessInstance {
	return {
		processInstanceKey: str(r.processInstanceKey) ?? "",
		processDefinitionKey: str(r.processDefinitionKey),
		processDefinitionId: str(r.processDefinitionId),
		processDefinitionVersion: num(r.processDefinitionVersion),
		state: str(r.state),
		parentProcessInstanceKey: str(r.parentProcessInstanceKey),
		startDate: str(r.startDate),
		endDate: str(r.endDate),
		hasIncident: r.hasIncident === true,
		tenantId: str(r.tenantId),
	};
}

function mapIncident(r: Json): Incident {
	return {
		incidentKey: str(r.incidentKey) ?? "",
		processInstanceKey: str(r.processInstanceKey),
		processDefinitionKey: str(r.processDefinitionKey),
		processDefinitionId: str(r.processDefinitionId),
		errorType: str(r.errorType),
		errorMessage: str(r.errorMessage),
		state: str(r.state),
		jobKey: str(r.jobKey),
		elementId: str(r.elementId),
		elementInstanceKey: str(r.elementInstanceKey),
		creationTime: str(r.creationTime),
		tenantId: str(r.tenantId),
	};
}

function mapProcessDefinition(r: Json): ProcessDefinition {
	return {
		processDefinitionKey: str(r.processDefinitionKey) ?? "",
		processDefinitionId: str(r.processDefinitionId),
		name: str(r.name),
		version: num(r.version),
		versionTag: str(r.versionTag),
		resourceName: str(r.resourceName),
		tenantId: str(r.tenantId),
	};
}

function pruneFilter(filter: Json): Json {
	const out: Json = {};
	for (const [k, v] of Object.entries(filter)) {
		if (v !== undefined) out[k] = v;
	}
	return out;
}

export class C8Api {
	private readonly sdk: Sdk;

	constructor(client: CamundaClient) {
		// Single structural boundary: adapt the precise generated client to the
		// small surface the ops engine actually uses.
		this.sdk = client as unknown as Sdk;
	}

	async getTopology(): Promise<Json> {
		return asRecord(await this.sdk.getTopology());
	}

	async searchProcessInstancesPage(
		filter: ProcessInstanceFilter,
		limit: number,
		after?: string,
	): Promise<Page<ProcessInstance>> {
		const input: Json = {
			filter: pruneFilter({ ...filter }),
			page: { limit, ...(after ? { after } : {}) },
		};
		return pageOf(
			await this.sdk.searchProcessInstances(input, NO_WAIT_CONSISTENCY),
			mapProcessInstance,
		);
	}

	async searchIncidentsPage(
		filter: IncidentFilter,
		limit: number,
		after?: string,
	): Promise<Page<Incident>> {
		const input: Json = {
			filter: pruneFilter({ ...filter }),
			page: { limit, ...(after ? { after } : {}) },
		};
		return pageOf(await this.sdk.searchIncidents(input, NO_WAIT_CONSISTENCY), mapIncident);
	}

	async searchProcessDefinitionsPage(
		filter: ProcessDefinitionFilter,
		limit: number,
		after?: string,
	): Promise<Page<ProcessDefinition>> {
		const input: Json = {
			filter: pruneFilter({ ...filter }),
			page: { limit, ...(after ? { after } : {}) },
		};
		return pageOf(
			await this.sdk.searchProcessDefinitions(input, NO_WAIT_CONSISTENCY),
			mapProcessDefinition,
		);
	}

	async getProcessInstance(key: string): Promise<ProcessInstance | undefined> {
		try {
			const raw = await this.sdk.getProcessInstance(
				{ processInstanceKey: key },
				NO_WAIT_CONSISTENCY,
			);
			return mapProcessInstance(asRecord(raw));
		} catch (err) {
			if (isNotFound(err)) return undefined;
			throw err;
		}
	}

	/** Direct children of a process instance (via parent-key search). */
	async childrenOf(key: string): Promise<ProcessInstance[]> {
		const out: ProcessInstance[] = [];
		let after: string | undefined;
		do {
			const page = await this.searchProcessInstancesPage(
				{ parentProcessInstanceKey: key },
				100,
				after,
			);
			out.push(...page.items);
			after = page.hasMore ? page.endCursor : undefined;
		} while (after);
		return out;
	}

	async incidentsForProcessInstance(key: string, state?: string): Promise<Incident[]> {
		const out: Incident[] = [];
		let after: string | undefined;
		do {
			const page = await this.searchIncidentsPage(
				{ processInstanceKey: key, ...(state ? { state } : {}) },
				100,
				after,
			);
			out.push(...page.items);
			after = page.hasMore ? page.endCursor : undefined;
		} while (after);
		return out;
	}

	cancelProcessInstance(key: string): Promise<unknown> {
		return this.sdk.cancelProcessInstance({ processInstanceKey: key });
	}

	deleteProcessInstance(key: string): Promise<unknown> {
		return this.sdk.deleteProcessInstance({ processInstanceKey: key });
	}

	resolveIncident(key: string): Promise<unknown> {
		return this.sdk.resolveIncident({ incidentKey: key });
	}

	updateJob(jobKey: string, changeset: { retries?: number; timeout?: number }): Promise<unknown> {
		return this.sdk.updateJob({ jobKey, changeset });
	}

	setProcessInstanceVariables(processInstanceKey: string, variables: Json): Promise<unknown> {
		// Setting variables at the process-instance (root element) scope.
		return this.sdk.createElementInstanceVariables({
			elementInstanceKey: processInstanceKey,
			variables,
		});
	}

	async createProcessInstance(input: Json): Promise<ProcessInstance> {
		const raw = asRecord(await this.sdk.createProcessInstance(input));
		return mapProcessInstance(raw);
	}

	async deployResource(
		name: string,
		xml: string,
	): Promise<{ processDefinitionKey?: string; processDefinitionId?: string; raw: Json }> {
		const file = new File([xml], name, { type: "text/xml" });
		const raw = asRecord(await this.sdk.createDeployment({ resources: [file] }));
		const deployments = Array.isArray(raw.deployments) ? raw.deployments : [];
		for (const entry of deployments) {
			const rec = asRecord(entry);
			const pd = asRecord(rec.processDefinition ?? rec);
			const key = str(pd.processDefinitionKey);
			if (key) {
				return { processDefinitionKey: key, processDefinitionId: str(pd.processDefinitionId), raw };
			}
		}
		return { raw };
	}

	deleteResource(resourceKey: string): Promise<unknown> {
		return this.sdk.deleteResource({ resourceKey });
	}
}

export function isNotFound(err: unknown): boolean {
	const rec = asRecord(err);
	const status = num(rec.status) ?? num(rec.statusCode) ?? num(asRecord(rec.response).status);
	if (status === 404) return true;
	const message = err instanceof Error ? err.message : (str(rec.message) ?? "");
	return /\b404\b|not found/i.test(message);
}

export function isTerminal(state: string | undefined): boolean {
	return state === "COMPLETED" || state === "TERMINATED";
}
