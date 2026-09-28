import type { AppType } from "@api/routes";
import type { ApiOk, ApiResult } from "@workspace/shared";
import { type ClientResponse, hc } from "hono/client";

export const client = hc<AppType>(import.meta.env.VITE_API_URL ?? "", {
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
	throw new Error(`[${body.error.code}] ${body.error.message}`);
}
