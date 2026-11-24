export type CacheGetOptions = { cacheTtl?: number };
export type CacheSetOptions = { ttlSeconds?: number };

export type CacheStore = {
	get<T>(key: string, options?: CacheGetOptions): Promise<T | null>;
	set<T>(key: string, value: T, options?: CacheSetOptions): Promise<boolean>;
	delete(key: string): Promise<boolean>;
};
