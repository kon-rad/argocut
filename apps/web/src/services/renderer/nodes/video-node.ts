import {
	VisualNode,
	type ResolvedVisualSourceNodeState,
	type VisualNodeParams,
} from "./visual-node";

export interface VideoNodeParams extends VisualNodeParams {
	url: string;
	// Absent for server-stored video (streamed via url instead) — present for
	// freshly imported or OPFS/local-mode assets.
	file?: File;
	mediaId: string;
}

export class VideoNode extends VisualNode<
	VideoNodeParams,
	ResolvedVisualSourceNodeState
> {}
