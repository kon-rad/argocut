import type { ImportResultDTO } from "@opencut/agent-protocol";
import { EditorCore } from "@/core";
import { processMediaAssets } from "@/media/processing";

const INPUT_ID = "__opencut_agent_file_input";

function getInput(): HTMLInputElement {
	const existing = document.getElementById(INPUT_ID);
	if (existing instanceof HTMLInputElement) {
		return existing;
	}

	const input = document.createElement("input");
	input.id = INPUT_ID;
	input.type = "file";
	input.multiple = true;
	input.style.position = "fixed";
	input.style.left = "-10000px";
	input.style.width = "1px";
	input.style.height = "1px";
	document.body.appendChild(input);
	return input;
}

/**
 * Reads whatever Playwright placed on the hidden input and runs it through the
 * same pipeline the upload UI uses. `processMediaAssets` silently drops
 * unsupported and over-quota files, so results are reconciled by name against
 * what actually landed — a caller must never build a timeline against an asset
 * that was skipped.
 */
export async function importStagedMedia(): Promise<ImportResultDTO[]> {
	const editor = EditorCore.getInstance();
	const projectId = editor.project.getActive().metadata.id;
	const input = getInput();
	const files = Array.from(input.files ?? []);

	if (files.length === 0) {
		throw new Error("No files were staged on the agent file input");
	}

	const processed = await processMediaAssets({ files });
	const results: ImportResultDTO[] = [];
	const claimed = new Set<number>();

	for (const file of files) {
		const index = processed.findIndex(
			(asset, position) => !claimed.has(position) && asset.file.name === file.name,
		);
		if (index === -1) {
			results.push({
				path: file.name,
				ok: false,
				skipped:
					"Rejected during processing — unsupported type or insufficient browser storage",
			});
			continue;
		}
		claimed.add(index);

		const saved = await editor.media.addMediaAsset({
			projectId,
			asset: processed[index],
		});
		if (!saved) {
			results.push({
				path: file.name,
				ok: false,
				skipped: "Failed to persist — browser storage quota exceeded",
			});
			continue;
		}

		results.push({
			path: file.name,
			ok: true,
			mediaId: saved.id,
			asset: {
				id: saved.id,
				name: saved.name,
				type: saved.type,
				durationSeconds: saved.duration,
				width: saved.width,
				height: saved.height,
				fps: saved.fps,
				hasAudio: saved.hasAudio,
			},
		});
	}

	input.value = "";
	return results;
}
