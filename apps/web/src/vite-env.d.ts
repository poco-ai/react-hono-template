/// <reference types="vite/client" />

interface ImportMetaEnv {
	/** 生产环境 API 地址；本地开发留空（走 Vite proxy 同源转发） */
	readonly VITE_API_URL?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
