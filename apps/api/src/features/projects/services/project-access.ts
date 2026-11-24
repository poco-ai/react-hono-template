import { ApiError, ApiErrorCode } from "@workspace/shared";

type ProjectLike = { archived: boolean };

/**
 * Archived projects are read-only. Missing projects throw NOT_FOUND (not
 * ARCHIVED) so callers cannot accidentally mask a bad project id.
 */
export const assertProjectWritable = <T extends ProjectLike | null | undefined>(
	project: T,
): NonNullable<T> => {
	if (!project) {
		throw new ApiError(ApiErrorCode.PROJECT_NOT_FOUND, "Project not found");
	}
	if (project.archived) {
		throw new ApiError(
			ApiErrorCode.PROJECT_ARCHIVED,
			"Project is archived and read-only",
		);
	}
	return project as NonNullable<T>;
};
