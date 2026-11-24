import type { StatusDto } from "@api/features/statuses/dto/status.dto";
import { useQuery } from "@tanstack/react-query";
import {
	type CreateIssueTemplateInput,
	createIssueTemplateSchema,
	ISSUE_PRIORITIES,
	type IssuePriorityName,
} from "@workspace/shared";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
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
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemTitle,
} from "@workspace/ui/components/item";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import { Skeleton } from "@workspace/ui/components/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { CircleAlert, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { MarkdownEditor } from "@/components/markdown-editor";
import { MultiSelect } from "@/components/multi-select";
import { MutationError } from "@/components/mutation-error";
import { PriorityBadge } from "@/features/issues/components/priority-badge";
import { StatusBadge } from "@/features/issues/components/status-badge";
import { labelsQuery } from "@/features/labels/data";
import { useOrgFrozen } from "@/features/organizations/use-org-frozen";
import { useOrgRole } from "@/features/organizations/use-org-role";
import { projectsQuery } from "@/features/projects/data";
import { statusesQuery } from "@/features/statuses/data";
import {
	emptyIssueTemplateForm,
	type IssueTemplateFormState,
	issueTemplateFormFromDto,
	ORG_WIDE_TEMPLATE_SCOPE,
	TEMPLATE_NO_STATUS,
	templateInputFromForm,
} from "@/features/templates/apply";
import {
	type IssueTemplateDto,
	issueTemplatesQuery,
	useCreateIssueTemplate,
	useDeleteIssueTemplate,
	useUpdateIssueTemplate,
} from "@/features/templates/data";
import { apiErrorMessage } from "@/lib/errors";
import { useDocumentTitle } from "@/lib/use-document-title";
import { useZodForm } from "@/lib/use-zod-form";

const templateFormSchema = z.preprocess((values) => {
	// Guard non-object input so the wrapper cannot throw a TypeError before zod
	// gets a chance to report validation issues.
	if (!values || typeof values !== "object") {
		return values;
	}
	return templateInputFromForm(values as IssueTemplateFormState);
}, createIssueTemplateSchema);

const INPUT_IDS = {
	name: "template-name",
	title: "template-title",
	description: "template-description",
};

