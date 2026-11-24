import { Button } from "@workspace/ui/components/button";
import { DropdownMenuItem } from "@workspace/ui/components/dropdown-menu";
import { Clock3 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { RecurrenceDialog } from "@/features/recurrences/components/recurrence-dialog";
import { RecurrencesSheet } from "@/features/recurrences/components/recurrences-sheet";
import type {
	IssuePropertiesContext,
	ProjectPageContext,
	WebFeatureDecl,
} from "@/features/web-types";

function useRecurrencesSheet(context: ProjectPageContext) {
	const [open, setOpen] = useState(false);
	const sheet = (
		<RecurrencesSheet
			orgId={context.orgId}
			projectId={context.projectId}
			open={open}
			onOpenChange={setOpen}
			frozen={context.frozen}
		/>
	);
	return { sheet, open: () => setOpen(true) };
}

function ProjectRecurrencesButton(context: ProjectPageContext) {
	const { t } = useTranslation();
	const action = useRecurrencesSheet(context);
	return (
		<>
			<Button
				variant="outline"
				size="sm"
				className="hidden md:inline-flex"
				onClick={action.open}
			>
				<Clock3 className="size-4" />
				{t("recurrences.title")}
			</Button>
			{action.sheet}
		</>
	);
}

function ProjectRecurrencesMenuItem(context: ProjectPageContext) {
	const { t } = useTranslation();
	const action = useRecurrencesSheet(context);
	return (
		<>
			<DropdownMenuItem onClick={action.open}>
				<Clock3 className="size-4" />
				{t("recurrences.title")}
			</DropdownMenuItem>
			{action.sheet}
		</>
	);
}

/** "Make recurring" row in the issue properties menu (dialog included). */
function IssueRecurrenceAction(context: IssuePropertiesContext) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	return (
		<>
			<DropdownMenuItem
				disabled={context.disabled}
				onClick={() => setOpen(true)}
			>
				<Clock3 className="size-4" />
				{t("recurrences.makeRecurring")}
			</DropdownMenuItem>
			<RecurrenceDialog
				open={open}
				onOpenChange={setOpen}
				orgId={context.orgId}
				projectId={context.projectId}
				issueId={context.issueId}
				issueKey={`${context.projectKey}-$context.issueNumber`}
			/>
		</>
	);
}

/** Recurrences: project sheet, issue action and their strings. */
export const recurrencesWeb: WebFeatureDecl = {
	id: "recurrences",
	i18nNamespaces: ["recurrences"],
	projectHeaderActions: [
		{ id: "recurrences", order: 40, component: ProjectRecurrencesButton },
	],
	projectMenuItems: [
		{ id: "recurrences", order: 40, component: ProjectRecurrencesMenuItem },
	],
	issuePropertiesActions: [
		{ id: "recurrence", order: 10, component: IssueRecurrenceAction },
	],
};
