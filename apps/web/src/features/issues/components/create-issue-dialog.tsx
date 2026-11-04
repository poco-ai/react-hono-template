import type { StatusDto } from "@api/dto/status.dto";
import { useQuery } from "@tanstack/react-query";
import {
	createIssueSchema,
	ISSUE_PRIORITIES,
	type IssuePriorityName,
} from "@workspace/shared";
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
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
	InputGroupText,
} from "@workspace/ui/components/input-group";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { MarkdownEditor } from "@/components/markdown-editor";
import { MultiSelect } from "@/components/multi-select";
import { MutationError } from "@/components/mutation-error";
import type { CycleWithProgressDto } from "@/features/cycles/data";
import { DateField } from "@/features/issues/components/date-field";
import { PriorityBadge } from "@/features/issues/components/priority-badge";
import { StatusBadge } from "@/features/issues/components/status-badge";
import { buildCreateIssueInput } from "@/features/issues/create-issue-input";
import {
	applyIssueTemplate,
	templatesForProject,
} from "@/features/templates/apply";
import { issueTemplatesQuery } from "@/features/templates/data";
import {
	type FieldErrors,
	fieldErrorsFromZod,
	focusFirstInvalidField,
	withoutFieldError,
} from "@/lib/form";
import { useCreateIssue } from "../data";

const UNASSIGNED = "__unassigned__";
const NO_CYCLE = "__no_cycle__";
const NO_TEMPLATE = "__no_template__";

