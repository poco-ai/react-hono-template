import type {
	AuthLocalization,
	SettingsLocalization,
} from "@better-auth-ui/core";
import type { OrganizationLocalization } from "@better-auth-ui/core/plugins/organization";
import type { TFunction } from "i18next";

/**
 * Copy for the public sign-in, sign-up, forgot-password, and reset-password
 * views. Strings come from the app locale so the library does not fall back
 * to English when the UI language is Chinese.
 *
 * Placeholders such as `{{min}}` and `{{email}}` are left for the library,
 * which replaces them itself.
 */
export function authFlowLocalization(t: TFunction): Partial<AuthLocalization> {
	return {
		alreadyHaveAnAccount: t("register.haveAccount"),
		checkYourEmailTitle: t("authUi.checkYourEmailTitle"),
		confirmPassword: t("account.confirmPassword"),
		confirmPasswordPlaceholder: t("account.confirmPassword"),
		continueWith: t("oauth.continueWith"),
		email: t("common.email"),
		emailPlaceholder: t("common.emailPlaceholder"),
		fieldRequired: t("form.errors.required"),
		forgotPassword: t("forgotPassword.title"),
		forgotPasswordLink: t("login.forgotPassword"),
		hidePassword: t("authUi.hidePassword"),
		invalidEmail: t("form.errors.email"),
		invalidResetPasswordToken: t("resetPassword.invalidToken"),
		name: t("common.name"),
		namePlaceholder: t("register.namePlaceholder"),
		needToCreateAnAccount: t("login.noAccount"),
		newPassword: t("account.newPassword"),
		newPasswordPlaceholder: t("register.passwordPlaceholder"),
		openEmailProvider: t("authUi.openEmailProvider"),
		or: t("oauth.orDivider"),
		password: t("common.password"),
		passwordFair: t("authUi.passwordFair"),
		passwordGood: t("authUi.passwordGood"),
		passwordPlaceholder: t("register.passwordPlaceholder"),
		passwordResetEmailSent: t("forgotPassword.sent"),
		passwordResetSuccess: t("resetPassword.success"),
		passwordStrength: t("authUi.passwordStrength"),
		passwordStrong: t("authUi.passwordStrong"),
		passwordWeak: t("authUi.passwordWeak"),
		passwordsDoNotMatch: t("account.mismatch"),
		rememberYourPassword: t("authUi.rememberYourPassword"),
		resetLinkSentTo: t("authUi.resetLinkSentTo"),
		resetPassword: t("resetPassword.title"),
		scanToOpenEmailProvider: t("authUi.scanToOpenEmailProvider"),
		sendResetLink: t("forgotPassword.submit"),
		showPassword: t("authUi.showPassword"),
		signIn: t("login.title"),
		signOut: t("nav.signOut"),
		signUp: t("register.title"),
		tooLong: t("form.errors.maxLength", { count: "{{max}}" }),
		tooShort: t("form.errors.passwordMin", { count: "{{min}}" }),
	};
}

/**
 * Copy for the account profile and change-password cards. Strings come from
 * the app locale so those cards do not fall back to English.
 */
