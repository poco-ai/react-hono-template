import type { ProjectDto } from "@api/dto/project.dto";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Textarea } from "@workspace/ui/components/textarea";
import { CircleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { client, unwrap } from "@/lib/api";

const DEFAULT_COLOR = "#6366f1";

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
	const queryClient = useQueryClient();
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [color, setColor] = useState(DEFAULT_COLOR);

	const updateMutation = useMutation({
		mutationFn: (target: ProjectDto) =>
			unwrap(
				client.api.orgs[":orgId"].projects[":projectId"].$patch({
					param: { orgId, projectId: target.id },
					json: {
						name: name.trim(),
						description: description.trim() || null,
						color,
					},
				}),
			),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["orgs", orgId, "projects"] });
			onOpenChange(false);
		},
	});

	useEffect(() => {
		if (open && project) {
			updateMutation.reset();
			setName(project.name);
			setDescription(project.description ?? "");
			setColor(project.color ?? DEFAULT_COLOR);
		}
	}, [open, project, updateMutation.reset]);

	const onSubmit = () => {
		if (!project || !name.trim()) {
			return;
		}
		updateMutation.mutate(project);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{t("projects.editTitle")}</DialogTitle>
					<DialogDescription>{t("projects.editDescription")}</DialogDescription>
				</DialogHeader>
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						onSubmit();
					}}
				>
					<div className="flex flex-col gap-2">
						<Label htmlFor="edit-project-name">{t("projects.name")}</Label>
						<Input
							id="edit-project-name"
							value={name}
							placeholder={t("projects.namePlaceholder")}
							onChange={(e) => setName(e.target.value)}
							required
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="edit-project-key">{t("projects.key")}</Label>
						<Input
							id="edit-project-key"
							value={project?.key ?? ""}
							disabled
							className="w-28 font-mono uppercase"
						/>
						<p className="text-muted-foreground text-xs">
							{t("projects.keyLockedHint")}
						</p>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="edit-project-description">
							{t("common.description")}
							<span className="text-muted-foreground">
								{" "}
								({t("common.optional")})
							</span>
						</Label>
						<Textarea
							id="edit-project-description"
							value={description}
							placeholder={t("projects.descriptionPlaceholder")}
							onChange={(e) => setDescription(e.target.value)}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="edit-project-color">
							{t("projects.color")}
							<span className="text-muted-foreground">
								{" "}
								({t("common.optional")})
							</span>
						</Label>
						<Input
							id="edit-project-color"
							type="color"
							value={color}
							onChange={(e) => setColor(e.target.value)}
							className="h-9 w-16 p-1"
						/>
					</div>
					{updateMutation.isError && (
						<Alert variant="destructive">
							<CircleAlert />
							<AlertDescription>
								{updateMutation.error.message}
							</AlertDescription>
						</Alert>
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
