import { ApiError, ApiErrorCode } from "@workspace/shared";
import type { Context } from "hono";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";

type Env = SessionEnv & OrgEnv;

/** Reads a required path param or fails with INVALID_PARAM. */
export const requireParam = (c: Context<Env>, name: string) => {
	const value = c.req.param(name);
	if (!value) {
		throw new ApiError(
			400,
			ApiErrorCode.INVALID_PARAM,
			`Missing required param: ${name}`,
		);
	}
	return value;
};

export const requireProjectId = (c: Context<Env>) =>
	requireParam(c, "projectId");

export const requireIssueNumber = (c: Context<Env>) => {
	const raw = c.req.param("number");
	const number = Number(raw);
	if (!/^\d+$/.test(raw ?? "") || !Number.isInteger(number) || number < 1) {
		throw new ApiError(
			400,
			ApiErrorCode.INVALID_PARAM,
			"Issue number must be a positive integer",
		);
	}
	return number;
};
