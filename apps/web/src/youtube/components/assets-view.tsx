"use client";

import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { useEditor } from "@/editor/use-editor";
import { downloadYoutubeResultToProject } from "@/youtube/download-to-project";
import type {
	YoutubeDownloadFormat,
	YoutubeSearchResult,
} from "@/youtube/types";
import {
	MusicNote03Icon,
	Search01Icon,
	Video01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

function formatDuration({ seconds }: { seconds: number }): string {
	if (!seconds) return "LIVE";

	const totalSeconds = Math.floor(seconds);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const secs = (totalSeconds % 60).toString().padStart(2, "0");

	if (hours > 0) {
		return `${hours}:${minutes.toString().padStart(2, "0")}:${secs}`;
	}
	return `${minutes}:${secs}`;
}

export function YoutubeView() {
	const editor = useEditor();
	const activeProject = useEditor((e) => e.project.getActive());

	const [query, setQuery] = useState("");
	const [results, setResults] = useState<YoutubeSearchResult[]>([]);
	const [isSearching, setIsSearching] = useState(false);
	const [hasSearched, setHasSearched] = useState(false);
	const [searchError, setSearchError] = useState<string | null>(null);
	const [downloadingId, setDownloadingId] = useState<string | null>(null);
	const [downloadingFormat, setDownloadingFormat] =
		useState<YoutubeDownloadFormat | null>(null);

	const runSearch = async () => {
		const trimmed = query.trim();
		if (!trimmed) return;

		setIsSearching(true);
		setSearchError(null);

		try {
			const response = await fetch(
				`/api/youtube/search?q=${encodeURIComponent(trimmed)}`,
			);
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data?.error ?? "Search failed");
			}

			setResults(data.results ?? []);
		} catch (error) {
			console.error("YouTube search failed:", error);
			setSearchError(error instanceof Error ? error.message : "Search failed");
			setResults([]);
		} finally {
			setIsSearching(false);
			setHasSearched(true);
		}
	};

	const handleAdd = async ({
		result,
		format,
	}: {
		result: YoutubeSearchResult;
		format: YoutubeDownloadFormat;
	}) => {
		if (!activeProject) {
			toast.error("No active project");
			return;
		}

		setDownloadingId(result.id);
		setDownloadingFormat(format);

		try {
			await downloadYoutubeResultToProject({
				editor,
				projectId: activeProject.metadata.id,
				result,
				format,
			});
			toast.success(`${result.title} added to timeline`);
		} catch (error) {
			console.error("Failed to add YouTube result:", error);
			toast.error(error instanceof Error ? error.message : "Failed to add video");
		} finally {
			setDownloadingId(null);
			setDownloadingFormat(null);
		}
	};

	return (
		<div className="flex h-full flex-col gap-4 p-3">
			<div className="flex items-center gap-2">
				<Input
					placeholder="Search YouTube"
					value={query}
					onChange={({ currentTarget }) => setQuery(currentTarget.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") runSearch();
					}}
					showClearIcon
					onClear={() => {
						setQuery("");
						setResults([]);
						setHasSearched(false);
					}}
					containerClassName="w-full"
					className="w-full"
				/>
				<Button
					size="icon"
					variant="outline"
					onClick={runSearch}
					disabled={isSearching || !query.trim()}
				>
					{isSearching ? <Spinner /> : <HugeiconsIcon icon={Search01Icon} />}
				</Button>
			</div>

			<div className="relative h-full overflow-hidden">
				<ScrollArea className="h-full flex-1">
					<div className="flex flex-col gap-3">
						{isSearching && (
							<div className="text-muted-foreground text-sm">Searching...</div>
						)}
						{!isSearching && searchError && (
							<div className="text-destructive text-sm">{searchError}</div>
						)}
						{!isSearching && !searchError && hasSearched && results.length === 0 && (
							<div className="text-muted-foreground text-sm">No results found</div>
						)}
						{!isSearching &&
							results.map((result) => (
								<YoutubeResultItem
									key={result.id}
									result={result}
									downloadingFormat={
										downloadingId === result.id ? downloadingFormat : null
									}
									onAdd={(format) => handleAdd({ result, format })}
								/>
							))}
					</div>
				</ScrollArea>
			</div>
		</div>
	);
}

function YoutubeResultItem({
	result,
	downloadingFormat,
	onAdd,
}: {
	result: YoutubeSearchResult;
	downloadingFormat: YoutubeDownloadFormat | null;
	onAdd: (format: YoutubeDownloadFormat) => void;
}) {
	const isDownloading = downloadingFormat !== null;

	return (
		<div className="border-border/60 flex flex-col gap-2 rounded-md border p-2">
			<div className="bg-muted relative aspect-video w-full shrink-0 overflow-hidden rounded">
				{result.thumbnailUrl ? (
					<Image
						src={result.thumbnailUrl}
						alt={result.title}
						fill
						sizes="100vw"
						className="object-cover"
						loading="lazy"
						unoptimized
					/>
				) : null}
			</div>

			<div className="min-w-0">
				<p className="truncate text-sm font-medium">{result.title}</p>
				<span className="text-muted-foreground block truncate text-xs">
					{result.channel} · {formatDuration({ seconds: result.duration })}
				</span>
			</div>

			<div className="flex items-center gap-1.5">
				<Button
					variant="outline"
					size="sm"
					disabled={isDownloading}
					onClick={() => onAdd("video")}
					title="Add video to timeline"
					className="flex-1 gap-1"
				>
					{downloadingFormat === "video" ? (
						<Spinner />
					) : (
						<HugeiconsIcon icon={Video01Icon} />
					)}
					Video
				</Button>
				<Button
					variant="outline"
					size="sm"
					disabled={isDownloading}
					onClick={() => onAdd("audio")}
					title="Add audio to timeline"
					className="flex-1 gap-1"
				>
					{downloadingFormat === "audio" ? (
						<Spinner />
					) : (
						<HugeiconsIcon icon={MusicNote03Icon} />
					)}
					Audio
				</Button>
			</div>
		</div>
	);
}
