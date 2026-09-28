import type { PresignUploadResponseDto } from "@workspace/shared";
import { useState } from "react";
import { client, unwrap } from "@/lib/api";

export function usePresignedUpload(scope: string) {
	const [uploading, setUploading] = useState(false);
	const [uploaded, setUploaded] = useState<PresignUploadResponseDto | null>(
		null,
	);
	const [error, setError] = useState<string | null>(null);

	async function upload(file: File): Promise<PresignUploadResponseDto> {
		setUploading(true);
		setError(null);
		try {
			const contentType = file.type || "application/octet-stream";
			const presigned = await unwrap(
				await client.api.storage.presign.$post({
					json: {
						scope,
						filename: file.name,
						contentType,
						size: file.size,
					},
				}),
			);
			const res = await fetch(presigned.uploadUrl, {
				method: "PUT",
				headers: { "Content-Type": contentType },
				body: file,
			});
			if (!res.ok) {
				throw new Error(
					`Object storage rejected the upload (HTTP ${res.status})`,
				);
			}
			setUploaded(presigned);
			return presigned;
		} catch (e) {
			setError(e instanceof Error ? e.message : "Upload failed");
			throw e;
		} finally {
			setUploading(false);
		}
	}

	return { upload, uploading, uploaded, error };
}
