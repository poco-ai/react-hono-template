import {
	type CreateProjectInput,
	createProjectSchema,
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
import { Textarea } from "@workspace/ui/components/textarea";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { QuotaError } from "@/components/quota-error";
import { useOrgRole } from "@/features/organizations/use-org-role";
import { useCreateProject } from "@/features/projects/data";
import { projectKeyFromName } from "@/features/projects/utils";
import { useZodForm } from "@/lib/use-zod-form";

const DEFAULT_COLOR = "#6366f1";

const INPUT_IDS = {
	name: "project-name",
	key: "project-key",
	description: "project-description",
};

type ProjectFormValues = {
	name: string;
	key: string;
	description: string;
	color: string;
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
		key: input.key,
		description: input.description.trim() || undefined,
		color: input.color,
	};
}, createProjectSchema);

const PATTERN_KEYS = { key: "form.errors.identifierPattern" };

export function CreateProjectDialog({
	orgId,
	open,
	onOpenChange,
}: {
	orgId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { t } = useTranslation();

	const { canManage } = useOrgRole(orgId);
	// Business-level "the user edited the key" flag: once set, typing a name no
	// longer rewrites the key. This is distinct from TanStack's field touched
	// state (focus/blur bookkeeping, cleared by `form.reset`) and must not be
	// derived from `field.state.meta.isTouched`.
	const [keyTouched, setKeyTouched] = useState(false);

	const createMutation = useCreateProject(orgId, {
		onSuccess: () => {
			toast.success(t("toast.projectCreated"));

			onOpenChange(false);
		},
	});

	const { form, fieldErrors, handleSubmit, reset } = useZodForm<
		ProjectFormValues,
		CreateProjectInput
	>({
		defaultValues: { name: "", key: "", description: "", color: DEFAULT_COLOR },
		schema: formSchema,
		onSubmit: (values) => {
			createMutation.mutate(values);
		},
		t,
		patternKeys: PATTERN_KEYS,
		inputIds: INPUT_IDS,
	});

	useEffect(() => {
		if (open) {
			setKeyTouched(false);
			reset({
				name: "",
				key: "",
				description: "",
				color: DEFAULT_COLOR,
			});
		}
	}, [open, reset]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md" closeLabel={t("common.close")}>
				<DialogHeader>
					<DialogTitle>{t("projects.createTitle")}</DialogTitle>
					<DialogDescription>
						{t("projects.createDescription")}
					</DialogDescription>
				</DialogHeader>
				<form
					noValidate
					className="flex flex-col gap-4"
					onSubmit={handleSubmit}
				>
					<form.Field name="name">
						{(field) => (
							<Field data-invalid={fieldErrors.name ? true : undefined}>
								<FieldLabel htmlFor="project-name">
									{t("projects.name")}
								</FieldLabel>
								<Input
									id="project-name"
									value={field.state.value}
									placeholder={t("projects.namePlaceholder")}
									onChange={(e) => {
										const next = e.target.value;
										field.handleChange(next);
										if (!keyTouched) {
											// Programmatic sibling write: updates the key value
											// without marking the key field touched, so `keyTouched`
											// stays the only source of truth for the derivation.
											form.setFieldValue("key", projectKeyFromName(next));
										}
									}}
									aria-invalid={fieldErrors.name ? true : undefined}
									aria-describedby={
										fieldErrors.name ? "project-name-error" : undefined
									}
								/>
								<FieldError id="project-name-error">
									{fieldErrors.name}
								</FieldError>
							</Field>
						)}
					</form.Field>
					<form.Field name="key">
						{(field) => (
							<Field data-invalid={fieldErrors.key ? true : undefined}>
								<FieldLabel htmlFor="project-key">
									{t("projects.key")}
								</FieldLabel>
								<Input
									id="project-key"
									value={field.state.value}
									placeholder={t("projects.keyPlaceholder")}
									onChange={(e) => {
										setKeyTouched(true);
										field.handleChange(
											e.target.value
												.toUpperCase()
												.replace(/[^A-Z]/g, "")
												.slice(0, 6),
										);
									}}
									className="w-full font-mono uppercase"
									aria-invalid={fieldErrors.key ? true : undefined}
									aria-describedby={
										fieldErrors.key
											? "project-key-error project-key-hint"
											: "project-key-hint"
									}
								/>
								<FieldDescription id="project-key-hint">
									{t("projects.keyHint")}
								</FieldDescription>
								<FieldError id="project-key-error">
									{fieldErrors.key}
								</FieldError>
							</Field>
						)}
					</form.Field>
					<form.Field name="description">
						{(field) => (
							<Field data-invalid={fieldErrors.description ? true : undefined}>
								<FieldLabel htmlFor="project-description">
									{t("common.description")}
									<span className="text-muted-foreground">
										{" "}
										({t("common.optional")})
									</span>
								</FieldLabel>
								<Textarea
									id="project-description"
									value={field.state.value}
									placeholder={t("projects.descriptionPlaceholder")}
									onChange={(e) => field.handleChange(e.target.value)}
									aria-invalid={fieldErrors.description ? true : undefined}
									aria-describedby={
										fieldErrors.description
											? "project-description-error"
											: undefined
									}
								/>
								<FieldError id="project-description-error">
									{fieldErrors.description}
								</FieldError>
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
					{createMutation.isError && (
						<QuotaError
							error={createMutation.error}
							orgId={orgId}
							canUpgrade={canManage}
						/>
					)}
					<DialogFooter>
						<Button type="submit" disabled={createMutation.isPending}>
							{t("common.create")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
