import type { ApiOk } from "@workspace/shared";
import type { ClientResponse } from "hono/client";
import { unwrap } from "@/lib/api";
import { codedError, errorCode } from "@/lib/errors";

const STORAGE_UNAVAILABLE = "STORAGE_UNAVAILABLE";

/**
 * Storage outages (5xx from the presign/register API calls, or a network-level
 * failure of the storage PUT) are surfaced as a dedicated code so the UI can
 * show a dedicated message instead of a generic upload failure.
 */
const storageUnavailableError = () =>
	codedError("Storage service unavailable", STORAGE_UNAVAILABLE);

export const isStorageUnavailableError = (error: unknown): boolean =>
	errorCode(error) === STORAGE_UNAVAILABLE;

export const isAbortError = (error: unknown): boolean =>
	typeof error === "object" &&
	error !== null &&
	(error as { name?: unknown }).name === "AbortError";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

/** Normalizes `image/jpg` and rejects anything that is not a web image. */
export const imageContentType = (file: File): (typeof IMAGE_TYPES)[number] => {
	const contentType = file.type === "image/jpg" ? "image/jpeg" : file.type;
	if (!(IMAGE_TYPES as readonly string[]).includes(contentType)) {
		throw codedError(
			`Unsupported image type ${contentType || "unknown"}`,
			"UNSUPPORTED_MEDIA_TYPE",
		);
	}
	return contentType as (typeof IMAGE_TYPES)[number];
};

const putObject = async ({
	uploadUrl,
	file,
	contentType,
	signal,
}: {
	uploadUrl: string;
	file: File;
	contentType: string;
	signal?: AbortSignal;
}): Promise<void> => {
	let response: Response;
	try {
		response = await fetch(uploadUrl, {
			method: "PUT",
			headers: { "Content-Type": contentType },
			body: file,
			signal,
		});
	} catch (error) {
		if (isAbortError(error)) {
			throw error;
		}
		throw storageUnavailableError();
	}
	if (!response.ok) {
		throw new Error(`Upload failed with status ${response.status}`);
	}
};

type PresignedUpload = { uploadUrl: string; key: string };

type ApiResponse<T> =
	| ClientResponse<ApiOk<T>>
	| Promise<ClientResponse<ApiOk<T>>>;

/**
 * Shared browser flow for presigned uploads: reserve (presign) → PUT to storage
 * → register. 5xx responses and network failures of the PUT surface as
 * `STORAGE_UNAVAILABLE`; abort signals are propagated untouched.
 */
export async function uploadViaPresign<TResult>({
	file,
	contentType,
	signal,
	presign,
	register,
}: {
	file: File;
	contentType: string;
	signal?: AbortSignal;
	presign: () => ApiResponse<PresignedUpload>;
	register: (key: string) => ApiResponse<TResult>;
}): Promise<TResult> {
	const presignResponse = await presign();
	if (presignResponse.status >= 500) {
		throw storageUnavailableError();
	}
	const { uploadUrl, key } = await unwrap(presignResponse);

	await putObject({ uploadUrl, file, contentType, signal });

	const registerResponse = await register(key);
	if (registerResponse.status >= 500) {
		throw storageUnavailableError();
	}
	return unwrap(registerResponse);
}
