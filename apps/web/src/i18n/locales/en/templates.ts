const templates = {
	description:
		"Prefills for new issues. Project templates appear in that project's create dialog; organization-wide templates appear everywhere.",
	create: "New template",
	createTitle: "Create template",
	editTitle: "Edit template",
	createDescription:
		"Choose which issue fields a new issue starts with. Every field stays editable.",
	editDescription: "Update the defaults this template prefills.",
	name: "Template name",
	namePlaceholder: "e.g. Bug report",
	scope: "Applies to",
	orgWide: "Whole organization",
	title: "Issue title",
	noStatus: "Project default",
	labelCount: "Labels: {{count}}",
	estimateValue: "{{count}} pt",
	estimateHint:
		"Optional starting estimate for issues created from this template.",
	empty: "No templates yet.",
	deleteTitle: "Delete template?",
	deleteDescription:
		"Deletes “{{name}}”. Issues already created from it are not affected.",
};

export default templates;
