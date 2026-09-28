export interface StorageAdapter {
	presignPut(
		key: string,
		contentType: string,
		expiresIn: number,
	): Promise<string>;
	presignGet(key: string, expiresIn: number): Promise<string>;
	remove(key: string): Promise<void>;
	publicUrl(key: string): string | null;
}
