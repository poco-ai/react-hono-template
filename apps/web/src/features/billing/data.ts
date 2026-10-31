import type { BillingDto } from "@api/dto/billing.dto";
import {
	type BillingAdapter,
	type BillingScope,
	billingQueryKeys,
} from "@better-auth-ui/core/plugins/billing";
import {
	type QueryClient,
	queryOptions,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import { PLANS } from "@workspace/shared";
import type { TFunction } from "i18next";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { organizationsKey } from "@/features/organizations/data";
import { client, unwrap } from "@/lib/api";

import type { MutationCallbacks } from "@/lib/mutation-callbacks";

export function billingRootKey(orgId: string) {
	return ["orgs", orgId, "billing"] as const;
}

export function billingQuery(orgId: string) {
	return queryOptions({
		queryKey: billingRootKey(orgId),
		queryFn: (): Promise<BillingDto> =>
			unwrap(client.api.orgs[":orgId"].billing.$get({ param: { orgId } })),
	});
}

export const createCheckout = (orgId: string) =>
	unwrap(
		client.api.orgs[":orgId"].billing.checkout.$post({ param: { orgId } }),
	);

export function useCreateCheckout(
	orgId: string,
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof createCheckout>>,
		void
	>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		...callbacks,
		mutationFn: () => createCheckout(orgId),
		onSuccess: (...args) => {
			if (!args[0].url) void invalidateBillingQueries(queryClient, orgId);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export const createBillingPortal = (orgId: string) =>
	unwrap(client.api.orgs[":orgId"].billing.portal.$post({ param: { orgId } }));

export function useCreateBillingPortal(
	orgId: string,
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof createBillingPortal>>,
		void
	>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		...callbacks,
		mutationFn: () => createBillingPortal(orgId),
		onSuccess: (...args) => {
			if (!args[0].url) void invalidateBillingQueries(queryClient, orgId);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export const invalidateBillingQueries = (client: QueryClient, orgId: string) =>
	Promise.all([
		client.invalidateQueries({ queryKey: billingRootKey(orgId) }),
		client.invalidateQueries({ queryKey: organizationsKey(), exact: true }),
	]);

export type BillingConfirmation = (
	action: "upgrade" | "downgrade",
) => Promise<boolean>;

/** Keep the existing org billing endpoints and cache policies behind BAUI's adapter. */
export function createAppBillingAdapter({
	orgId,
	queryClient,
	t,
	canManage,
	confirm,
}: {
	orgId: string;
	queryClient: QueryClient;
	t: TFunction;
	canManage: boolean;
	confirm: BillingConfirmation;
}): BillingAdapter {
	const checkScope = (scope: BillingScope) => {
		if (scope.type !== "organization" || scope.organizationId !== orgId)
			throw new Error(t("errors.orgSettingsRequired"));
	};
	const read = (scope: BillingScope) => {
		checkScope(scope);
		return queryClient.fetchQuery(billingQuery(orgId));
	};
	const act = async (scope: BillingScope, action: "upgrade" | "downgrade") => {
		checkScope(scope);
		if (!canManage) throw new Error(t("billing.readOnly"));
		const data = await read(scope);
		if (data.mockMode && !data.stripeEnabled && !(await confirm(action)))
			return {};
		const result =
			action === "upgrade"
				? await createCheckout(orgId)
				: await createBillingPortal(orgId);
		if (!result.url) {
			await invalidateBillingQueries(queryClient, orgId);
			// Portal normally redirects, so BAUI does not invalidate it; mock portal downgrades in place.
			await queryClient.invalidateQueries({
				queryKey: billingQueryKeys.state(scope),
			});
		}
		return result.url ? { url: result.url } : {};
	};
	const unsupported = async () => {
		throw new Error(t("errors.orgSettingsRequired"));
	};
	return {
		id: "app-org-billing",
		scopes: { user: false, organization: true },
		supports: { cancel: false, restore: false, seats: false },
		listPlans: async (scope) => {
			checkScope(scope);
			return (["free", "pro"] as const).map((id) => {
				const plan = PLANS[id];
				return {
					id,
					name: t(id === "free" ? "billing.planFree" : "billing.planPro"),
					highlighted: id === "pro",
					seatBased: id === "pro",
					prices: [
						{
							id: `${id}-month`,
							amount: plan.price * 100,
							currency: "USD",
							interval: "month" as const,
						},
					],
					features: [
						`${t("billing.limits.members")}: ${plan.members}`,
						`${t("billing.limits.projects")}: ${plan.projects}`,
						`${t("billing.limits.webhooks")}: ${plan.webhooks}`,
						`${t("billing.attachmentSize")}: ${t("billing.megabytes", { value: plan.attachmentMaxSize / (1024 * 1024) })}`,
						`${t("billing.apiRateLimit")}: ${t("billing.perMinute", { value: plan.apiRateLimit })}`,
					],
				};
			});
		},
		getState: async (scope) => {
			const data = await read(scope);
			return {
				// The app exposes an entitlement, including Free, rather than a Stripe subscription id.
				subscription: {
					id: orgId,
					planId: data.plan,
					planName: t(
						data.plan === "free" ? "billing.planFree" : "billing.planPro",
					),
					status: "unknown",
					...(data.currentPeriodEnd
						? { currentPeriodEnd: new Date(data.currentPeriodEnd) }
						: {}),
				},
				usage: (["members", "projects", "webhooks"] as const).map((id) => ({
					id,
					label: t(`billing.limits.${id}`),
					used: data.usage[id],
					limit: data.limits[id],
				})),
			};
		},
		checkout: (scope, input) => {
			if (input.planId !== "free" && input.planId !== "pro")
				return unsupported();
			return act(scope, input.planId === "pro" ? "upgrade" : "downgrade");
		},
		openPortal: (scope) => act(scope, "downgrade"),
		cancel: unsupported,
		restore: unsupported,
		updateSeats: unsupported,
	};
}

export function useAppBillingAdapter(
	orgId: string,
	canManage: boolean,
	confirm: BillingConfirmation,
) {
	const queryClient = useQueryClient();
	const { t, i18n } = useTranslation();
	// BAUI uses stable scope query keys: refresh localized plan/usage labels on language changes.
	useEffect(() => {
		if (!i18n.language) return;
		void queryClient.invalidateQueries({
			queryKey: billingQueryKeys.scope({
				type: "organization",
				organizationId: orgId,
				organizationSlug: orgId,
			}),
		});
	}, [queryClient, orgId, i18n.language]);
	return useMemo(
		() =>
			createAppBillingAdapter({ orgId, queryClient, t, canManage, confirm }),
		[orgId, queryClient, t, canManage, confirm],
	);
}