export function TemplatesSettingsPage({ orgId }: { orgId: string }) {
	const { t } = useTranslation();
	useDocumentTitle(t("settings.templates"));

	const templates = useQuery(issueTemplatesQuery(orgId));
	const projects = useQuery(projectsQuery(orgId));
	const statuses = useQuery(statusesQuery(orgId));
	const labels = useQuery(labelsQuery(orgId));
	const { canManage } = useOrgRole(orgId);
	const frozen = useOrgFrozen(orgId);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editing, setEditing] = useState<IssueTemplateDto | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<IssueTemplateDto | null>(
		null,
	);

	const createMutation = useCreateIssueTemplate(orgId, {
		onSuccess: () => {
			toast.success(t("toast.templateCreated"));
			setDialogOpen(false);
		},
	});
	const updateMutation = useUpdateIssueTemplate(orgId, {
		onSuccess: () => {
			toast.success(t("toast.templateUpdated"));
			setDialogOpen(false);
		},
	});
	const deleteMutation = useDeleteIssueTemplate(orgId, {
		onSuccess: () => {
			toast.success(t("toast.templateDeleted"));
			setDeleteTarget(null);
		},
	});

	const projectName = (projectId: string | null) =>
		projectId === null
			? t("templates.orgWide")
			: ((projects.data ?? []).find((project) => project.id === projectId)
					?.name ?? t("templates.orgWide"));
	const statusOf = (statusId: string | null): StatusDto | undefined =>
		statusId === null
			? undefined
			: (statuses.data ?? []).find((status) => status.id === statusId);

	const saveMutation = editing ? updateMutation : createMutation;

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h2 className="text-lg font-medium">{t("settings.templates")}</h2>
					<p className="text-muted-foreground mt-1 text-sm">
						{t("templates.description")}
					</p>
				</div>
				{canManage && (
					<Button
						onClick={() => {
							setEditing(null);
							setDialogOpen(true);
						}}
						disabled={frozen}
					>
						<Plus />
						{t("templates.create")}
					</Button>
				)}
			</div>

			{templates.isPending && (
				<ItemGroup className="gap-2" aria-busy="true" aria-hidden="true">
					{["template-1", "template-2", "template-3"].map((key) => (
						<Item key={key} variant="outline" size="sm">
							<ItemContent className="gap-2">
								<div className="flex items-center gap-2">
									<Skeleton className="h-4 w-40" />
									<Skeleton className="h-5 w-16 rounded-md" />
								</div>
								<Skeleton className="h-3 w-2/3" />
								<div className="flex gap-2 pt-1">
									<Skeleton className="h-5 w-20 rounded-full" />
									<Skeleton className="h-5 w-16 rounded-full" />
								</div>
							</ItemContent>
						</Item>
					))}
				</ItemGroup>
			)}
			{templates.isError && (
				<Alert variant="destructive" className="my-8">
					<CircleAlert />
					<AlertDescription>
						{apiErrorMessage(t, templates.error)}
					</AlertDescription>
				</Alert>
			)}
			{templates.data?.length === 0 && (
				<EmptyState title={t("templates.empty")} />
			)}
			{templates.data && templates.data.length > 0 && (
				<ItemGroup className="gap-2">
					{templates.data.map((template) => {
						const status = statusOf(template.statusId);
						return (
							<Item key={template.id} variant="outline" size="sm">
								<ItemContent>
									<ItemTitle className="flex min-w-0 flex-wrap items-center gap-2">
										<span className="truncate">{template.name}</span>
										<Badge variant="secondary">
											{projectName(template.projectId)}
										</Badge>
									</ItemTitle>
									<ItemDescription className="truncate">
										{template.title}
									</ItemDescription>
									<div className="flex flex-wrap items-center gap-2 pt-1">
										{status && <StatusBadge status={status} />}
										<PriorityBadge value={template.priority ?? 0} />
										<Badge variant="outline">
											{t("templates.labelCount", {
												count: template.labelIds.length,
											})}
										</Badge>
										{template.estimate !== null && (
											<Badge variant="outline">
												{t("templates.estimateValue", {
													count: template.estimate,
												})}
											</Badge>
										)}
									</div>
								</ItemContent>
								{canManage && (
									<ItemActions>
										<Tooltip>
											<TooltipTrigger
												render={
													<Button
														variant="ghost"
														size="icon-sm"
														aria-label={t("common.edit")}
														disabled={frozen}
														onClick={() => {
															setEditing(template);
															setDialogOpen(true);
														}}
													>
														<Pencil />
													</Button>
												}
											/>
											<TooltipContent>{t("common.edit")}</TooltipContent>
										</Tooltip>
										<Tooltip>
											<TooltipTrigger
												render={
													<Button
														variant="ghost"
														size="icon-sm"
														className="text-destructive hover:text-destructive"
														aria-label={t("common.delete")}
														disabled={frozen}
														onClick={() => setDeleteTarget(template)}
													>
														<Trash2 />
													</Button>
												}
											/>
											<TooltipContent>{t("common.delete")}</TooltipContent>
										</Tooltip>
									</ItemActions>
								)}
							</Item>
						);
					})}
				</ItemGroup>
			)}

			{deleteMutation.isError && <MutationError error={deleteMutation.error} />}

			<TemplateDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				template={editing}
				projects={projects.data ?? []}
				statuses={statuses.data ?? []}
				labels={labels.data ?? []}
				pending={saveMutation.isPending}
				error={saveMutation.error}
				onSubmit={(input) => {
					if (editing) {
						updateMutation.mutate({ templateId: editing.id, input });
					} else {
						createMutation.mutate(input);
					}
				}}
			/>

			<ConfirmDialog
				open={deleteTarget !== null}
				onOpenChange={(open) => !open && setDeleteTarget(null)}
				title={t("templates.deleteTitle")}
				description={t("templates.deleteDescription", {
					name: deleteTarget?.name ?? "",
				})}
				confirmLabel={t("common.delete")}
				pending={deleteMutation.isPending}
				onConfirm={() => {
					if (deleteTarget) {
						deleteMutation.mutate(deleteTarget.id);
					}
				}}
			/>
		</div>
	);
}

