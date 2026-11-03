import { queryOptions, useQueryClient } from "@tanstack/react-query";
import { client, unwrap } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { codedError } from "@/lib/errors";

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
const imageContentType = (file: File) => {
	const contentType = file.type === "image/jpg" ? "image/jpeg" : file.type;
	if (
		contentType !== "image/png" &&
		contentType !== "image/jpeg" &&
		contentType !== "image/webp"
	) {
		throw codedError(
			`Unsupported image type ${contentType || "unknown"}`,
			"UNSUPPORTED_MEDIA_TYPE",
		);
	}
	return contentType;
};

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
	const presignResponse = await client.api.orgs[":orgId"].logo.presign.$post({
		param: { orgId },
		json: {
			filename: file.name || `logo.${contentType.split("/")[1]}`,
			contentType,
			size: file.size,
		},
	});
	if (presignResponse.status >= 500) {
		throw codedError("Storage service unavailable", "STORAGE_UNAVAILABLE");
	}
	const presigned = await unwrap(presignResponse);
	const uploaded = await fetch(presigned.uploadUrl, {
		method: "PUT",
		headers: { "Content-Type": contentType },
		body: file,
	});
	if (!uploaded.ok) {
		throw new Error(`Upload failed with status ${uploaded.status}`);
	}
	const registered = await unwrap(
		client.api.orgs[":orgId"].logo.$post({
			param: { orgId },
			json: { key: presigned.key },
		}),
	);
	return registered.url;
}

export async function deleteOrganizationLogo(url: string): Promise<void> {
	const orgId = await activeOrganizationId();
	await unwrap(
		client.api.orgs[":orgId"].logo.$delete({
			param: { orgId },
			json: { url },
		}),
	);
}

export function useRefreshOrganizations() {
	const queryClient = useQueryClient();
	return () => queryClient.fetchQuery(orgsQuery());
}
