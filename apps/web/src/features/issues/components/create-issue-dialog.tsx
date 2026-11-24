import type { StatusDto } from "@api/features/statuses/dto/status.dto";
import { useStore } from "@tanstack/react-form";
import {
	type CreateIssueInput,
	createIssueSchema,
	type IssuePriorityName,
	priorityName,
	priorityValue,
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
import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { MarkdownEditor } from "@/components/markdown-editor";
import { MultiSelect } from "@/components/multi-select";
import { MutationError } from "@/components/mutation-error";
import { IssueDueDateField } from "@/features/issues/components/issue-due-date-field";
import {
	IssueAssigneeSelect,
	IssuePrioritySelect,
	IssueStatusSelect,
} from "@/features/issues/components/issue-selects";
import {
	buildCreateIssueInput,
	type CreateIssueFormState,
} from "@/features/issues/create-issue-input";
import { webIssueExtras } from "@/features/registry";
import type {
	IssueCycleOption,
	IssueTemplatesExtras,
} from "@/features/web-types";
import { useZodForm } from "@/lib/use-zod-form";
import { useCreateIssue } from "../data";

const NO_CYCLE = "__no_cycle__";
const NO_TEMPLATE = "__no_template__";

const NO_TEMPLATES: IssueTemplatesExtras = {
	options: [],
	prefill: () => null,
};

function useNoIssueTemplates(): IssueTemplatesExtras {
	return NO_TEMPLATES;
}

/**
 * Dialog form values. `assigneeId` uses `null` (not `undefined`) for
 * "unassigned" so the select value always has a concrete type; `cycleId` keeps
 * the `NO_CYCLE` sentinel. `toCreateIssueFormState` maps both back to the
 * `CreateIssueFormState` shape the input/template builders expect.
 */
type CreateIssueFormValues = {
	title: string;
	description: string;
	statusId: string | undefined;
	priority: IssuePriorityName;
	assigneeId: string | null;
	labelIds: string[];
	dueDate: string;
	estimate: string;
	cycleId: string;
};

const toCreateIssueFormState = (
	values: CreateIssueFormValues,
): CreateIssueFormState => ({
	title: values.title,
	description: values.description,
	statusId: values.statusId,
	priority: values.priority,
	assigneeId: values.assigneeId ?? undefined,
	labelIds: values.labelIds,
	dueDate: values.dueDate,
	estimate: values.estimate,
	cycleId: values.cycleId === NO_CYCLE ? undefined : values.cycleId,
});

const formDefaults = (
	defaultStatusId?: string,
	defaultCycleId?: string,
): CreateIssueFormValues => ({
	title: "",
	description: "",
	statusId: defaultStatusId,
	priority: "none",
	assigneeId: null,
	labelIds: [],
	dueDate: "",
	estimate: "",
	cycleId: defaultCycleId ?? NO_CYCLE,
});

const INPUT_IDS = { title: "issue-title", description: "issue-description" };

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
	cycles?: IssueCycleOption[];
}) {
	const { t } = useTranslation();
	// The mobile layout pins the footer outside the scrollable form; the id
	// lets the submit button target the form across that boundary.
	const formId = useId();
	const [templateId, setTemplateId] = useState(NO_TEMPLATE);
	const [appliedTemplateName, setAppliedTemplateName] = useState<string | null>(
		null,
	);

	const useTemplates = webIssueExtras().useTemplates ?? useNoIssueTemplates;
	const templates = useTemplates(orgId, projectId, open);
	const projectTemplates = templates.options;

	const createMutation = useCreateIssue(orgId, projectId);

	const { form, fieldErrors, handleSubmit, reset } = useZodForm<
		CreateIssueFormValues,
		CreateIssueInput
	>({
		defaultValues: formDefaults(defaultStatusId, defaultCycleId),
		schema: z.preprocess((values) => {
			// Guard non-object input so the wrapper cannot throw before zod gets a
			// chance to report validation issues.
			if (!values || typeof values !== "object") {
				return values;
			}
			return buildCreateIssueInput(
				toCreateIssueFormState(values as CreateIssueFormValues),
				{ parentId },
			);
		}, createIssueSchema),
		onSubmit: (values) => {
			createMutation.mutate(values, {
				onSuccess: () => {
					toast.success(t("toast.issueCreated"));
					onOpenChange(false);
				},
			});
		},
		t,
		inputIds: INPUT_IDS,
	});

	const statusId = useStore(form.store, (state) => state.values.statusId);
	const priority = useStore(form.store, (state) => state.values.priority);
	const assigneeId = useStore(form.store, (state) => state.values.assigneeId);
	const dueDate = useStore(form.store, (state) => state.values.dueDate);
	const estimate = useStore(form.store, (state) => state.values.estimate);
	const cycleId = useStore(form.store, (state) => state.values.cycleId);
	const labelIds = useStore(form.store, (state) => state.values.labelIds);

	/** Selecting a template overrides the prefill fields; every field stays editable. */
	const onTemplateChange = (value: string) => {
		setTemplateId(value);
		const template = projectTemplates.find((item) => item.id === value);
		if (!template) {
			setAppliedTemplateName(null);
			return;
		}
		// Event handlers read the live form store; the subsequent change also
		// clears any previously submitted error map (see useZodForm).
		const current = form.state.values;
		const next = templates.prefill(
			value,
			{
				title: current.title,
				description: current.description,
				statusId: current.statusId,
				priority: current.priority,
				labelIds: current.labelIds,
				estimate: current.estimate,
			},
			labels.map((label) => label.id),
		);
		if (!next) {
			setAppliedTemplateName(null);
			return;
		}
		form.setFieldValue("title", next.title);
		form.setFieldValue("description", next.description);
		form.setFieldValue("statusId", next.statusId);
		form.setFieldValue("priority", next.priority);
		form.setFieldValue("labelIds", next.labelIds);
		form.setFieldValue("estimate", next.estimate);
		setAppliedTemplateName(template.name);
	};

	const estimateNumber = estimate === "" ? undefined : Number(estimate);
	const estimateValid =
		estimateNumber === undefined ||
		(Number.isInteger(estimateNumber) &&
			estimateNumber >= 0 &&
			estimateNumber <= 100);

	useEffect(() => {
		if (open) {
			reset(formDefaults(defaultStatusId, defaultCycleId));
			setTemplateId(NO_TEMPLATE);
			setAppliedTemplateName(null);
		}
	}, [open, defaultStatusId, defaultCycleId, reset]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				// md (not sm) for the width cap: sm:max-w-lg would beat the
				// max-md fullscreen overrides in CSS order at 640–768px.
				className={
					"md:max-w-lg max-md:top-0 max-md:left-0 max-md:h-svh max-md:max-h-svh max-md:max-w-full max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none max-md:border-0 max-md:p-0 max-md:ring-0 max-md:grid-rows-[auto_minmax(0,1fr)_auto]"
				}
			>
				<DialogHeader className="max-md:px-4 max-md:pt-4">
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
					id={formId}
					noValidate
					className="flex flex-col gap-4 max-md:min-h-0 max-md:overflow-y-auto max-md:px-4 max-md:pb-4"
					onSubmit={handleSubmit}
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
											{template.label}
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
					<form.Field name="title">
						{(field) => (
							<Field data-invalid={fieldErrors.title ? true : undefined}>
								<FieldLabel htmlFor="issue-title">
									{t("issues.titleField")}
								</FieldLabel>
								<Input
									id="issue-title"
									value={field.state.value}
									placeholder={t("issues.titlePlaceholder")}
									onChange={(e) => field.handleChange(e.target.value)}
									aria-invalid={fieldErrors.title ? true : undefined}
									aria-describedby={
										fieldErrors.title ? "issue-title-error" : undefined
									}
								/>
								<FieldError id="issue-title-error">
									{fieldErrors.title}
								</FieldError>
							</Field>
						)}
					</form.Field>
					<form.Field name="description">
						{(field) => (
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
									value={field.state.value}
									onChange={field.handleChange}
									placeholder={t("issues.descriptionPlaceholder")}
									ariaInvalid={Boolean(fieldErrors.description)}
									ariaDescribedBy={
										fieldErrors.description
											? "issue-description-error"
											: undefined
									}
								/>
								<FieldError id="issue-description-error">
									{fieldErrors.description}
								</FieldError>
							</Field>
						)}
					</form.Field>
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<Field>
							<FieldLabel>{t("issues.status")}</FieldLabel>
							<IssueStatusSelect
								statuses={statuses}
								value={statusId ?? null}
								showBadge={false}
								triggerClassName="w-full"
								onChange={(value) => form.setFieldValue("statusId", value)}
							/>
						</Field>
						<Field>
							<FieldLabel>{t("issues.priority")}</FieldLabel>
							<IssuePrioritySelect
								value={priorityValue(priority)}
								showBadge={false}
								triggerClassName="w-full"
								onChange={(value) =>
									form.setFieldValue("priority", priorityName(value))
								}
							/>
						</Field>
						<Field>
							<FieldLabel>{t("issues.assignee")}</FieldLabel>
							<IssueAssigneeSelect
								members={members}
								value={assigneeId}
								showAvatar={false}
								triggerClassName="w-full"
								onChange={(value) => form.setFieldValue("assigneeId", value)}
							/>
						</Field>
						<Field>
							<FieldLabel>{t("issues.dueDate")}</FieldLabel>
							<IssueDueDateField
								value={dueDate}
								onChange={(value) => form.setFieldValue("dueDate", value)}
							/>
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
									onChange={(e) =>
										form.setFieldValue("estimate", e.target.value)
									}
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
								onValueChange={(value) =>
									value && form.setFieldValue("cycleId", value)
								}
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
							onChange={(next) => form.setFieldValue("labelIds", next)}
						/>
					</Field>
					{createMutation.isError && (
						<MutationError error={createMutation.error} />
					)}
				</form>
				{/* Pinned outside the scrollable form below md so the primary action
				    stays reachable; `form={formId}` keeps it submitting the form. */}
				<DialogFooter className="max-md:mx-0 max-md:mb-0 max-md:rounded-none max-md:px-4 max-md:pt-4 max-md:pb-[calc(env(safe-area-inset-bottom)+1rem)]">
					<Button
						type="submit"
						form={formId}
						disabled={createMutation.isPending || !estimateValid}
					>
						{t("common.create")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