function TemplateDialog({
	open,
	onOpenChange,
	template,
	projects,
	statuses,
	labels,
	pending,
	error,
	onSubmit,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	template: IssueTemplateDto | null;
	projects: { id: string; name: string }[];
	statuses: StatusDto[];
	labels: { id: string; name: string }[];
	pending: boolean;
	error: Error | null;
	onSubmit: (input: CreateIssueTemplateInput) => void;
}) {
	const { t } = useTranslation();
	const { form, fieldErrors, handleSubmit, reset } = useZodForm<
		IssueTemplateFormState,
		CreateIssueTemplateInput
	>({
		defaultValues: emptyIssueTemplateForm(),
		schema: templateFormSchema,
		onSubmit,
		t,
		inputIds: INPUT_IDS,
	});

	useEffect(() => {
		if (open) {
			reset(
				template
					? issueTemplateFormFromDto(template)
					: emptyIssueTemplateForm(),
			);
		}
	}, [open, template, reset]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-2xl" closeLabel={t("common.close")}>
				<DialogHeader>
					<DialogTitle>
						{template ? t("templates.editTitle") : t("templates.createTitle")}
					</DialogTitle>
					<DialogDescription>
						{template
							? t("templates.editDescription")
							: t("templates.createDescription")}
					</DialogDescription>
				</DialogHeader>
				<form
					noValidate
					className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1"
					onSubmit={handleSubmit}
				>
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<form.Field name="name">
							{(field) => (
								<Field data-invalid={fieldErrors.name ? true : undefined}>
									<FieldLabel htmlFor="template-name">
										{t("templates.name")}
									</FieldLabel>
									<Input
										id="template-name"
										value={field.state.value}
										placeholder={t("templates.namePlaceholder")}
										onChange={(e) => field.handleChange(e.target.value)}
										maxLength={100}
										aria-invalid={fieldErrors.name ? true : undefined}
									/>
									<FieldError>{fieldErrors.name}</FieldError>
								</Field>
							)}
						</form.Field>
						<form.Field name="projectId">
							{(field) => (
								<Field>
									<FieldLabel>{t("templates.scope")}</FieldLabel>
									<Select
										value={field.state.value}
										onValueChange={(value) =>
											value && field.handleChange(value)
										}
									>
										<SelectTrigger className="w-full">
											<SelectValue>
												{field.state.value === ORG_WIDE_TEMPLATE_SCOPE
													? t("templates.orgWide")
													: (projects.find(
															(project) => project.id === field.state.value,
														)?.name ?? t("templates.orgWide"))}
											</SelectValue>
										</SelectTrigger>
										<SelectContent>
											<SelectItem value={ORG_WIDE_TEMPLATE_SCOPE}>
												{t("templates.orgWide")}
											</SelectItem>
											{projects.map((project) => (
												<SelectItem key={project.id} value={project.id}>
													{project.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</Field>
							)}
						</form.Field>
					</div>

					<form.Field name="title">
						{(field) => (
							<Field data-invalid={fieldErrors.title ? true : undefined}>
								<FieldLabel htmlFor="template-title">
									{t("templates.title")}
								</FieldLabel>
								<Input
									id="template-title"
									value={field.state.value}
									placeholder={t("issues.titlePlaceholder")}
									onChange={(e) => field.handleChange(e.target.value)}
									aria-invalid={fieldErrors.title ? true : undefined}
								/>
								<FieldError>{fieldErrors.title}</FieldError>
							</Field>
						)}
					</form.Field>

					<form.Field name="description">
						{(field) => (
							<Field>
								<FieldLabel htmlFor="template-description">
									{t("common.description")}
									<span className="text-muted-foreground">
										{" "}
										({t("common.optional")})
									</span>
								</FieldLabel>
								<MarkdownEditor
									id="template-description"
									value={field.state.value}
									onChange={field.handleChange}
									placeholder={t("issues.descriptionPlaceholder")}
								/>
								<FieldError>{fieldErrors.description}</FieldError>
							</Field>
						)}
					</form.Field>

					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<form.Field name="statusId">
							{(field) => (
								<Field>
									<FieldLabel>{t("issues.status")}</FieldLabel>
									<Select
										value={field.state.value}
										onValueChange={(value) =>
											value && field.handleChange(value)
										}
									>
										<SelectTrigger className="w-full">
											<SelectValue>
												{field.state.value === TEMPLATE_NO_STATUS
													? t("templates.noStatus")
													: (statuses.find(
															(status) => status.id === field.state.value,
														)?.name ?? t("templates.noStatus"))}
											</SelectValue>
										</SelectTrigger>
										<SelectContent>
											<SelectItem value={TEMPLATE_NO_STATUS}>
												{t("templates.noStatus")}
											</SelectItem>
											{statuses.map((status) => (
												<SelectItem key={status.id} value={status.id}>
													<StatusBadge status={status} />
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</Field>
							)}
						</form.Field>
						<form.Field name="priority">
							{(field) => (
								<Field>
									<FieldLabel>{t("issues.priority")}</FieldLabel>
									<Select
										value={field.state.value}
										onValueChange={(value) =>
											value && field.handleChange(value as IssuePriorityName)
										}
									>
										<SelectTrigger className="w-full">
											<SelectValue>
												{t(`issues.priorities.${field.state.value}`)}
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
							)}
						</form.Field>
					</div>

					<form.Field name="labelIds">
						{(field) => (
							<Field>
								<FieldLabel>{t("issues.labels")}</FieldLabel>
								<MultiSelect
									placeholder={t("issues.noLabels")}
									value={field.state.value}
									options={labels.map((label) => ({
										value: label.id,
										label: label.name,
									}))}
									onChange={field.handleChange}
								/>
							</Field>
						)}
					</form.Field>

					<form.Field name="estimate">
						{(field) => (
							<Field data-invalid={fieldErrors.estimate ? true : undefined}>
								<FieldLabel>{t("issues.estimate")}</FieldLabel>
								<InputGroup>
									<InputGroupInput
										type="number"
										min={0}
										max={100}
										step={1}
										value={field.state.value}
										onChange={(e) => field.handleChange(e.target.value)}
									/>
									<InputGroupAddon align="inline-end">
										<InputGroupText>{t("issues.estimateUnit")}</InputGroupText>
									</InputGroupAddon>
								</InputGroup>
								<FieldDescription>
									{t("templates.estimateHint")}
								</FieldDescription>
								<FieldError>{fieldErrors.estimate}</FieldError>
							</Field>
						)}
					</form.Field>

					{error && <MutationError error={error} />}
					<DialogFooter>
						<Button type="submit" disabled={pending}>
							{template ? t("common.save") : t("common.create")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
