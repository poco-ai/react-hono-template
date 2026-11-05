import type { ProjectDto } from "@api/dto/project.dto";
import { useQuery } from "@tanstack/react-query";
import {
	type ProjectHealth,
	type UpdateProjectInput,
	updateProjectSchema,
} from "@workspace/shared";
import { Button } from "@workspace/ui/components/button";
import { ColorSwatchPicker } from "@workspace/ui/components/color-swatch-picker";
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
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { DateField } from "@/components/date-field";
import { MutationError } from "@/components/mutation-error";
import { membersQuery } from "@/features/members/data";
import { useUpdateProject } from "@/features/projects/data";
import { projectHealthOf } from "@/features/projects/utils";
import { fromDateInputValue, toDateInputValue } from "@/lib/format";
import { useZodForm } from "@/lib/use-zod-form";
import { ProjectHealthSelect } from "./project-health-select";

const DEFAULT_COLOR = "#6366f1";
const NO_LEAD = "__no_lead__";

const INPUT_IDS = {
	name: "edit-project-name",
	description: "edit-project-description",
	targetDate: "edit-project-target-date",
	leadId: "edit-project-lead",
	health: "edit-project-health",
};

type ProjectFormValues = {
	name: string;
	description: string;
	color: string;
	targetDate: string;
	leadId: string;
	health: ProjectHealth | null;
};

const formSchema = z.preprocess((values) => {
	// Guard non-object input so the wrapper cannot throw a TypeError before zod
	// gets a chance to report validation issues.
	if (!values || typeof values !== "object") {
		return values;
	}
	const input = values as ProjectFormValues;
	return {
		name: input.name.trim(),
		description: input.description.trim() || null,
		color: input.color,
		targetDate: fromDateInputValue(input.targetDate),
		leadId: input.leadId === NO_LEAD ? null : input.leadId,
		health: input.health,
	};
}, updateProjectSchema);

