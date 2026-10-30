import type { OrganizationAuthClient } from "@better-auth-ui/core/plugins/organization";
import { useAuth, useSession } from "@better-auth-ui/react";
import { useListUserInvitations } from "@better-auth-ui/react/plugins/organization";
import { useNavigate } from "@tanstack/react-router";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card";
import { useTranslation } from "react-i18next";
import { CreateOrganizationForm } from "@/components/auth/organization/create-organization-dialog";
import { UserInvitations } from "@/components/auth/organization/user-invitations";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserDropdown } from "@/components/user-dropdown";
import { useSession as useAppSession } from "@/features/auth/data";
import { useDocumentTitle } from "@/lib/use-document-title";

export function OnboardingPage() {
	const { t } = useTranslation();
	useDocumentTitle(t("onboarding.title"));
	const navigate = useNavigate();
	const { data: session } = useAppSession();
	const { authClient } = useAuth<OrganizationAuthClient>();
	const librarySession = useSession(authClient);
	const emailVerified = librarySession.data?.user.emailVerified === true;
	const { data: invitations } = useListUserInvitations(authClient, {
		enabled: emailVerified,
	});
	const hasInvitations = emailVerified && (invitations?.length ?? 0) > 0;

	const openOrganization = async (orgId: string) => {
		await navigate({
			to: "/orgs/$orgId/projects",
			params: { orgId },
			replace: true,
		});
	};

	return (
		<div className="flex min-h-svh items-center justify-center p-6">
			<div className="absolute top-4 right-4 flex items-center gap-1">
				{session && <UserDropdown user={session.user} />}
				<LanguageSwitcher />
				<ThemeToggle />
			</div>
			<Card className="w-full max-w-sm">
				<CardHeader>
					<Logo className="pb-2" />
					<CardTitle>{t("onboarding.title")}</CardTitle>
					<CardDescription>{t("onboarding.description")}</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					{hasInvitations && (
						<>
							<UserInvitations
								onAccepted={(invitation) =>
									openOrganization(invitation.organizationId)
								}
							/>
							<div className="flex items-center gap-2">
								<span className="bg-border h-px flex-1" />
								<span className="text-muted-foreground text-xs">
									{t("onboarding.orCreate")}
								</span>
								<span className="bg-border h-px flex-1" />
							</div>
						</>
					)}
					<CreateOrganizationForm
						onCreated={(organization) => openOrganization(organization.id)}
					/>
				</CardContent>
			</Card>
		</div>
	);
}
