import {
	createIssueSchema,
	ISSUE_PRIORITIES,
	ISSUE_STATUSES,
	type IssuePriorityName,
	type IssueStatus,
	priorityValue,
} from "@workspace/shared";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldLabel,
} from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import { Textarea } from "@workspace/ui/components/textarea";
import { cn } from "@workspace/ui/lib/utils";
import { CircleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { MarkdownContent } from "@/components/markdown";
import { MultiSelect } from "@/components/multi-select";
import { DateField } from "@/features/issues/components/date-field";
import { PriorityBadge } from "@/features/issues/components/priority-badge";
import { StatusBadge } from "@/features/issues/components/status-badge";
import { apiErrorMessage } from "@/lib/errors";
import {
	type FieldErrors,
	fieldErrorsFromZod,
	focusFirstInvalidField,
	withoutFieldError,
} from "@/lib/form";
import { fromDateInputValue } from "@/lib/format";
import { useCreateIssue } from "../data";

const UNASSIGNED = "__unassigned__";

export function CreateIssueDialog({
	orgId,
	projectId,
	open,
	onOpenChange,
	defaultStatus,
	members,
	labels,
}: {
	orgId: string;
	projectId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	defaultStatus: IssueStatus;
	members: { userId: string; user: { name: string } }[];
	labels: { id: string; name: string }[];
}) {
	const { t } = useTranslation();
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [descTab, setDescTab] = useState<"write" | "preview">("write");
	const [status, setStatus] = useState<IssueStatus>(defaultStatus);
	const [priority, setPriority] = useState<IssuePriorityName>("none");
	const [assigneeId, setAssigneeId] = useState(UNASSIGNED);
	const [labelIds, setLabelIds] = useState<string[]>([]);
	const [dueDate, setDueDate] = useState("");
	const [estimate, setEstimate] = useState("");
	const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

	const estimateNumber = estimate === "" ? undefined : Number(estimate);
	const estimateValid =
		estimateNumber === undefined ||
		(Number.isInteger(estimateNumber) &&
			estimateNumber >= 0 &&
			estimateNumber <= 100);

	useEffect(() => {
		if (open) {
			setTitle("");
			setDescription("");
			setDescTab("write");
			setStatus(defaultStatus);
			setPriority("none");
			setAssigneeId(UNASSIGNED);
			setLabelIds([]);
			setDueDate("");
			setEstimate("");
			setFieldErrors({});
		}
	}, [open, defaultStatus]);

	const createMutation = useCreateIssue(orgId, projectId);

	const onSubmit = () => {
		const parsedEstimate = estimate === "" ? undefined : Number(estimate);
		const parsed = createIssueSchema.safeParse({
			title: title.trim(),
			description: description.trim() || undefined,
			status,
			priority: priorityValue(priority),
			assigneeId: assigneeId === UNASSIGNED ? undefined : assigneeId,
			labelIds: labelIds.length > 0 ? labelIds : undefined,
			dueDate: fromDateInputValue(dueDate) ?? undefined,
			estimate:
				parsedEstimate !== undefined &&
				Number.isInteger(parsedEstimate) &&
				parsedEstimate >= 0
					? parsedEstimate
					: undefined,
		});
		if (!parsed.success) {
			const errors = fieldErrorsFromZod(parsed.error, t);
			setFieldErrors(errors);
			focusFirstInvalidField(errors, {
				title: "issue-title",
				description: "issue-description",
			});
			return;
		}
		createMutation.mutate(parsed.data, {
			onSuccess: () => {
				toast.success(t("toast.issueCreated"));
				onOpenChange(false);
			},
		});
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{t("issues.createTitle")}</DialogTitle>
					<DialogDescription>{t("issues.createDescription")}</DialogDescription>
				</DialogHeader>
				<form
					noValidate
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						onSubmit();
					}}
				>
					<Field data-invalid={fieldErrors.title ? true : undefined}>
						<FieldLabel htmlFor="issue-title">
							{t("issues.titleField")}
						</FieldLabel>
						<Input
							id="issue-title"
							value={title}
							placeholder={t("issues.titlePlaceholder")}
							onChange={(e) => {
								setTitle(e.target.value);
								setFieldErrors((prev) => withoutFieldError(prev, "title"));
							}}
							aria-invalid={fieldErrors.title ? true : undefined}
							aria-describedby={
								fieldErrors.title ? "issue-title-error" : undefined
							}
						/>
						<FieldError id="issue-title-error">{fieldErrors.title}</FieldError>
					</Field>
					<Field data-invalid={fieldErrors.description ? true : undefined}>
						<FieldLabel htmlFor="issue-description">
							{t("common.description")}
							<span className="text-muted-foreground">
								{" "}
								({t("common.optional")})
							</span>
						</FieldLabel>
						<div className="rounded-lg border">
							<div className="border-b flex items-center gap-1 px-2 pt-1.5">
								{(["write", "preview"] as const).map((value) => (
									<button
										key={value}
										type="button"
										className={cn(
											"rounded-md px-2 py-1 text-xs font-medium",
											descTab === value
												? "bg-accent text-accent-foreground"
												: "text-muted-foreground hover:text-foreground",
										)}
										onClick={() => setDescTab(value)}
									>
										{t(`common.${value}`)}
									</button>
								))}
							</div>
							{descTab === "write" ? (
								<>
									<Textarea
										id="issue-description"
										value={description}
										placeholder={t("issues.descriptionPlaceholder")}
										onChange={(e) => {
											setDescription(e.target.value);
											setFieldErrors((prev) =>
												withoutFieldError(prev, "description"),
											);
										}}
										className="resize-y border-0 focus-visible:ring-0"
										aria-invalid={fieldErrors.description ? true : undefined}
										aria-describedby={
											fieldErrors.description
												? "issue-description-error"
												: undefined
										}
									/>
									<p className="text-muted-foreground px-3 pb-2 text-xs">
										{t("markdown.hint")}
									</p>
								</>
							) : (
								<div className="min-h-24 px-3 py-2">
									{description.trim() ? (
										<MarkdownContent>{description}</MarkdownContent>
									) : (
										<p className="text-muted-foreground text-sm">
											{t("comments.previewEmpty")}
										</p>
									)}
								</div>
							)}
						</div>
						<FieldError id="issue-description-error">
							{fieldErrors.description}
						</FieldError>
					</Field>
					<div className="grid grid-cols-2 gap-4">
						<Field>
							<FieldLabel>{t("issues.status")}</FieldLabel>
							<Select
								value={status}
								onValueChange={(v) => v && setStatus(v as IssueStatus)}
							>
								<SelectTrigger className="w-full">
									<SelectValue>{t(`issues.statuses.${status}`)}</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{ISSUE_STATUSES.map((s) => (
										<SelectItem key={s} value={s}>
											<StatusBadge status={s} />
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>
						<Field>
							<FieldLabel>{t("issues.priority")}</FieldLabel>
							<Select
								value={priority}
								onValueChange={(v) => v && setPriority(v as IssuePriorityName)}
							>
								<SelectTrigger className="w-full">
									<SelectValue>
										{t(`issues.priorities.${priority}`)}
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{ISSUE_PRIORITIES.map(({ name, value }) => (
										<SelectItem key={name} value={name}>
											<PriorityBadge value={value} />
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>
						<Field>
							<FieldLabel>{t("issues.assignee")}</FieldLabel>
							<Select
								value={assigneeId}
								onValueChange={(v) => v !== null && setAssigneeId(v)}
							>
								<SelectTrigger className="w-full">
									<SelectValue>
										{assigneeId === UNASSIGNED
											? t("common.unassigned")
											: (members.find((m) => m.userId === assigneeId)?.user
													.name ?? t("common.unassigned"))}
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={UNASSIGNED}>
										{t("common.unassigned")}
									</SelectItem>
									{members.map((member) => (
										<SelectItem key={member.userId} value={member.userId}>
											{member.user.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>
						<Field>
							<FieldLabel>{t("issues.dueDate")}</FieldLabel>
							<DateField value={dueDate} onChange={setDueDate} />
						</Field>
						<Field data-invalid={!estimateValid ? true : undefined}>
							<FieldLabel>{t("issues.estimate")}</FieldLabel>
							<div className="relative">
								<Input
									type="number"
									min={0}
									max={100}
									step={1}
									value={estimate}
									onChange={(e) => setEstimate(e.target.value)}
									className="pr-16"
								/>
								<span className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs">
									{t("issues.estimateUnit")}
								</span>
							</div>
							<FieldDescription>{t("issues.estimateHint")}</FieldDescription>
							{!estimateValid && (
								<FieldError>{t("issues.estimateInvalid")}</FieldError>
							)}
						</Field>
					</div>
					<Field>
						<FieldLabel>{t("issues.labels")}</FieldLabel>
						<MultiSelect
							placeholder={t("issues.noLabels")}
							value={labelIds}
							options={labels.map((label) => ({
								value: label.id,
								label: label.name,
							}))}
							onChange={setLabelIds}
						/>
					</Field>
					{createMutation.isError && (
						<Alert variant="destructive">
							<CircleAlert />
							<AlertDescription>
								{apiErrorMessage(t, createMutation.error)}
							</AlertDescription>
						</Alert>
					)}
					<DialogFooter>
						<Button
							type="submit"
							disabled={createMutation.isPending || !estimateValid}
						>
							{t("common.create")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
