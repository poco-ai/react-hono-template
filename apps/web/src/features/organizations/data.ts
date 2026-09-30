import {
	type QueryClient,
	queryOptions,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { authClient } from "@/lib/auth-client";

import { errorCode } from "@/lib/errors";

import type { MutationCallbacks } from "@/lib/mutation-callbacks";

export type Organization = (typeof authClient.$Infer)["Organization"] & {
	frozen: boolean;
};

export function orgsQuery() {
	return queryOptions({
		queryKey: organizationsKey(),
		queryFn: async (): Promise<Organization[]> => {
			const { data, error } = await authClient.organization.list();
			if (error) {
				throw new Error(
					`[${error.code ?? "error"}] ${error.message ?? "Failed to load organizations"}`,
				);
			}
			return (data ?? []).map((org) => ({
				...org,
				frozen: Boolean((org as { frozen?: boolean }).frozen),
			}));
		},
	});
}

export const createOrganization = async (
	{ name, slug }: { name: string; slug: string },
	failureMessage: string,
) => {
	const { data, error } = await authClient.organization.create({
		name: name.trim(),
		slug,
	});
	if (error) {
		throw Object.assign(new Error(error.message ?? failureMessage), {
			code: errorCode(error),
		});
	}
	return data;
};

export function useCreateOrganization(
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof createOrganization>>,
		{ name: string; slug: string }
	>,
) {
	const queryClient = useQueryClient();
	const { t } = useTranslation();
	return useMutation({
		...callbacks,
		mutationFn: (input: { name: string; slug: string }) =>
			createOrganization(input, t("onboarding.failed")),
		onSuccess: (...args) => {
			const org = args[0];
			if (org)
				queryClient.setQueryData<Organization[]>(
					orgsQuery().queryKey,
					(previous) => [...(previous ?? []), { ...org, frozen: false }],
				);
			void invalidateOrganizationQueries(queryClient);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export const updateOrganization = async (
	orgId: string,
	{ name, slug }: { name: string; slug: string },
	failureMessage: string,
) => {
	const { error } = await authClient.organization.update({
		organizationId: orgId,
		data: { name: name.trim(), slug },
	});
	if (error) {
		throw Object.assign(new Error(error.message ?? failureMessage), {
			code: errorCode(error),
		});
	}
};

export function useUpdateOrganization(
	orgId: string,
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof updateOrganization>>,
		{ name: string; slug: string }
	>,
) {
	const queryClient = useQueryClient();
	const { t } = useTranslation();
	return useMutation({
		...callbacks,
		mutationFn: (input: { name: string; slug: string }) =>
			updateOrganization(orgId, input, t("settings.updateFailed")),
		onSuccess: (...args) => {
			void invalidateOrganizationQueries(queryClient);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export const leaveOrganization = async (orgId: string) => {
	const { error } = await authClient.organization.leave({
		organizationId: orgId,
	});
	if (error) {
		throw Object.assign(new Error(error.message ?? ""), {
			code: errorCode(error),
		});
	}
};

export function useLeaveOrganization(
	orgId: string,
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof leaveOrganization>>,
		void
	>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		...callbacks,
		mutationFn: () => leaveOrganization(orgId),
		onSuccess: (...args) => {
			void invalidateOrganizationQueries(queryClient);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export const deleteOrganization = async (orgId: string) => {
	const { error } = await authClient.organization.delete({
		organizationId: orgId,
	});
	if (error) {
		throw Object.assign(new Error(error.message ?? ""), {
			code: errorCode(error),
		});
	}
};

export function useDeleteOrganization(
	orgId: string,
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof deleteOrganization>>,
		void
	>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		...callbacks,
		mutationFn: () => deleteOrganization(orgId),
		onSuccess: (...args) => {
			void invalidateOrganizationQueries(queryClient);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export const organizationsKey = () => ["orgs"] as const;
export const invalidateOrganizationQueries = (client: QueryClient) =>
	client.invalidateQueries({ queryKey: organizationsKey() });
