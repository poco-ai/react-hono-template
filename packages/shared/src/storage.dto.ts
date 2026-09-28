export interface PresignUploadRequestDto {
	scope: string;
	filename: string;
	contentType: string;
	size: number;
}

export interface PresignUploadResponseDto {
	key: string;
	uploadUrl: string;
	publicUrl: string | null;
	expiresIn: number;
}

export interface PresignDownloadResponseDto {
	url: string;
	expiresIn: number;
}

export interface DeleteObjectResponseDto {
	key: string;
	deleted: boolean;
}
