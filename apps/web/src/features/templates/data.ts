import type { IssueTemplateDto } from "@api/dto/issue-template.dto";
import {
	type QueryClient,
	queryOptions,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import type {
	CreateIssueTemplateInput,
	UpdateIssueTemplateInput,
} from "@workspace/shared";
import { issueTemplatesKey, issueTemplatesRootKey } from "@/features/keys";
import { client, unwrap } from "@/lib/api";
import type { MutationCallbacks } from "@/lib/mutation-callbacks";

export type { IssueTemplateDto };

export function issueTemplatesQuery(
	orgId: string,
	{ projectId }: { projectId?: string } = {},
) {
	return queryOptions({
		queryKey: issueTemplatesKey(orgId, { projectId }),
		queryFn: (): Promise<IssueTemplateDto[]> =>
			unwrap(
				client.api.orgs[":orgId"]["issue-templates"].$get({
					param: { orgId },
					query: { projectId: projectId ?? undefined },
				}),
			),
	});
}

export const createIssueTemplate = (
	orgId: string,
	input: CreateIssueTemplateInput,
) =>
	unwrap(
		client.api.orgs[":orgId"]["issue-templates"].$post({
			param: { orgId },
			json: input,
		}),
	);

export const updateIssueTemplate = (
	orgId: string,
	templateId: string,
	input: UpdateIssueTemplateInput,
) =>
	unwrap(
		client.api.orgs[":orgId"]["issue-templates"][":templateId"].$patch({
			param: { orgId, templateId },
			json: input,
		}),
	);

export const deleteIssueTemplate = (orgId: string, templateId: string) =>
	unwrap(
		client.api.orgs[":orgId"]["issue-templates"][":templateId"].$delete({
			param: { orgId, templateId },
		}),
	);

/** One root invalidation covers the dialog's unfiltered list and settings. */
export const invalidateIssueTemplateQueries = (
	queryClient: QueryClient,
	orgId: string,
) =>
	queryClient.invalidateQueries({
		queryKey: issueTemplatesRootKey(orgId),
	});

export function useCreateIssueTemplate(
	orgId: string,
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof createIssueTemplate>>,
		CreateIssueTemplateInput
	>,
) {
	const queryClient = useQueryClient();
	return useMutation({
		...callbacks,
		mutationFn: (input: CreateIssueTemplateInput) =>
			createIssueTemplate(orgId, input),
		onSuccess: (...args) => {
			void invalidateIssueTemplateQueries(queryClient, orgId);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export function useUpdateIssueTemplate(
	orgId: string,
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof updateIssueTemplate>>,
		{ templateId: string; input: UpdateIssueTemplateInput }
	>,
) {
	const queryClient = useQueryClient();
	return useMutation({
		...callbacks,
		mutationFn: ({
			templateId,
			input,
		}: {
			templateId: string;
			input: UpdateIssueTemplateInput;
		}) => updateIssueTemplate(orgId, templateId, input),
		onSuccess: (...args) => {
			void invalidateIssueTemplateQueries(queryClient, orgId);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export function useDeleteIssueTemplate(
	orgId: string,
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof deleteIssueTemplate>>,
		string
	>,
) {
	const queryClient = useQueryClient();
	return useMutation({
		...callbacks,
		mutationFn: (templateId: string) => deleteIssueTemplate(orgId, templateId),
		onSuccess: (...args) => {
			void invalidateIssueTemplateQueries(queryClient, orgId);
			return callbacks?.onSuccess?.(...args);
		},
	});
}
