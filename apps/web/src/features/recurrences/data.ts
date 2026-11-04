import type { RecurrenceDto } from "@api/dto/recurrence.dto";
import {
	type QueryClient,
	queryOptions,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import {
	type CreateRecurrenceInput,
	RECURRENCE_CADENCES,
	type RecurrenceCadence,
	type UpdateRecurrenceInput,
} from "@workspace/shared";
import { projectsRootKey } from "@/features/projects/data";
import { roadmapRootKey } from "@/features/roadmap/data";
import { client, unwrap } from "@/lib/api";
import type { MutationCallbacks } from "@/lib/mutation-callbacks";

export type { RecurrenceDto };

export const CADENCE_OPTIONS: readonly RecurrenceCadence[] =
	RECURRENCE_CADENCES;

/** Owner i18n key for a cadence label. */
export const cadenceLabelKey = (cadence: RecurrenceCadence) =>
	`recurrences.cadence.${cadence}` as const;

export const recurrencesKey = (orgId: string, projectId: string) =>
	["orgs", orgId, "projects", projectId, "recurrences"] as const;

/** Prefix covering every filtered/paginated issue list of one project. */
const projectIssuesRootKey = (orgId: string, projectId: string) =>
	["orgs", orgId, "projects", projectId, "issues"] as const;

export function recurrencesQuery(orgId: string, projectId: string) {
	return queryOptions({
		queryKey: recurrencesKey(orgId, projectId),
		queryFn: (): Promise<RecurrenceDto[]> =>
			unwrap(
				client.api.orgs[":orgId"].projects[":projectId"].recurrences.$get({
					param: { orgId, projectId },
				}),
			),
	});
}

export const createRecurrence = (
	orgId: string,
	projectId: string,
	input: CreateRecurrenceInput,
) =>
	unwrap(
		client.api.orgs[":orgId"].projects[":projectId"].recurrences.$post({
			param: { orgId, projectId },
			json: input,
		}),
	);

export const updateRecurrence = (
	orgId: string,
	projectId: string,
	{
		recurrenceId,
		input,
	}: { recurrenceId: string; input: UpdateRecurrenceInput },
) =>
	unwrap(
		client.api.orgs[":orgId"].projects[":projectId"].recurrences[
			":recurrenceId"
		].$patch({
			param: { orgId, projectId, recurrenceId },
			json: input,
		}),
	);

export const deleteRecurrence = (
	orgId: string,
	projectId: string,
	recurrenceId: string,
) =>
	unwrap(
		client.api.orgs[":orgId"].projects[":projectId"].recurrences[
			":recurrenceId"
		].$delete({ param: { orgId, projectId, recurrenceId } }),
	);

/**
 * Writes refresh the recurrence list plus the issue lists and project
 * statistics, because a recurrence represents issues that will appear in both.
 */
export const invalidateRecurrenceQueries = (
	queryClient: QueryClient,
	orgId: string,
	projectId: string,
) =>
	Promise.all([
		queryClient.invalidateQueries({
			queryKey: recurrencesKey(orgId, projectId),
		}),
		queryClient.invalidateQueries({
			queryKey: projectIssuesRootKey(orgId, projectId),
		}),
		queryClient.invalidateQueries({ queryKey: projectsRootKey(orgId) }),
		// Scheduled issues land on the roadmap once they materialize.
		queryClient.invalidateQueries({ queryKey: roadmapRootKey(orgId) }),
	]);

export function useCreateRecurrence(
	orgId: string,
	projectId: string,
	callbacks?: MutationCallbacks<RecurrenceDto, CreateRecurrenceInput>,
) {
	const queryClient = useQueryClient();
	return useMutation({
		...callbacks,
		mutationFn: (input: CreateRecurrenceInput) =>
			createRecurrence(orgId, projectId, input),
		onSuccess: (...args) => {
			void invalidateRecurrenceQueries(queryClient, orgId, projectId);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export function useUpdateRecurrence(
	orgId: string,
	projectId: string,
	callbacks?: MutationCallbacks<
		RecurrenceDto,
		{ recurrenceId: string; input: UpdateRecurrenceInput }
	>,
) {
	const queryClient = useQueryClient();
	return useMutation({
		...callbacks,
		mutationFn: (input: {
			recurrenceId: string;
			input: UpdateRecurrenceInput;
		}) => updateRecurrence(orgId, projectId, input),
		onSuccess: (...args) => {
			void invalidateRecurrenceQueries(queryClient, orgId, projectId);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export function useDeleteRecurrence(
	orgId: string,
	projectId: string,
	callbacks?: MutationCallbacks<{ deleted: boolean }, string>,
) {
	const queryClient = useQueryClient();
	return useMutation({
		...callbacks,
		mutationFn: (recurrenceId: string) =>
			deleteRecurrence(orgId, projectId, recurrenceId),
		onSuccess: (...args) => {
			void invalidateRecurrenceQueries(queryClient, orgId, projectId);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

const dateInputValue = (date: Date) => {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
};

/** Default first run: tomorrow (local calendar day). */
export const defaultRecurrenceDate = (now: Date = new Date()): string => {
	const tomorrow = new Date(now);
	tomorrow.setDate(now.getDate() + 1);
	return dateInputValue(tomorrow);
};

/**
 * Turns the date input into a future ISO timestamp: 09:00 local time on the
 * picked day. A day in the past (or today) rolls forward to tomorrow 09:00 so
 * the API's "nextRunAt must be in the future" rule is never violated by the
 * default form state.
 */
export const recurrenceNextRunAt = (
	date: string,
	now: Date = new Date(),
): string => {
	const picked = new Date(`${date}T09:00:00`);
	if (Number.isNaN(picked.getTime()) || picked.getTime() <= now.getTime()) {
		const tomorrow = new Date(now);
		tomorrow.setDate(now.getDate() + 1);
		tomorrow.setHours(9, 0, 0, 0);
		return tomorrow.toISOString();
	}
	return picked.toISOString();
};

/** Builds the POST body; issue-sourced recurrences send only the reference. */
export const buildCreateRecurrenceInput = ({
	cadence,
	date,
	issueId,
	now,
}: {
	cadence: RecurrenceCadence;
	date: string;
	issueId?: string;
	now?: Date;
}): CreateRecurrenceInput => ({
	...(issueId ? { issueId } : {}),
	cadence,
	nextRunAt: recurrenceNextRunAt(date, now),
});
