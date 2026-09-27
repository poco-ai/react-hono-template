import type { ApiErr, ApiOk } from "@workspace/shared";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * 统一响应工厂：保证所有端点的 JSON 形状符合 shared 包里的 ApiResult 契约，
 * 并且让返回类型参与 Hono RPC 推导（前端 hc<AppType> 直接拿到 ApiOk<T>）。
 *
 * 注意：ok() 固定 200，需要 201 等状态码时直接用 c.json(successBody(...), 201)。
 */

export const ok = <T>(c: Context, data: T) =>
	c.json<ApiOk<T>>({ ok: true, data });

export const fail = (
	c: Context,
	code: string,
	message: string,
	status: ContentfulStatusCode,
) => c.json<ApiErr>({ ok: false, error: { code, message } }, status);
