const errors = {
	generic: "Something went wrong. Please try again.",
	codes: {
		ORG_FROZEN:
			"This organization is frozen. Ask an owner to unfreeze it first.",
		PLAN_LIMIT_EXCEEDED:
			"You have reached the limit of the current plan. Upgrade to continue.",
		NOT_FOUND: "This item does not exist or has been deleted.",
		FORBIDDEN: "You do not have permission to perform this action.",
		UNAUTHORIZED: "Please sign in and try again.",
		VALIDATION:
			"Some of the provided values are invalid. Please check and try again.",
		CONFLICT:
			"This change conflicts with the current state. Please refresh and try again.",
		STATUS_NAME_TAKEN: "A status with this name already exists.",
		STATUS_LAST_STATUS:
			"An organization must keep at least one workflow status.",
		STATUS_MIGRATION_REQUIRED:
			"Move the issues using this status to another status before deleting it.",
		STATUS_MIGRATION_INVALID:
			"Choose a valid status in this organization to move the issues to.",
		ISSUE_PARENT_INVALID:
			"The parent issue must be in the same project. Choose another issue.",
		ISSUE_PARENT_DEPTH:
			"Sub-issues support two levels only. Detach the current parent or choose a top-level issue.",
		ISSUE_RELATION_INVALID:
			"This link is not allowed. Issues must belong to the same project and differ.",
		ISSUE_RELATION_EXISTS: "These issues are already linked this way.",
		ISSUE_RELATION_CYCLE:
			"Blocking relations cannot form a cycle. Remove or change one of the blocking links first.",
		PROJECT_ARCHIVED:
			"This project is archived and read-only. Restore it from project settings to make changes.",
		CYCLE_OVERLAP:
			"These dates overlap with another cycle. Choose a range that doesn't overlap.",
		CYCLE_RANGE_INVALID:
			"The end date must be the same as or after the start date.",
		CYCLE_TARGET_INVALID:
			"Choose a different cycle that has not ended yet as the target.",
		VIEW_LIMIT_REACHED:
			"You have reached the saved-view limit of your plan. Upgrade, or ask an owner or admin to share a view with the team.",
		VIEW_NOT_FOUND: "That view no longer exists or is not visible to you.",
		MCP_FORBIDDEN_SCOPE:
			"This action requires an API key with broader permissions.",
	},
	orgSettingsRequired:
		"Only owners and admins can change organization settings.",
	orgLeaveOwner:
		"Owners must transfer ownership before leaving the organization.",
	invalidEmailOrPassword: "Invalid email or password.",
	userAlreadyExists: "An account with this email already exists.",
};

export default errors;
