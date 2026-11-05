import { queryOptions, useQueryClient } from "@tanstack/react-query";
import { client, unwrap } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { codedError, errorCode } from "@/lib/errors";
import { isMediaAssetUrl } from "@/lib/media";
import { imageContentType, uploadViaPresign } from "@/lib/upload";

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

export const organizationsKey = () => ["orgs"] as const;

/**
 * Reloads the app organization list after a better-auth organization write.
 * Callers navigate immediately afterwards, and the org route reads this cache.
 */
const activeOrganizationId = async () => {
	const { data, error } = await authClient.organization.getFullOrganization();
	if (error || !data) {
		throw codedError(error?.message ?? "No active organization", error?.code);
	}
	return data.id;
};

export async function uploadOrganizationLogo(file: File): Promise<string> {
	const orgId = await activeOrganizationId();
	const contentType = imageContentType(file);
	const registered = await uploadViaPresign<{ url: string }>({
		file,
		contentType,
		presign: () =>
			client.api.orgs[":orgId"].logo.presign.$post({
				param: { orgId },
				json: {
					filename: file.name || `logo.${contentType.split("/")[1]}`,
					contentType,
					size: file.size,
				},
			}),
		register: (key) =>
			client.api.orgs[":orgId"].logo.$post({
				param: { orgId },
				json: { key },
			}),
	});
	return registered.url;
}

export async function deleteOrganizationLogo(url: string): Promise<void> {
	if (!isMediaAssetUrl(url)) return;
	try {
		const orgId = await activeOrganizationId();
		await unwrap(
			client.api.orgs[":orgId"].logo.$delete({
				param: { orgId },
				json: { url },
			}),
		);
	} catch (error) {
		const code = errorCode(error);
		if (code === "ASSET_NOT_FOUND" || code === "VALIDATION") return;
		throw error;
	}
}

export function useRefreshOrganizations() {
	const queryClient = useQueryClient();
	return () => queryClient.fetchQuery(orgsQuery());
}
