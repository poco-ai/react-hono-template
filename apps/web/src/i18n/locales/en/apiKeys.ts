const apiKeys = {
	create: "New API key",
	createTitle: "Create API key",
	createDescription:
		"Give the key a recognizable name — it can be revoked at any time.",
	name: "Name",
	namePlaceholder: "e.g. CI pipeline",
	access: "Access level",
	accessRead: "Read only",
	accessWrite: "Read and write",
	accessReadDescription:
		"Recommended for MCP agents and integrations that should never change data.",
	accessWriteDescription:
		"Allows creating and updating issues, comments and projects.",
	key: "Key",
	created: "Created",
	lastUsed: "Last used",
	lastUsedNever: "Never used",
	statusActive: "Active",
	statusRevoked: "Revoked",
	revoke: "Revoke",
	revokeTitle: "Revoke API key?",
	revokeDescription:
		"{{name}} will stop working immediately. This cannot be undone.",
	createdTitle: "API key created",
	secretWarning: "Copy this key now — it won't be shown again.",
	viewDocs: "View API docs",
	keyCount_one: "{{count}} key",
	keyCount_other: "{{count}} keys",
	unknownCreator: "Unknown user",
	empty: "No API keys yet.",
};

export default apiKeys;
