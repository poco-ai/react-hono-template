const MEDIA_ASSET_URL = /\/api\/media\/[A-Za-z0-9_-]{8,80}(?:[/?#]|$)/;

/** True for URLs produced by the media API (`/api/media/:assetId`). */
export const isMediaAssetUrl = (url: string) => MEDIA_ASSET_URL.test(url);
