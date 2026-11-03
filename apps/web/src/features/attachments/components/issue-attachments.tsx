import type { AttachmentWithUrlDto } from "@api/dto/attachment.dto";
import { useQuery } from "@tanstack/react-query";
import {
	ATTACHMENT_CONTENT_TYPES,
	ATTACHMENT_MAX_SIZE,
} from "@workspace/shared";
import { Button } from "@workspace/ui/components/button";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemMedia,
	ItemTitle,
} from "@workspace/ui/components/item";
import { Spinner } from "@workspace/ui/components/spinner";
import { cn } from "@workspace/ui/lib/utils";
import {
	FileArchive,
	FileImage,
	FileText,
	Paperclip,
	Trash2,
	X,
} from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { MutationError } from "@/components/mutation-error";
import { UserAvatar } from "@/components/user-avatar";
import {
	attachmentsQuery,
	attachmentUploadErrorKey,
	resolveContentType,
	useDeleteAttachment,
	useUploadAttachment,
} from "@/features/attachments/data";
import { useSession } from "@/features/auth/data";
import { membersQuery } from "@/features/members/data";
import { formatBytes, formatRelativeTime } from "@/lib/format";

const ALLOWED_CONTENT_TYPES = ATTACHMENT_CONTENT_TYPES;
const MAX_SIZE = ATTACHMENT_MAX_SIZE;
const ACCEPT = ".png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.md,.markdown,.zip";

interface PendingUpload {
	id: string;
	filename: string;
	error?: string;
}

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

	const uploadMutation = useUploadAttachment(orgId, projectId, issueNumber, {});

	const deleteMutation = useDeleteAttachment(orgId, projectId, issueNumber, {
		onSuccess: () => {
			setDeleting(null);
		},
	});

	const controllersRef = useRef(new Map<string, AbortController>());

	const handleFiles = (files: FileList | File[]) => {
		setPending((prev) => prev.filter((item) => !item.error));
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
											error: t(attachmentUploadErrorKey(error), {
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
					"flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-lg border border-dashed px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
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
				<Paperclip className="text-muted-foreground size-5 shrink-0" />
				<span className="flex min-w-0 flex-col">
					<span className="text-sm font-medium">{t("attachments.add")}</span>
					<span className="text-muted-foreground text-xs">
						{t("attachments.dropHint")} · {t("attachments.typeLimit")}
					</span>
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
				<ItemGroup className="gap-2">
					{pending.map((item) => (
						<Item key={item.id} variant="outline" size="sm">
							<ItemContent>
								{item.error ? (
									<span className="text-destructive truncate text-sm">
										{item.error}
									</span>
								) : (
									<span className="flex items-center gap-2 text-sm">
										<Spinner className="text-muted-foreground shrink-0" />
										<span className="min-w-0 flex-1 truncate">
											{t("attachments.uploading", {
												filename: item.filename,
											})}
										</span>
									</span>
								)}
							</ItemContent>
							<ItemActions>
								<Button
									variant="ghost"
									size="icon-sm"
									aria-label={
										item.error ? t("common.dismiss") : t("common.cancel")
									}
									onClick={() => {
										const controller = controllersRef.current.get(item.id);
										if (controller) {
											controller.abort();
										} else {
											setPending((prev) =>
												prev.filter((p) => p.id !== item.id),
											);
										}
									}}
								>
									<X />
								</Button>
							</ItemActions>
						</Item>
					))}
				</ItemGroup>
			)}

			{attachments.isError && <MutationError error={attachments.error} />}

			{items.length > 0 && (
				<ItemGroup className="gap-2">
					{items.map((attachment) => {
						const canDelete =
							isAdmin || attachment.uploader?.id === session?.user.id;
						return (
							<Item key={attachment.id} variant="outline" size="sm">
								{isImage(attachment.contentType) && attachment.url ? (
									<ItemMedia variant="image">
										<img
											src={attachment.url}
											alt={attachment.filename}
											loading="lazy"
										/>
									</ItemMedia>
								) : (
									<ItemMedia variant="icon">
										<AttachmentIcon attachment={attachment} />
									</ItemMedia>
								)}
								<ItemContent>
									<ItemTitle>
										<a
											href={attachment.url ?? undefined}
											target="_blank"
											rel="noreferrer"
											className="truncate hover:underline"
										>
											{attachment.filename}
										</a>
									</ItemTitle>
									<ItemDescription className="flex items-center gap-1 overflow-hidden text-xs">
										{formatBytes(attachment.size)}
										{attachment.uploader && (
											<>
												·
												<UserAvatar
													name={attachment.uploader.name}
													image={attachment.uploader.image}
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
									</ItemDescription>
								</ItemContent>
								{canDelete && (
									<ItemActions>
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
									</ItemActions>
								)}
							</Item>
						);
					})}
				</ItemGroup>
			)}

			<ConfirmDialog
				open={deleting !== null}
				onOpenChange={(open) => !open && setDeleting(null)}
				title={t("attachments.deleteTitle")}
				description={t("attachments.deleteDescription", {
					filename: deleting?.filename ?? "",
				})}
				confirmLabel={t("common.delete")}
				pending={deleteMutation.isPending}
				onConfirm={() => {
					if (deleting) {
						deleteMutation.mutate(deleting.id);
					}
				}}
			/>
			{deleteMutation.isError && (
				<MutationError error={deleteMutation.error} className="mt-2" />
			)}
		</section>
	);
}
