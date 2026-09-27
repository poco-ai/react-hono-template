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
