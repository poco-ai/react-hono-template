import { ApiError, ApiErrorCode } from "@workspace/shared";
import type { Context } from "hono";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";

type Env = SessionEnv & OrgEnv;

/** Reads a required path param value or fails with INVALID_PARAM. */
export const requireParamValue = (value: string | undefined, name: string) => {
	if (!value) {
		throw new ApiError(
			ApiErrorCode.INVALID_PARAM,
			`Missing required param: ${name}`,
		);
	}
	return value;
};

/** Reads a path param that must be one of `values`, else INVALID_PARAM. */
export const requireEnumParamValue = <T extends readonly string[]>(
	value: string | undefined,
	name: string,
	values: T,
): T[number] => {
	if (!(values as readonly string[]).includes(value ?? "")) {
		throw new ApiError(
			ApiErrorCode.INVALID_PARAM,
			`${name} must be one of ${values.join(", ")}`,
		);
	}
	return value as T[number];
};

/**
 * Reads a required path param or fails with INVALID_PARAM. Path-param errors
 * use INVALID_PARAM (route shape) rather than VALIDATION (body/query).
 */
export const requireParam = (c: Context<Env>, name: string) =>
	requireParamValue(c.req.param(name), name);

export const requireProjectId = (c: Context<Env>) =>
	requireParam(c, "projectId");

export const requireCycleId = (c: Context<Env>) => requireParam(c, "cycleId");

export const requireUpdateId = (c: Context<Env>) => requireParam(c, "updateId");

export const requireRecurrenceId = (c: Context<Env>) =>
	requireParam(c, "recurrenceId");

export const requireIssueNumber = (c: Context<Env>) => {
	const raw = c.req.param("number");
	const number = Number(raw);
	if (!/^\d+$/.test(raw ?? "") || !Number.isInteger(number) || number < 1) {
		throw new ApiError(
			ApiErrorCode.INVALID_PARAM,
			"Issue number must be a positive integer",
		);
	}
	return number;
};
