import type { MediaAssetData } from "@/services/storage/types";

export type MediaType = "image" | "video" | "audio";

export interface MediaAsset extends MediaAssetData {
	// Video assets loaded from server storage skip materializing this to avoid
	// pulling a multi-GB clip into memory before anything can render — see
	// `sourceForMediaAsset`. `url` (server blob endpoint or object URL) is what
	// every consumer should treat as the reliable source.
	file?: File;
	url?: string;
}
