import { ApiError, ApiErrorCode } from "@workspace/shared";
import type { IssueDao } from "../dao/issue.dao";
import type { ProjectDao } from "../dao/project.dao";
import type { AiContextSnapshot, AiContextType } from "../dto/ai.dto";

export type AiContextRequest = {
	type?: AiContextType;
	id?: string;
};

export type AiContextDaos = {
	projectDao: Pick<ProjectDao, "findById">;
	issueDao: Pick<IssueDao, "findById">;
};

/**
 * Validates that a chat context belongs to the organization and produces the
 * snapshot persisted on the user message / rendered into the system prompt.
 */
export const resolveAiContext = async (
	orgId: string,
	context: AiContextRequest | undefined,
	daos: AiContextDaos,
): Promise<AiContextSnapshot | null> => {
	if (!context?.type || !context.id) return null;

	if (context.type === "project") {
		const project = await daos.projectDao.findById(orgId, context.id);
		if (!project) {
			throw new ApiError(
				400,
				ApiErrorCode.VALIDATION,
				"AI context project not found in this organization.",
			);
		}
		return {
			type: "project",
			id: project.id,
			label: `${project.key} ${project.name}`,
		};
	}

	const issue = await daos.issueDao.findById(orgId, context.id);
	if (!issue) {
		throw new ApiError(
			400,
			ApiErrorCode.VALIDATION,
			"AI context issue not found in this organization.",
		);
	}
	return {
		type: "issue",
		id: issue.id,
		label: `#${issue.number} ${issue.title}`,
		projectId: issue.projectId,
		number: issue.number,
	};
};