export function EditProjectDialog({
	orgId,
	project,
	open,
	onOpenChange,
}: {
	orgId: string;
	project: ProjectDto | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { t } = useTranslation();
	const members = useQuery(membersQuery(orgId));

	const updateMutation = useUpdateProject(orgId, {
		onSuccess: () => {
			toast.success(t("toast.projectUpdated"));

			onOpenChange(false);
		},
	});

	const { form, fieldErrors, handleSubmit, reset } = useZodForm<
		ProjectFormValues,
		UpdateProjectInput
	>({
		defaultValues: {
			name: "",
			description: "",
			color: DEFAULT_COLOR,
			targetDate: "",
			leadId: NO_LEAD,
			health: null,
		},
		schema: formSchema,
		onSubmit: (values) => {
			if (!project) {
				return;
			}
			updateMutation.mutate({ projectId: project.id, input: values });
		},
		t,
		inputIds: INPUT_IDS,
	});

	useEffect(() => {
		if (open && project) {
			updateMutation.reset();
			reset({
				name: project.name,
				description: project.description ?? "",
				color: project.color ?? DEFAULT_COLOR,
				targetDate: toDateInputValue(project.targetDate),
				leadId: project.leadId ?? NO_LEAD,
				health: projectHealthOf(project.health),
			});
		}
	}, [open, project, updateMutation.reset, reset]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md" closeLabel={t("common.close")}>
				<DialogHeader>
					<DialogTitle>{t("projects.editTitle")}</DialogTitle>
					<DialogDescription>{t("projects.editDescription")}</DialogDescription>
				</DialogHeader>
				<form
					noValidate
					className="flex flex-col gap-4"
					onSubmit={handleSubmit}
				>
					<form.Field name="name">
						{(field) => (
							<Field data-invalid={fieldErrors.name ? true : undefined}>
								<FieldLabel htmlFor="edit-project-name">
									{t("projects.name")}
								</FieldLabel>
								<Input
									id="edit-project-name"
									value={field.state.value}
									placeholder={t("projects.namePlaceholder")}
									onChange={(e) => field.handleChange(e.target.value)}
									aria-invalid={fieldErrors.name ? true : undefined}
									aria-describedby={
										fieldErrors.name ? "edit-project-name-error" : undefined
									}
								/>
								<FieldError id="edit-project-name-error">
									{fieldErrors.name}
								</FieldError>
							</Field>
						)}
					</form.Field>
					<Field>
						<FieldLabel htmlFor="edit-project-key">
							{t("projects.key")}
						</FieldLabel>
						<Input
							id="edit-project-key"
							value={project?.key ?? ""}
							disabled
							className="w-full font-mono uppercase"
						/>
						<FieldDescription>{t("projects.keyLockedHint")}</FieldDescription>
					</Field>
					<form.Field name="description">
						{(field) => (
							<Field data-invalid={fieldErrors.description ? true : undefined}>
								<FieldLabel htmlFor="edit-project-description">
									{t("common.description")}
									<span className="text-muted-foreground">
										{" "}
										({t("common.optional")})
									</span>
								</FieldLabel>
								<Textarea
									id="edit-project-description"
									value={field.state.value}
									placeholder={t("projects.descriptionPlaceholder")}
									onChange={(e) => field.handleChange(e.target.value)}
									aria-invalid={fieldErrors.description ? true : undefined}
									aria-describedby={
										fieldErrors.description
											? "edit-project-description-error"
											: undefined
									}
								/>
								<FieldError id="edit-project-description-error">
									{fieldErrors.description}
								</FieldError>
							</Field>
						)}
					</form.Field>
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<form.Field name="targetDate">
							{(field) => (
								<Field data-invalid={fieldErrors.targetDate ? true : undefined}>
									<FieldLabel htmlFor="edit-project-target-date">
										{t("projects.targetDate")}
										<span className="text-muted-foreground">
											{" "}
											({t("common.optional")})
										</span>
									</FieldLabel>
									<DateField
										id="edit-project-target-date"
										value={field.state.value}
										invalid={Boolean(fieldErrors.targetDate)}
										onChange={field.handleChange}
									/>
									<FieldError>{fieldErrors.targetDate}</FieldError>
								</Field>
							)}
						</form.Field>
						<form.Field name="leadId">
							{(field) => (
								<Field>
									<FieldLabel htmlFor="edit-project-lead">
										{t("projects.lead")}
										<span className="text-muted-foreground">
											{" "}
											({t("common.optional")})
										</span>
									</FieldLabel>
									<Select
										value={field.state.value}
										disabled={members.isPending}
										onValueChange={(value) =>
											value && field.handleChange(value)
										}
									>
										<SelectTrigger id="edit-project-lead" className="w-full">
											<SelectValue>
												{field.state.value === NO_LEAD
													? t("projects.noLead")
													: (members.data?.find(
															(member) => member.userId === field.state.value,
														)?.user.name ?? t("projects.noLead"))}
											</SelectValue>
										</SelectTrigger>
										<SelectContent>
											<SelectItem value={NO_LEAD}>
												{t("projects.noLead")}
											</SelectItem>
											{(members.data ?? []).map((member) => (
												<SelectItem key={member.userId} value={member.userId}>
													{member.user.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</Field>
							)}
						</form.Field>
					</div>
					<form.Field name="health">
						{(field) => (
							<Field>
								<FieldLabel htmlFor="edit-project-health">
									{t("projects.health")}
								</FieldLabel>
								<ProjectHealthSelect
									id="edit-project-health"
									value={field.state.value}
									onChange={field.handleChange}
									className="w-full sm:w-48"
								/>
							</Field>
						)}
					</form.Field>
					<form.Field name="color">
						{(field) => (
							<Field>
								<FieldLabel>
									{t("projects.color")}
									<span className="text-muted-foreground">
										{" "}
										({t("common.optional")})
									</span>
								</FieldLabel>
								<ColorSwatchPicker
									value={field.state.value}
									onChange={field.handleChange}
									ariaLabel={t("projects.color")}
								/>
							</Field>
						)}
					</form.Field>
					{updateMutation.isError && (
						<MutationError error={updateMutation.error} />
					)}
					<DialogFooter>
						<Button type="submit" disabled={updateMutation.isPending}>
							{t("common.save")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
