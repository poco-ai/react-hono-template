const recurrences = {
	title: "Recurring issues",
	makeRecurring: "Make recurring",
	makeRecurringDescription:
		"Create a new issue from {{key}} on a repeating schedule. The recurrence keeps a snapshot of this issue's fields.",
	cadenceLabel: "Repeat",
	cadence: {
		daily: "Daily",
		weekly: "Weekly",
		monthly: "Monthly",
	},
	firstRun: "First run",
	preview: "A new issue will be created {{cadence}} starting {{date}}.",
	createAction: "Create recurrence",
	nextRun: "Next run",
	active: "Active",
	paused: "Paused",
	pause: "Pause",
	resume: "Resume",
	editCadence: "Change cadence",
	delete: "Delete recurrence",
	deleteTitle: "Delete recurring issue?",
	deleteDescription:
		"Deletes “{{title}}”. Issues already created from it are not affected.",
	emptyTitle: "No recurring issues",
	emptyDescription:
		"Open an issue's menu and choose “Make recurring” to create one.",
	frozenHint:
		"This organization is frozen; recurring issues are read-only until billing is resolved.",
};

export default recurrences;
