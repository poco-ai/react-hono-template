import type { AttachmentWithUrlDto } from "@api/dto/attachment.dto";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ATTACHMENT_CONTENT_TYPES,
	ATTACHMENT_MAX_SIZE,
} from "@workspace/shared";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog";
import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import {
	CircleAlert,
	FileArchive,
	FileImage,
	FileText,
	Loader2,
	Paperclip,
	Trash2,
	X,
} from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { UserAvatar } from "@/components/user-avatar";
import { client, unwrap } from "@/lib/api";
import { formatBytes, formatRelativeTime } from "@/lib/issue-utils";
import {
	issueActivitiesKey,
	orgActivitiesRootKey,
} from "@/lib/queries/activities";
import {
	attachmentsQuery,
	attachmentsQueryKey,
} from "@/lib/queries/attachments";
import { membersQuery } from "@/lib/queries/members";
import { useSession } from "@/lib/session";

const ALLOWED_CONTENT_TYPES = ATTACHMENT_CONTENT_TYPES;
const MAX_SIZE = ATTACHMENT_MAX_SIZE;
const ACCEPT = ".png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.md,.markdown,.zip";
const EXTENSION_TYPES: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	webp: "image/webp",
	gif: "image/gif",
	pdf: "application/pdf",
	txt: "text/plain",
	md: "text/markdown",
	markdown: "text/markdown",
	zip: "application/zip",
};

interface PendingUpload {
	id: string;
	filename: string;
	error?: string;
}

const resolveContentType = (file: File): string => {
	if (file.type === "image/jpg") {
		return "image/jpeg";
	}
	if (file.type) {
		return file.type;
	}
	const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
	return EXTENSION_TYPES[ext] ?? "";
};

const isImage = (contentType: string) => contentType.startsWith("image/");

function AttachmentIcon({ attachment }: { attachment: AttachmentWithUrlDto }) {
	if (isImage(attachment.contentType)) {
		return <FileImage className="text-muted-foreground size-5 shrink-0" />;
	}
	if (attachment.contentType === "application/zip") {
		return <FileArchive className="text-muted-foreground size-5 shrink-0" />;
	}
	return <FileText className="text-muted-foreground size-5 shrink-0" />;
}

