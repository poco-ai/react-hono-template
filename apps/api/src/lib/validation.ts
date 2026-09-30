import { ApiError, ApiErrorCode } from "@workspace/shared";
import { validator } from "hono/validator";
import type { ZodType } from "zod";

export const formatZodError = (error: {
	issues: { path: PropertyKey[]; message: string }[];
}) =>
	error.issues
		.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
		.join("; ");

export const validate = <T, const S extends "json" | "query">(
	schema: ZodType<T>,
	source: S,
) =>
	validator(source, (value) => {
		const result = schema.safeParse(value);
		if (result.error) {
			throw new ApiError(
				400,
				ApiErrorCode.VALIDATION,
				formatZodError(result.error),
			);
		}
		return result.data as T;
	});
