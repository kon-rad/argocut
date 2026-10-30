export interface YoutubeSearchResult {
	id: string;
	title: string;
	channel: string;
	duration: number;
	thumbnailUrl: string;
}

export type YoutubeDownloadFormat = "video" | "audio";
