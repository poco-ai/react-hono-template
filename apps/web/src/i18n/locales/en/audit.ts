const audit = {
	title: "Audit log",
	description:
		"Sensitive changes in this organization. Secrets and message bodies are not stored.",
	action: "Action",
	actor: "Actor",
	target: "Target",
	time: "Time",
	result: "Result",
	allActions: "All actions",
	actorPlaceholder: "Actor id",
	from: "From",
	to: "To",
	export: "Export CSV",
	empty: "No audit events yet.",
	actions: {
		"member.invited": "Member invited",
		"member.removed": "Member removed",
		"member.role_changed": "Member role changed",
		"apikey.created": "API key created",
		"apikey.revoked": "API key revoked",
		"billing.plan_changed": "Plan changed",
		"quota.adjusted": "Credits adjusted",
		"quota.policy_changed": "Quota policy changed",
		"webhook.created": "Webhook created",
		"webhook.deleted": "Webhook deleted",
		"ai.settings_changed": "AI settings changed",
	},
};

export default audit;
