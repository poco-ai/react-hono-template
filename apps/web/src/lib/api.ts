import type { AppType } from "@api/routes";
import type { ApiOk, ApiResult } from "@workspace/shared";
import { type ClientResponse, hc } from "hono/client";
import { errorMessage } from "@/lib/errors";

export const client = hc<AppType>(import.meta.env?.VITE_API_URL ?? "", {
	init: { credentials: "include" },
});

export async function unwrap<T>(
	res: ClientResponse<ApiOk<T>> | Promise<ClientResponse<ApiOk<T>>>,
): Promise<T> {
	const response = await res;
	const body = (await response.json()) as ApiResult<T>;
	if (body.ok) {
		return body.data;
	}
	const { code } = body.error;
	throw Object.assign(new Error(errorMessage(body.error)), {
		code: code as string,
		status: response.status,
	});
}

export function isPlanLimitError(err: unknown): boolean {
	if (
		typeof err === "object" &&
		err !== null &&
		(err as { code?: unknown }).code === "PLAN_LIMIT_EXCEEDED"
	) {
		return true;
	}
	return (
		err instanceof Error &&
		/plan limit reached|PLAN_LIMIT_EXCEEDED/i.test(err.message)
	);
}