export function IssueAttachments({
	orgId,
	projectId,
	issueNumber,
	frozen,
}: {
	orgId: string;
	projectId: string;
	issueNumber: number;
	frozen: boolean;
}) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const { data: session } = useSession();
	const members = useQuery(membersQuery(orgId));
	const attachments = useQuery(attachmentsQuery(orgId, projectId, issueNumber));
	const inputRef = useRef<HTMLInputElement>(null);
	const [dragOver, setDragOver] = useState(false);
	const [pending, setPending] = useState<PendingUpload[]>([]);
	const [deleting, setDeleting] = useState<AttachmentWithUrlDto | null>(null);

	const currentRole = members.data?.find(
		(member) => member.userId === session?.user.id,
	)?.role;
	const isAdmin = currentRole === "owner" || currentRole === "admin";

	const invalidateAttachments = () => {
		queryClient.invalidateQueries({
			queryKey: attachmentsQueryKey(orgId, projectId, issueNumber),
		});
		queryClient.invalidateQueries({
			queryKey: issueActivitiesKey(orgId, projectId, issueNumber),
		});
		queryClient.invalidateQueries({
			queryKey: orgActivitiesRootKey(orgId),
		});
	};

	const uploadMutation = useMutation({
		mutationFn: async ({
			file,
			signal,
		}: {
			file: File;
			signal: AbortSignal;
		}) => {
			const contentType = resolveContentType(file);
			const presigned = await unwrap(
				client.api.orgs[":orgId"].projects[":projectId"].issues[
					":number"
				].attachments.presign.$post({
					param: { orgId, projectId, number: String(issueNumber) },
					json: { filename: file.name, contentType },
				}),
			);
			const response = await fetch(presigned.uploadUrl, {
				method: "PUT",
				headers: { "Content-Type": contentType },
				body: file,
				signal,
			});
			if (!response.ok) {
				throw new Error(`Upload failed with status ${response.status}`);
			}
			await unwrap(
				client.api.orgs[":orgId"].projects[":projectId"].issues[
					":number"
				].attachments.$post({
					param: { orgId, projectId, number: String(issueNumber) },
					json: {
						key: presigned.key,
						filename: file.name,
						contentType,
						size: file.size,
					},
				}),
			);
		},
		onSuccess: invalidateAttachments,
	});

	const deleteMutation = useMutation({
		mutationFn: (attachmentId: string) =>
			unwrap(
				client.api.orgs[":orgId"].projects[":projectId"].issues[
					":number"
				].attachments[":attachmentId"].$delete({
					param: {
						orgId,
						projectId,
						number: String(issueNumber),
						attachmentId,
					},
				}),
			),
		onSuccess: () => {
			invalidateAttachments();
			setDeleting(null);
		},
	});

	const controllersRef = useRef(new Map<string, AbortController>());

	const handleFiles = (files: FileList | File[]) => {
		for (const file of Array.from(files)) {
			const id = crypto.randomUUID();
			const contentType = resolveContentType(file);
			if (!(ALLOWED_CONTENT_TYPES as readonly string[]).includes(contentType)) {
				setPending((prev) => [
					...prev,
					{
						id,
						filename: file.name,
						error: t("attachments.typeNotAllowed", { filename: file.name }),
					},
				]);
				continue;
			}
			if (file.size < 1 || file.size > MAX_SIZE) {
				setPending((prev) => [
					...prev,
					{
						id,
						filename: file.name,
						error: t("attachments.tooLarge", { filename: file.name }),
					},
				]);
				continue;
			}
			setPending((prev) => [...prev, { id, filename: file.name }]);
			const controller = new AbortController();
			controllersRef.current.set(id, controller);
			uploadMutation.mutate(
				{ file, signal: controller.signal },
				{
					onSuccess: () => {
						controllersRef.current.delete(id);
						setPending((prev) => prev.filter((item) => item.id !== id));
					},
					onError: (error) => {
						controllersRef.current.delete(id);
						setPending((prev) =>
							prev.map((item) =>
								item.id === id
									? {
											...item,
											error:
												error instanceof DOMException &&
												error.name === "AbortError"
													? t("attachments.cancelled", {
															filename: file.name,
														})
													: t("attachments.uploadFailed", {
															filename: file.name,
														}),
										}
									: item,
							),
						);
					},
				},
			);
		}
	};

	const items = attachments.data ?? [];

	return (
		<section className="flex flex-col gap-3">
			<h2 className="flex items-center gap-2 text-sm font-semibold">
				{t("attachments.title")}
				{items.length > 0 && (
					<span className="text-muted-foreground font-normal">
						({items.length})
					</span>
				)}
			</h2>

			<button
				type="button"
				className={cn(
					"flex w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 py-5 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-60",
					dragOver && "border-primary bg-accent",
				)}
				disabled={frozen}
				onClick={() => inputRef.current?.click()}
				onDragOver={(e) => {
					e.preventDefault();
					setDragOver(true);
				}}
				onDragLeave={() => setDragOver(false)}
				onDrop={(e) => {
					e.preventDefault();
					setDragOver(false);
					if (e.dataTransfer.files.length > 0) {
						handleFiles(e.dataTransfer.files);
					}
				}}
			>
				<Paperclip className="text-muted-foreground size-5" />
				<span className="text-sm font-medium">{t("attachments.add")}</span>
				<span className="text-muted-foreground text-xs">
					{t("attachments.dropHint")}
				</span>
				<span className="text-muted-foreground text-xs">
					{t("attachments.typeLimit")}
				</span>
			</button>
			<input
				ref={inputRef}
				type="file"
				multiple
				hidden
				accept={ACCEPT}
				onChange={(e) => {
					if (e.target.files && e.target.files.length > 0) {
						handleFiles(e.target.files);
					}
					e.target.value = "";
				}}
			/>

			{pending.length > 0 && (
				<ul className="flex flex-col gap-2">
					{pending.map((item) => (
						<li
							key={item.id}
							className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
						>
							{item.error ? (
								<span className="text-destructive min-w-0 flex-1 truncate">
									{item.error}
								</span>
							) : (
								<>
									<Loader2 className="text-muted-foreground size-4 shrink-0 animate-spin" />
									<span className="min-w-0 flex-1 truncate">
										{t("attachments.uploading", { filename: item.filename })}
									</span>
								</>
							)}
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label={t("common.cancel")}
								onClick={() => {
									const controller = controllersRef.current.get(item.id);
									if (controller) {
										controller.abort();
									} else {
										setPending((prev) => prev.filter((p) => p.id !== item.id));
									}
								}}
							>
								<X />
							</Button>
						</li>
					))}
				</ul>
			)}

			{attachments.isError && (
				<Alert variant="destructive">
					<CircleAlert />
					<AlertDescription>{attachments.error.message}</AlertDescription>
				</Alert>
			)}

			{items.length > 0 && (
				<ul className="flex flex-col gap-2">
					{items.map((attachment) => {
						const canDelete =
							isAdmin || attachment.uploader?.id === session?.user.id;
						return (
							<li
								key={attachment.id}
								className="flex items-center gap-3 rounded-md border px-3 py-2"
							>
								{isImage(attachment.contentType) && attachment.url ? (
									<img
										src={attachment.url}
										alt={attachment.filename}
										loading="lazy"
										className="size-10 shrink-0 rounded-md border object-cover"
									/>
								) : (
									<AttachmentIcon attachment={attachment} />
								)}
								<div className="flex min-w-0 flex-1 flex-col">
									<a
										href={attachment.url ?? undefined}
										target="_blank"
										rel="noreferrer"
										className="truncate text-sm font-medium hover:underline"
									>
										{attachment.filename}
									</a>
									<span className="text-muted-foreground flex items-center gap-1 text-xs">
										{formatBytes(attachment.size)}
										{attachment.uploader && (
											<>
												·
												<UserAvatar
													name={attachment.uploader.name}
													className="size-3.5"
												/>
												{attachment.uploader.name}
											</>
										)}
										·
										<time
											dateTime={attachment.createdAt}
											title={attachment.createdAt}
										>
											{formatRelativeTime(attachment.createdAt)}
										</time>
									</span>
								</div>
								{canDelete && (
									<Button
										variant="ghost"
										size="icon-sm"
										aria-label={t("common.delete")}
										className="text-destructive hover:text-destructive"
										disabled={frozen}
										onClick={() => setDeleting(attachment)}
									>
										<Trash2 />
									</Button>
								)}
							</li>
						);
					})}
				</ul>
			)}

			<AlertDialog
				open={deleting !== null}
				onOpenChange={(open) => !open && setDeleting(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("attachments.deleteTitle")}</AlertDialogTitle>
						<AlertDialogDescription>
							{t("attachments.deleteDescription", {
								filename: deleting?.filename ?? "",
							})}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={deleteMutation.isPending || deleting === null}
							onClick={(e) => {
								e.preventDefault();
								if (deleting) {
									deleteMutation.mutate(deleting.id);
								}
							}}
						>
							{deleteMutation.isPending && <Loader2 className="animate-spin" />}
							{t("common.delete")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
			{deleteMutation.isError && (
				<Alert variant="destructive" className="mt-2">
					<CircleAlert />
					<AlertDescription>{deleteMutation.error.message}</AlertDescription>
				</Alert>
			)}
		</section>
	);
}
