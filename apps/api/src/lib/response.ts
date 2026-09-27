import type { ApiErr, ApiOk } from "@workspace/shared";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export const ok = <T>(c: Context, data: T) =>
	c.json<ApiOk<T>>({ ok: true, data });

export const fail = (
	c: Context,
	code: string,
	message: string,
	status: ContentfulStatusCode,
) => c.json<ApiErr>({ ok: false, error: { code, message } }, status);
