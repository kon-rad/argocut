export type TrackRef = string;

export interface ElementDTO {
	id: string;
	name: string;
	type: string;
	trackId: string;
	trackRef: TrackRef;
	startTime: number;
	endTime: number;
	duration: number;
	trimStart: number;
	trimEnd: number;
	sourceDuration?: number;
	mediaId?: string;
	rate?: number;
	hidden?: boolean;
	params?: Record<string, string | number | boolean>;
	animatedParams?: string[];
	effectTypes?: string[];
	maskTypes?: string[];
}

export interface TrackDTO {
	id: string;
	ref: TrackRef;
	name: string;
	type: string;
	muted?: boolean;
	hidden?: boolean;
	elements: ElementDTO[];
}

export interface TimelineDTO {
	sceneId: string;
	sceneName: string;
	durationSeconds: number;
	tracks: TrackDTO[];
}

export interface MediaAssetDTO {
	id: string;
	name: string;
	type: string;
	durationSeconds?: number;
	width?: number;
	height?: number;
	fps?: number;
	hasAudio?: boolean;
}

export interface ProjectDTO {
	id: string;
	name: string;
	durationSeconds: number;
	fps: number;
	canvasSize: { width: number; height: number };
	background: { type: string; color?: string; blurIntensity?: number };
	scenes: Array<{ id: string; name: string; isMain: boolean }>;
	currentSceneId: string;
	media: MediaAssetDTO[];
	storage: { usedBytes: number; availableBytes: number };
}

export interface ProjectSummaryDTO {
	id: string;
	name: string;
	durationSeconds: number;
	updatedAt: string;
}

export type ImportResultDTO =
	| { path: string; ok: true; mediaId: string; asset: MediaAssetDTO }
	| { path: string; ok: false; skipped: string };

export interface ParamDefinitionDTO {
	key: string;
	label: string;
	type: string;
	default: string | number | boolean;
	min?: number;
	max?: number;
	step?: number;
	keyframable: boolean;
	options?: Array<{ value: string | number; label: string }>;
}
