const statuses = {
	description:
		"Workflow statuses are shared by every project in this organization. They drive board columns, filters and issue progress.",
	create: "New status",
	createTitle: "Create status",
	editTitle: "Edit status",
	createDescription: "Add a step to this organization's workflow.",
	editDescription: "Rename, recategorize or recolor this workflow status.",
	name: "Name",
	namePlaceholder: "e.g. Ready for QA",
	category: "Category",
	color: "Color",
	default: "Default",
	setDefault: "Set as default",
	edit: "Edit status",
	moveUp: "Move up",
	moveDown: "Move down",
	empty: "No statuses yet.",
	lastStatusHint: "An organization must keep at least one status.",
	deleteTitle: "Delete status {{name}}?",
	deleteDescription:
		"Issues using this status are moved to the status you select below. This cannot be undone.",
	migrateTo: "Move issues to",
	migratePlaceholder: "Select a status",
	categories: {
		backlog: "Backlog",
		unstarted: "Unstarted",
		started: "Started",
		completed: "Completed",
		canceled: "Canceled",
	},
};

export default statuses;
