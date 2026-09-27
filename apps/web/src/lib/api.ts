import type { AppType } from "@api/routes";
import type { ApiOk, ApiResult } from "@workspace/shared";
import { type ClientResponse, hc } from "hono/client";

/**
 * Hono RPC client：AppType 直接来自后端 routes.ts（import type 会在构建时擦除，
 * 不会把任何后端代码打进前端包）。路径、参数、响应类型全部自动推导。
 *
 * baseUrl 为空 = 同源请求（本地开发走 Vite proxy）；
 * 生产环境通过 VITE_API_URL 指向 API Worker 域名（跨域，后端已配 CORS）。
 */
export const client = hc<AppType>(import.meta.env.VITE_API_URL ?? "");

/**
 * 统一解包：成功返回 data；失败（后端 onError 产出的 ApiErr）抛 Error。
 *
 * 注意：onError 的错误响应不参与 RPC 类型推导（Hono RPC 只从 c.json() 推断成功分支），
 * 所以这里用运行时判断 + 断言到 ApiResult<T> 收窄。
 */
export async function unwrap<T>(res: ClientResponse<ApiOk<T>>): Promise<T> {
	const body = (await res.json()) as ApiResult<T>;
	if (body.ok) {
		return body.data;
	}
	throw new Error(`[${body.error.code}] ${body.error.message}`);
}
