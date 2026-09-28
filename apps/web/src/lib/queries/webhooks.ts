import type {
	ListWebhookDeliveriesDto,
	WebhookDto,
} from "@api/dto/webhook.dto";
import { queryOptions } from "@tanstack/react-query";
import { client, unwrap } from "@/lib/api";

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
		queryKey: [
			"orgs",
			orgId,
			"webhooks",
			webhookId,
			"deliveries",
			page,
		] as const,
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