export function accountSettingsLocalization(
	t: TFunction,
): Partial<SettingsLocalization> {
	return {
		activeSessions: t("securityUi.activeSessions"),
		currentSession: t("securityUi.currentSession"),
		revoke: t("securityUi.revoke"),
		revokeSession: t("securityUi.revokeSession"),
		revokeSessionSuccess: t("securityUi.revokeSessionSuccess"),
		linkedAccounts: t("securityUi.linkedAccounts"),
		accountUnlinked: t("securityUi.accountUnlinked"),
		lastAccountUnlinkingDisabled: t("securityUi.lastAccountUnlinkingDisabled"),
		link: t("securityUi.link"),
		linkProvider: t("securityUi.linkProvider", { provider: "{{provider}}" }),
		unlinkProvider: t("securityUi.unlinkProvider", {
			provider: "{{provider}}",
		}),
		signOutEverywhere: t("securityUi.signOutEverywhere"),
		signOutEverywhereDescription: t("securityUi.signOutEverywhereDescription"),
		signOutOtherDevices: t("securityUi.signOutOtherDevices"),
		signOutOtherDevicesDescription: t(
			"securityUi.signOutOtherDevicesDescription",
		),
		signOutOtherDevicesSuccess: t("securityUi.signOutOtherDevicesSuccess"),
		reauthenticationTitle: t("securityUi.reauthenticationTitle"),
		reauthenticationDescription: t("securityUi.reauthenticationDescription"),
		reauthenticationAction: t("securityUi.reauthenticationAction"),
		changePassword: t("account.passwordTitle"),
		changePasswordSuccess: t("account.passwordUpdated"),
		currentPassword: t("account.currentPassword"),
		currentPasswordPlaceholder: t("account.currentPassword"),
		profileUpdatedSuccess: t("account.nameUpdated"),
		cancel: t("common.cancel"),
		dangerZone: t("settings.dangerZone"),
		optional: t("common.optional"),
		saveChanges: t("settings.save"),
		setPassword: t("account.setPassword"),
		setPasswordDescription: t("account.setPasswordDescription"),
		updatePassword: t("resetPassword.submit"),
		userProfile: t("account.profileTitle"),
	};
}

/**
 * Extra organization strings that the installed components read at runtime.
 * They sit on the plugin localization object beside the library keys.
 */
export type OrganizationCopy = OrganizationLocalization & {
	deleteNamePrompt: string;
	done: string;
	frozenNotice: string;
	inviteLinkDescription: string;
	leaveConfirm: string;
	selfRoleDisabled: string;
	slugHint: string;
	slugInvalid: string;
};

export function organizationCopy(
	localization: OrganizationLocalization,
): OrganizationCopy {
	return localization as OrganizationCopy;
}

/**
 * Copy for organization switcher, create, invite, profile, and member screens.
 * Strings come from the app locale so those views do not fall back to English.
 *
 * Placeholders such as `{{name}}` are left for the library, which replaces
 * them itself.
 */
