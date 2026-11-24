const invite = {
	title: "Join organization",
	accepting: "Accepting invitation…",
	successTitle: "You're in!",
	successDescription:
		"The invitation was accepted. You now have access to the organization.",
	errorTitle: "Invitation failed",
	continue: "Continue",
	preview: "You've been invited to join {{organization}} as {{role}}.",
	errors: {
		invitationNotFound: "This invitation doesn't exist or has been revoked.",
		emailMismatch: "This invitation was sent to a different email address.",
		alreadyMember: "You're already a member of this organization.",
		orgFull: "This organization has no open member slots on its current plan.",
		generic: "This invitation is invalid or has expired.",
	},
};

export default invite;
