import type { ActivityDto } from "@api/dto/activity.dto";
import type { LabelDto } from "@api/dto/label.dto";
import { ISSUE_STATUSES, type IssueStatus } from "@workspace/shared";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { formatDueDate, priorityName } from "@/lib/issue-utils";
import type { OrgMember } from "@/lib/queries/members";

export function ActivitySentence({
	activity,
	members,
	labels,
}: {
	activity: ActivityDto;
	members: OrgMember[];
	labels: LabelDto[];
}) {
	const { t } = useTranslation();
	const memberById = new Map(members.map((member) => [member.userId, member]));
	const labelById = new Map(labels.map((label) => [label.id, label]));
	const name = activity.actor.name;

	const fieldLabel = (field: string): string => {
		switch (field) {
			case "title":
				return t("activity.fields.title");
			case "description":
				return t("activity.fields.description");
			case "status":
				return t("activity.fields.status");
			case "priority":
				return t("activity.fields.priority");
			case "assigneeId":
				return t("activity.fields.assignee");
			case "labels":
				return t("activity.fields.labels");
			case "dueDate":
				return t("activity.fields.dueDate");
			default:
				return field;
		}
	};

	const displayValue = (field: string, value: string | null): string => {
		switch (field) {
			case "status":
				return (ISSUE_STATUSES as readonly string[]).includes(value ?? "")
					? t(`issues.statuses.${value as IssueStatus}`)
					: t("activity.emptyValue");
			case "priority": {
				const parsed = Number(value);
				return Number.isInteger(parsed)
					? t(`issues.priorities.${priorityName(parsed)}`)
					: t("activity.emptyValue");
			}
			case "assigneeId":
				if (!value) {
					return t("common.unassigned");
				}
				return memberById.get(value)?.user.name ?? t("activity.unknownUser");
			case "labels": {
				if (!value) {
					return t("activity.emptyValue");
				}
				const names = value
					.split(",")
					.map((id) => labelById.get(id)?.name)
					.filter(Boolean);
				return names.length > 0 ? names.join(", ") : t("activity.emptyValue");
			}
			case "dueDate":
				return formatDueDate(value) || t("activity.emptyValue");
			default:
				return value ?? "";
		}
	};

	let sentence: ReactNode;
	if (activity.action === "issue.created") {
		sentence = t("activity.issue.created", { name });
	} else if (activity.action === "issue.deleted") {
		sentence = t("activity.issue.deleted", { name });
	} else if (activity.action === "comment.created") {
		sentence = t("activity.comment.created", { name });
	} else if (activity.action === "attachment.added") {
		sentence = t("activity.attachment.added", {
			name,
			filename: activity.newValue ?? "",
		});
	} else if (activity.action === "attachment.removed") {
		sentence = t("activity.attachment.removed", {
			name,
			filename: activity.newValue ?? "",
		});
	} else if (activity.action === "issue.updated" && activity.field) {
		const field = activity.field;
		sentence =
			field === "description"
				? t("activity.issue.descriptionChanged", { name })
				: t("activity.issue.updated", {
						name,
						field: fieldLabel(field),
						from: displayValue(field, activity.oldValue),
						to: displayValue(field, activity.newValue),
					});
	} else {
		sentence = t("activity.unknownAction", { action: activity.action });
	}

	return <span className="text-sm">{sentence}</span>;
}
