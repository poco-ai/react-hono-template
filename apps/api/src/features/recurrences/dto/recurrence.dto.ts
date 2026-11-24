import type { RecurrenceCadence } from "@workspace/shared";

/** Recurring issue template. `labelIds` is stored as JSON and always an array. */
export type RecurrenceDto = {
	id: string;
	orgId: string;
	projectId: string;
	title: string;
	description: string | null;
	statusId: string | null;
	priority: number;
	assigneeId: string | null;
	labelIds: string[];
	estimate: number | null;
	cadence: RecurrenceCadence;
	nextRunAt: string;
	/** UTC day-of-month monthly runs anchor to (1-31). */
	anchorDay: number;
	lastRunAt: string | null;
	active: boolean;
	createdById: string | null;
	createdAt: string;
	updatedAt: string;
};
