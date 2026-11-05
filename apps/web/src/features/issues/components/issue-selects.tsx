import type { StatusDto } from "@api/dto/status.dto";
import {
	ISSUE_PRIORITIES,
	type IssuePriorityName,
	priorityName,
	priorityValue,
} from "@workspace/shared";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import { useTranslation } from "react-i18next";
import { UserAvatar } from "@/components/user-avatar";
import { PriorityBadge } from "./priority-badge";
import { StatusBadge } from "./status-badge";

/** Sentinel used as the item value for "no assignee" (null is not an item value). */
const UNASSIGNED = "__unassigned__";
/**
 * Internal value for "nothing selected". Using a non-null sentinel keeps the
 * trigger styled like a value (not a muted placeholder) while matching no item,
 * so action-style selects (bulk bar) open with nothing preselected.
 */
const EMPTY = "__issue_select_empty__";

export function IssueStatusSelect({
	statuses,
	value,
	onChange,
	disabled,
	placeholder,
	triggerClassName,
	showBadge = true,
	fallbackStatus,
	noSelection = false,
}: {
	statuses: StatusDto[];
	value: string | null;
	onChange: (value: string) => void;
	disabled?: boolean;
	/** Shown when no status is selected; defaults to the "Status" label. */
	placeholder?: string;
	triggerClassName?: string;
	/** Badge in the trigger; popup items always render the status badge. */
	showBadge?: boolean;
	/** Rendered when `statuses` does not contain the current id (e.g. not loaded). */
	fallbackStatus?: StatusDto;
	/**
	 * Treat "no value" as an action placeholder: the trigger keeps the normal
	 * (non-muted) text color and no popup item is preselected.
	 */
	noSelection?: boolean;
}) {
	const { t } = useTranslation();
	const fallback = placeholder ?? t("issues.status");

	return (
		<Select
			value={value ?? (noSelection ? EMPTY : null)}
			disabled={disabled}
			onValueChange={(next) => {
				if (typeof next === "string" && next.length > 0 && next !== EMPTY) {
					onChange(next);
				}
			}}
		>
			<SelectTrigger className={triggerClassName} disabled={disabled}>
				<SelectValue>
					{(current: string | null) => {
						const status =
							current && current !== EMPTY
								? (statuses.find((entry) => entry.id === current) ??
									fallbackStatus)
								: undefined;
						if (!status) {
							return fallback;
						}
						return showBadge ? <StatusBadge status={status} /> : status.name;
					}}
				</SelectValue>
			</SelectTrigger>
			<SelectContent>
				{statuses.map((status) => (
					<SelectItem key={status.id} value={status.id}>
						<StatusBadge status={status} />
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

export function IssuePrioritySelect({
	value,
	onChange,
	disabled,
	placeholder,
	triggerClassName,
	showBadge = true,
	noSelection = false,
}: {
	value: number | null;
	onChange: (value: number) => void;
	disabled?: boolean;
	/** Shown when no priority is selected; defaults to the "Priority" label. */
	placeholder?: string;
	triggerClassName?: string;
	/** Badge in the trigger; popup items always render the priority badge. */
	showBadge?: boolean;
	/** See `IssueStatusSelect.noSelection`. */
	noSelection?: boolean;
}) {
	const { t } = useTranslation();
	const fallback = placeholder ?? t("issues.priority");
	const selected = value === null ? null : priorityName(value);

	return (
		<Select
			value={selected ?? (noSelection ? EMPTY : null)}
			disabled={disabled}
			onValueChange={(next) => {
				if (typeof next === "string" && next !== EMPTY) {
					onChange(priorityValue(next as IssuePriorityName));
				}
			}}
		>
			<SelectTrigger className={triggerClassName} disabled={disabled}>
				<SelectValue>
					{(current: string | null) => {
						const option = ISSUE_PRIORITIES.find(
							(entry) => entry.name === current,
						);
						if (!option) {
							return fallback;
						}
						return showBadge ? (
							<PriorityBadge value={option.value} />
						) : (
							t(`issues.priorities.${option.name}`)
						);
					}}
				</SelectValue>
			</SelectTrigger>
			<SelectContent>
				{ISSUE_PRIORITIES.map(({ name, value: priority }) => (
					<SelectItem key={name} value={name}>
						<PriorityBadge value={priority} />
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

export type IssueAssignee = {
	userId: string;
	user: { name: string; image?: string | null };
};

export function IssueAssigneeSelect({
	members,
	value,
	onChange,
	disabled,
	placeholder,
	triggerClassName,
	showAvatar = true,
	noSelection = false,
}: {
	members: IssueAssignee[];
	value: string | null;
	onChange: (value: string | null) => void;
	disabled?: boolean;
	/** Shown when nobody is assigned; defaults to "Unassigned". */
	placeholder?: string;
	triggerClassName?: string;
	/** Avatar in the trigger and popup items. */
	showAvatar?: boolean;
	/** See `IssueStatusSelect.noSelection`. */
	noSelection?: boolean;
}) {
	const { t } = useTranslation();
	const fallback = placeholder ?? t("common.unassigned");

	return (
		<Select
			value={value ?? (noSelection ? EMPTY : UNASSIGNED)}
			disabled={disabled}
			onValueChange={(next) => {
				if (typeof next === "string" && next !== EMPTY) {
					onChange(next === UNASSIGNED ? null : next);
				}
			}}
		>
			<SelectTrigger className={triggerClassName} disabled={disabled}>
				<SelectValue>
					{(current: string | null) => {
						const member =
							current && current !== UNASSIGNED && current !== EMPTY
								? members.find((entry) => entry.userId === current)
								: undefined;
						if (!member) {
							return fallback;
						}
						return (
							<span className="flex min-w-0 items-center gap-1.5">
								{showAvatar ? (
									<UserAvatar
										name={member.user.name}
										image={member.user.image}
									/>
								) : null}
								<span className="truncate">{member.user.name}</span>
							</span>
						);
					}}
				</SelectValue>
			</SelectTrigger>
			<SelectContent>
				<SelectItem value={UNASSIGNED}>{t("common.unassigned")}</SelectItem>
				{members.map((member) => (
					<SelectItem key={member.userId} value={member.userId}>
						{showAvatar ? (
							<span className="flex items-center gap-2">
								<UserAvatar name={member.user.name} image={member.user.image} />
								{member.user.name}
							</span>
						) : (
							member.user.name
						)}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
