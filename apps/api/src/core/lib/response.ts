import type { ApiErr, ApiOk } from "@workspace/shared";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export const ok = <T, S extends ContentfulStatusCode = 200>(
	c: Context,
	data: T,
	status: S = 200 as S,
) => c.json<ApiOk<T>, S>({ ok: true, data }, status);

export const fail = (
	c: Context,
	code: string,
	message: string,
	status: ContentfulStatusCode,
) => c.json<ApiErr>({ ok: false, error: { code, message } }, status);