export function CreateIssueDialog({
	orgId,
	projectId,
	open,
	onOpenChange,
	defaultStatusId,
	defaultCycleId,
	parentId,
	members,
	labels,
	statuses,
	cycles,
}: {
	orgId: string;
	projectId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	defaultStatusId?: string;
	/**
	 * Preselected cycle (e.g. when the list is filtered by a cycle), so the new
	 * issue stays visible in the current list.
	 */
	defaultCycleId?: string;
	/** When set, the new issue is created as a sub-issue of this issue. */
	parentId?: string;
	members: { userId: string; user: { name: string } }[];
	labels: { id: string; name: string }[];
	statuses: StatusDto[];
	/** Project cycles offered for planning; omitted by callers without them. */
	cycles?: CycleWithProgressDto[];
}) {
	const { t } = useTranslation();
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [statusId, setStatusId] = useState<string | undefined>(defaultStatusId);
	const [priority, setPriority] = useState<IssuePriorityName>("none");
	const [assigneeId, setAssigneeId] = useState(UNASSIGNED);
	const [labelIds, setLabelIds] = useState<string[]>([]);
	const [dueDate, setDueDate] = useState("");
	const [estimate, setEstimate] = useState("");
	const [cycleId, setCycleId] = useState(defaultCycleId ?? NO_CYCLE);
	const [templateId, setTemplateId] = useState(NO_TEMPLATE);
	const [appliedTemplateName, setAppliedTemplateName] = useState<string | null>(
		null,
	);
	const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

	const templates = useQuery({
		...issueTemplatesQuery(orgId),
		enabled: open,
	});
	const projectTemplates = templatesForProject(templates.data, projectId);

	/** Selecting a template overrides the prefill fields; every field stays editable. */
	const onTemplateChange = (value: string) => {
		setTemplateId(value);
		const template = projectTemplates.find((item) => item.id === value);
		if (!template) {
			setAppliedTemplateName(null);
			return;
		}
		const next = applyIssueTemplate(
			{
				title,
				description,
				statusId,
				priority,
				assigneeId: assigneeId === UNASSIGNED ? undefined : assigneeId,
				labelIds,
				dueDate,
				estimate,
				cycleId: cycleId === NO_CYCLE ? undefined : cycleId,
			},
			template,
			{ availableLabelIds: labels.map((label) => label.id) },
		);
		setTitle(next.title);
		setDescription(next.description);
		setStatusId(next.statusId);
		setPriority(next.priority);
		setLabelIds(next.labelIds);
		setEstimate(next.estimate);
		setAppliedTemplateName(template.name);
		setFieldErrors({});
	};

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
			setStatusId(defaultStatusId);
			setPriority("none");
			setAssigneeId(UNASSIGNED);
			setLabelIds([]);
			setDueDate("");
			setEstimate("");
			setCycleId(defaultCycleId ?? NO_CYCLE);
			setTemplateId(NO_TEMPLATE);
			setAppliedTemplateName(null);
			setFieldErrors({});
		}
	}, [open, defaultStatusId, defaultCycleId]);

	const createMutation = useCreateIssue(orgId, projectId);

	const onSubmit = () => {
		const parsed = createIssueSchema.safeParse(
			buildCreateIssueInput(
				{
					title,
					description,
					statusId,
					priority,
					assigneeId: assigneeId === UNASSIGNED ? undefined : assigneeId,
					labelIds,
					dueDate,
					estimate,
					cycleId: cycleId === NO_CYCLE ? undefined : cycleId,
				},
				{ parentId },
			),
		);
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
					<DialogTitle>
						{parentId
							? t("issues.subIssues.createTitle")
							: t("issues.createTitle")}
					</DialogTitle>
					<DialogDescription>
						{parentId
							? t("issues.subIssues.createDescription")
							: t("issues.createDescription")}
					</DialogDescription>
				</DialogHeader>
				<form
					noValidate
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						onSubmit();
					}}
				>
					{projectTemplates.length > 0 && (
						<Field>
							<FieldLabel>{t("issues.templates.label")}</FieldLabel>
							<Select
								value={templateId}
								onValueChange={(value) => value && onTemplateChange(value)}
							>
								<SelectTrigger className="w-full">
									<SelectValue>
										{templateId === NO_TEMPLATE
											? t("issues.templates.none")
											: (projectTemplates.find(
													(template) => template.id === templateId,
												)?.name ?? t("issues.templates.none"))}
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={NO_TEMPLATE}>
										{t("issues.templates.none")}
									</SelectItem>
									{projectTemplates.map((template) => (
										<SelectItem key={template.id} value={template.id}>
											{template.projectId === null
												? `${template.name} · ${t("templates.orgWide")}`
												: template.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{appliedTemplateName && (
								<FieldDescription>
									{t("issues.templates.applied", {
										name: appliedTemplateName,
									})}
								</FieldDescription>
							)}
						</Field>
					)}
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
						<MarkdownEditor
							id="issue-description"
							value={description}
							onChange={(next) => {
								setDescription(next);
								setFieldErrors((prev) =>
									withoutFieldError(prev, "description"),
								);
							}}
							placeholder={t("issues.descriptionPlaceholder")}
							ariaInvalid={Boolean(fieldErrors.description)}
							ariaDescribedBy={
								fieldErrors.description ? "issue-description-error" : undefined
							}
						/>
						<FieldError id="issue-description-error">
							{fieldErrors.description}
						</FieldError>
					</Field>
					<div className="grid grid-cols-2 gap-4">
						<Field>
							<FieldLabel>{t("issues.status")}</FieldLabel>
							<Select
								value={statusId ?? null}
								onValueChange={(value) => value && setStatusId(value)}
							>
								<SelectTrigger className="w-full">
									<SelectValue>
										{statuses.find((status) => status.id === statusId)?.name ??
											t("issues.status")}
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
							<InputGroup>
								<InputGroupInput
									type="number"
									min={0}
									max={100}
									step={1}
									value={estimate}
									onChange={(e) => setEstimate(e.target.value)}
								/>
								<InputGroupAddon align="inline-end">
									<InputGroupText>{t("issues.estimateUnit")}</InputGroupText>
								</InputGroupAddon>
							</InputGroup>
							<FieldDescription>{t("issues.estimateHint")}</FieldDescription>
							{!estimateValid && (
								<FieldError>{t("issues.estimateInvalid")}</FieldError>
							)}
						</Field>
					</div>
					{cycles && cycles.length > 0 && (
						<Field>
							<FieldLabel>{t("issues.cycle")}</FieldLabel>
							<Select
								value={cycleId}
								onValueChange={(value) => value && setCycleId(value)}
							>
								<SelectTrigger className="w-full">
									<SelectValue>
										{cycleId === NO_CYCLE
											? t("issues.noCycle")
											: (cycles.find((cycle) => cycle.id === cycleId)?.name ??
												t("issues.noCycle"))}
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={NO_CYCLE}>
										{t("issues.noCycle")}
									</SelectItem>
									{cycles.map((cycle) => (
										<SelectItem key={cycle.id} value={cycle.id}>
											{cycle.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>
					)}
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
						<MutationError error={createMutation.error} />
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
