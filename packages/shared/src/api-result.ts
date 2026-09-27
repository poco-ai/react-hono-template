/**
 * 统一 API 返回类型的契约。
 *
 * 所有 Hono RPC 端点的成功分支都返回 ApiOk<T>，
 * 错误分支（包括 onError / notFound 统一处理的）都是 ApiErr。
 * 前端通过 hc<AppType> 拿到成功分支的类型推导；
 * 错误分支由运行时判断 body.ok 收窄（见 apps/web 的 unwrap 助手）。
 */

export interface ApiOk<T> {
	ok: true;
	data: T;
}

export interface ApiErr {
	ok: false;
	error: {
		code: string;
		message: string;
	};
}

export type ApiResult<T> = ApiOk<T> | ApiErr;
