import type {
	ListWebhookDeliveriesDto,
	WebhookDto,
} from "@api/dto/webhook.dto";
import {
	type QueryClient,
	queryOptions,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import type { WebhookEventName } from "@workspace/shared";
import { client, unwrap } from "@/lib/api";
import type { MutationCallbacks } from "@/lib/mutation-callbacks";

export const WEBHOOK_DELIVERIES_PAGE_SIZE = 10;

export function webhooksKey(orgId: string) {
	return ["orgs", orgId, "webhooks"] as const;
}

export function webhookDeliveriesRootKey(orgId: string, webhookId: string) {
	return ["orgs", orgId, "webhooks", webhookId, "deliveries"] as const;
}

export function webhooksQuery(orgId: string) {
	return queryOptions({
		queryKey: webhooksKey(orgId),
		queryFn: (): Promise<WebhookDto[]> =>
			unwrap(client.api.orgs[":orgId"].webhooks.$get({ param: { orgId } })),
	});
}

export function webhookDeliveriesQuery(
	orgId: string,
	webhookId: string,
	page: number,
) {
	return queryOptions({
		queryKey: webhookDeliveriesKey(orgId, webhookId, page),
		queryFn: (): Promise<ListWebhookDeliveriesDto> =>
			unwrap(
				client.api.orgs[":orgId"].webhooks[":webhookId"].deliveries.$get({
					param: { orgId, webhookId },
					query: {
						page: String(page),
						pageSize: String(WEBHOOK_DELIVERIES_PAGE_SIZE),
					},
				}),
			),
	});
}

export const toggleWebhook = (
	orgId: string,
	{ id, active }: { id: string; active: boolean },
) =>
	unwrap(
		client.api.orgs[":orgId"].webhooks[":webhookId"].$patch({
			param: { orgId, webhookId: id },
			json: { active },
		}),
	);

export function useToggleWebhook(
	orgId: string,
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof toggleWebhook>>,
		{ id: string; active: boolean }
	>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		...callbacks,
		mutationFn: (input: { id: string; active: boolean }) =>
			toggleWebhook(orgId, input),
		onSuccess: (...args) => {
			void invalidateWebhookQueries(queryClient, orgId);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export const deleteWebhook = (orgId: string, webhookId: string) =>
	unwrap(
		client.api.orgs[":orgId"].webhooks[":webhookId"].$delete({
			param: { orgId, webhookId },
		}),
	);

export function useDeleteWebhook(
	orgId: string,
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof deleteWebhook>>,
		string
	>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		...callbacks,
		mutationFn: (input: string) => deleteWebhook(orgId, input),
		onSuccess: (...args) => {
			void invalidateWebhookQueries(queryClient, orgId);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export const pingWebhook = (orgId: string, webhookId: string) =>
	unwrap(
		client.api.orgs[":orgId"].webhooks[":webhookId"].ping.$post({
			param: { orgId, webhookId },
		}),
	);

export function usePingWebhook(
	orgId: string,
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof pingWebhook>>,
		string
	>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		...callbacks,
		mutationFn: (input: string) => pingWebhook(orgId, input),
		onSuccess: (...args) => {
			void invalidateWebhookQueries(queryClient, orgId);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export const saveWebhook = (
	orgId: string,
	webhookId: string | undefined,
	input: {
		url: string;
		events: WebhookEventName[];
		active?: boolean;
	},
) =>
	webhookId
		? unwrap(
				client.api.orgs[":orgId"].webhooks[":webhookId"].$patch({
					param: { orgId, webhookId: webhookId },
					json: input,
				}),
			)
		: unwrap(
				client.api.orgs[":orgId"].webhooks.$post({
					param: { orgId },
					json: { url: input.url, events: input.events },
				}),
			);

export function useSaveWebhook(
	orgId: string,
	webhookId: string | undefined,
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof saveWebhook>>,
		{
			url: string;
			events: WebhookEventName[];
			active?: boolean;
		}
	>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		...callbacks,
		mutationFn: (input: {
			url: string;
			events: WebhookEventName[];
			active?: boolean;
		}) => saveWebhook(orgId, webhookId, input),
		onSuccess: (...args) => {
			void invalidateWebhookQueries(queryClient, orgId);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export const redeliverWebhook = (orgId: string, deliveryId: string) =>
	unwrap(
		client.api.orgs[":orgId"]["webhook-deliveries"][
			":deliveryId"
		].redeliver.$post({
			param: { orgId, deliveryId },
		}),
	);

export function useRedeliverWebhook(
	orgId: string,
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof redeliverWebhook>>,
		string
	>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		...callbacks,
		mutationFn: (input: string) => redeliverWebhook(orgId, input),
		onSuccess: (...args) => {
			void invalidateWebhookQueries(queryClient, orgId);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export const invalidateWebhookQueries = (client: QueryClient, orgId: string) =>
	client.invalidateQueries({ queryKey: webhooksKey(orgId) });

export const webhookDeliveriesKey = (
	orgId: string,
	webhookId: string,
	page: number,
) => ["orgs", orgId, "webhooks", webhookId, "deliveries", page] as const;
