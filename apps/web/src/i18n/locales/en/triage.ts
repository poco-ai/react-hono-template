const triage = {
	title: "Triage",
	description:
		"New issues waiting for an owner. Accept to assign yourself and start work, or decline to cancel.",
	rules:
		"Shows backlog issues with no assignee from active projects, newest first (up to 100).",
	allProjects: "All projects",
	clearFilter: "Clear filter",
	queueCount: "{{count}} in queue",
	selectAll: "Select all",
	selectIssue: "Select {{identifier}}",
	accept: "Accept",
	decline: "Decline",
	acceptSelected: "Accept selected",
	declineSelected: "Decline selected",
	createdAt: "Created {{date}}",
	createdBy: "by {{name}}",
	missingUnstarted:
		"No unstarted status exists. Add one in organization settings first.",
	missingCanceled:
		"No canceled status exists. Add one in organization settings first.",
	empty: "Queue is clear",
	emptyDescription: "No backlog issues are waiting for an owner right now.",
};

export default triage;
