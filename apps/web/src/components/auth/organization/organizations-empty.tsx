import { useAuthPlugin } from "@better-auth-ui/react";
import { Button } from "@workspace/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@workspace/ui/components/empty";
import { Briefcase } from "lucide-react";
import { organizationPlugin } from "@/lib/auth/organization-plugin";

export type OrganizationsEmptyProps = {
	onCreatePress: () => void;
	canCreate?: boolean;
};

export function OrganizationsEmpty({
	onCreatePress,
	canCreate = true,
}: OrganizationsEmptyProps) {
	const { localization: organizationLocalization } =
		useAuthPlugin(organizationPlugin);

	return (
		<Empty>
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<Briefcase />
				</EmptyMedia>
				<EmptyTitle>{organizationLocalization.noOrganizations}</EmptyTitle>
				<EmptyDescription>
					{organizationLocalization.organizationsDescription}
				</EmptyDescription>
			</EmptyHeader>
			<EmptyContent>
				<Button size="sm" disabled={!canCreate} onClick={onCreatePress}>
					{organizationLocalization.createOrganization}
				</Button>
			</EmptyContent>
		</Empty>
	);
}