export function organizationFlowLocalization(
	t: TFunction,
): Partial<OrganizationLocalization> &
	Omit<OrganizationCopy, keyof OrganizationLocalization> {
	return {
		accept: t("orgUi.accept"),
		acceptInvitationDescription: t("invite.preview", {
			organization: "{{organization}}",
			role: "{{role}}",
		}),
		acceptInvitationTitle: t("invite.title"),
		accepted: t("orgUi.accepted"),
		actions: t("common.actions"),
		admin: t("org.roles.admin"),
		all: t("common.all"),
		cancelInvitation: t("members.revoke"),
		cancelSelectedInvitations: t("orgUi.cancelSelectedInvitations"),
		cancelSelectedInvitationsDescription: t(
			"orgUi.cancelSelectedInvitationsDescription",
		),
		canceled: t("orgUi.canceled"),
		changeMemberRole: t("orgUi.changeRole"),
		changeMemberRoleDescription: t("orgUi.changeRoleDescription"),
		clear: t("common.clear"),
		columns: t("orgUi.columns"),
		createOrganization: t("org.create"),
		deleteNamePrompt: t("settings.deleteDialogDescription", {
			name: "{{name}}",
		}),
		deleteOrganization: t("settings.deleteButton"),
		deleteOrganizationDescription: t("settings.deleteDescription"),
		done: t("common.done"),
		firstPage: t("orgUi.firstPage"),
		frozenNotice: t("org.frozenBanner"),
		invitationLimitReached: t("errors.codes.PLAN_LIMIT_EXCEEDED"),
		invitationUnavailable: t("invite.errorTitle"),
		invitationUnavailableDescription: t("invite.errors.generic"),
		invitations: t("members.pendingTitle"),
		invitationsCanceled: t("orgUi.invitationsCanceled", {
			count: "{{count}}",
		}),
		inviteLinkDescription: t("members.inviteLinkDescription", {
			email: "{{email}}",
		}),
		inviteMember: t("members.invite"),
		inviteMemberDescription: t("members.inviteDescription"),
		inviteMemberSuccess: t("members.inviteLinkTitle"),
		invitedAt: t("orgUi.invitedAt"),
		lastPage: t("orgUi.lastPage"),
		leaveConfirm: t("settings.leaveConfirmDescription", {
			name: "{{name}}",
		}),
		leaveOrganization: t("settings.leaveButton"),
		leaveOrganizationDescription: t("settings.leaveDescription"),
		leftOrganization: t("orgUi.leftOrganization"),
		limitReached: t("errors.codes.PLAN_LIMIT_EXCEEDED"),
		manage: t("org.settings"),
		member: t("members.member"),
		memberRemoved: t("toast.memberRemoved"),
		memberRoleUpdated: t("toast.memberRoleUpdated"),
		members: t("settings.members"),
		membersRemoved: t("orgUi.membersRemoved", { count: "{{count}}" }),
		membershipLimitReached: t("errors.codes.PLAN_LIMIT_EXCEEDED"),
		name: t("settings.orgName"),
		namePlaceholder: t("onboarding.orgNamePlaceholder"),
		nextPage: t("orgUi.nextPage"),
		noInvitations: t("members.noPending"),
		onlyOwnerActionDisabled: t("settings.soleOwnerHint"),
		organization: t("orgUi.organization"),
		organizationDeleted: t("orgUi.organizationDeleted"),
		organizationInvitationsEmptyDescription: t(
			"orgUi.noInvitationsDescription",
		),
		organizationLimitReached: t("errors.codes.PLAN_LIMIT_EXCEEDED"),
		organizationProfile: t("settings.general"),
		organizationUpdatedSuccess: t("toast.settingsSaved"),
		organizations: t("org.switcherLabel"),
		organizationsDescription: t("onboarding.description"),
		owner: t("org.roles.owner"),
		pageOf: t("orgUi.pageOf", { page: "{{page}}", pages: "{{pages}}" }),
		paginationRange: t("orgUi.range", {
			from: "{{from}}",
			to: "{{to}}",
			total: "{{total}}",
		}),
		pending: t("members.statusPending"),
		people: t("settings.members"),
		personalAccount: t("nav.account"),
		previousPage: t("orgUi.previousPage"),
		rejectInvitation: t("orgUi.reject"),
		rejected: t("orgUi.rejected"),
		removeMember: t("common.remove"),
		removeMemberWarning: t("members.removeDescription", {
			name: t("members.member"),
		}),
		removeSelectedMembers: t("orgUi.removeSelectedMembers"),
		removeSelectedMembersDescription: t(
			"orgUi.removeSelectedMembersDescription",
		),
		return: t("invite.continue"),
		role: t("common.role"),
		rowsPerPage: t("orgUi.rowsPerPage"),
		search: t("members.searchPlaceholder"),
		selectAllRows: t("orgUi.selectAllRows"),
		selectAtLeastOneRole: t("orgUi.selectAtLeastOneRole"),
		selectRoles: t("orgUi.selectRoles"),
		selectRow: t("orgUi.selectRow"),
		selectedCount: t("orgUi.selectedCount", { count: "{{count}}" }),
		selfRoleDisabled: t("members.selfRoleTooltip"),
		slug: t("settings.slug"),
		slugHint: t("onboarding.slugHint"),
		slugInvalid: t("form.errors.slugPattern"),
		slugPlaceholder: t("onboarding.slugPlaceholder"),
		status: t("members.status"),
		userInvitationsEmptyDescription: t("orgUi.userInvitationsEmpty"),
		verifyEmailToViewInvitations: t("orgUi.verifyEmail"),
		verifyEmailToViewInvitationsDescription: t("orgUi.verifyEmailDescription"),
	};
}
