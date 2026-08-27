"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/ui";
import type { BrandAsset, BrandAssetKind, BrandWithStatus } from "../types";
import { brandAssetUrl } from "../types";

const KIND_LABELS: Record<BrandAssetKind, string> = {
	logo: "Logos",
	emblem: "Emblems",
	"title-card": "Title cards",
	image: "Images",
	video: "Video",
	font: "Fonts",
	other: "Other",
};

function formatSize({ bytes }: { bytes: number | null }): string {
	if (bytes === null) return "";
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * What sits behind an asset while you look at it.
 *
 * Not decoration: a brand folder holds ink-on-white logos and white-on-dark
 * ones side by side, and either backdrop alone renders half of them invisible.
 */
type Backdrop = "checker" | "light" | "dark";

const BACKDROP_CLASS: Record<Backdrop, string> = {
	checker:
		"bg-[linear-gradient(45deg,rgba(128,128,128,.18)_25%,transparent_25%,transparent_75%,rgba(128,128,128,.18)_75%),linear-gradient(45deg,rgba(128,128,128,.18)_25%,transparent_25%,transparent_75%,rgba(128,128,128,.18)_75%)] bg-[length:16px_16px] bg-[position:0_0,8px_8px]",
	light: "bg-white",
	dark: "bg-[#1B1526]",
};

function AssetTile({
	brand,
	asset,
	backdrop,
}: {
	brand: BrandWithStatus;
	asset: BrandAsset;
	backdrop: Backdrop;
}) {
	const url = brandAssetUrl({ brandId: brand.id, assetId: asset.id });
	const isImage = asset.mime?.startsWith("image/") ?? false;
	const isVideo = asset.mime?.startsWith("video/") ?? false;

	return (
		<figure className="border-border bg-card group flex flex-col overflow-hidden rounded-lg border">
			<div
				className={cn(
					"flex h-28 items-center justify-center p-3",
					BACKDROP_CLASS[backdrop],
				)}
			>
				{isImage && (
					// eslint-disable-next-line @next/next/no-img-element
					<img
						src={url}
						alt={asset.name}
						className="max-h-full max-w-full object-contain"
					/>
				)}
				{isVideo && (
					<video
						src={url}
						className="max-h-full max-w-full object-contain"
						muted
						playsInline
						preload="metadata"
					/>
				)}
				{!isImage && !isVideo && (
					<span className="text-muted-foreground font-mono text-xs">
						{asset.name.split(".").pop()?.toUpperCase()}
					</span>
				)}
			</div>

			<figcaption className="flex flex-col gap-1 border-t p-2">
				<span className="truncate text-xs font-medium" title={asset.relPath}>
					{asset.name}
				</span>
				<span className="text-muted-foreground font-mono text-[10px]">
					{[
						asset.width && asset.height
							? `${asset.width}×${asset.height}`
							: null,
						formatSize({ bytes: asset.size }),
					]
						.filter(Boolean)
						.join(" · ")}
				</span>
			</figcaption>
		</figure>
	);
}

/**
 * Everything the brand folder holds, grouped by what it is.
 *
 * Read-only on purpose. Assets are added by putting files in the folder, which
 * keeps one way of doing it — an upload button here would create a second, and
 * then the question of which one is authoritative.
 */
export function BrandAssets({ brand }: { brand: BrandWithStatus }) {
	const [filter, setFilter] = useState<BrandAssetKind | "all">("all");
	const [backdrop, setBackdrop] = useState<Backdrop>("checker");

	const grouped = useMemo(() => {
		const groups = new Map<BrandAssetKind, BrandAsset[]>();
		for (const asset of brand.assets) {
			groups.set(asset.kind, [...(groups.get(asset.kind) ?? []), asset]);
		}
		return groups;
	}, [brand.assets]);

	if (!brand.rootExists) {
		return (
			<p className="text-destructive text-sm">
				The folder <code className="text-xs">{brand.rootPath}</code> is not
				reachable. Reconnect the drive or update the path, then rescan.
			</p>
		);
	}

	if (brand.assets.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				Nothing in <code className="text-xs">{brand.assetsDir}</code> yet. Drop
				logos, emblems and title cards in and rescan — names carry meaning, so a
				file with <code className="text-xs">logo</code>,{" "}
				<code className="text-xs">emblem</code> or{" "}
				<code className="text-xs">title-card</code> in it is filed as that kind.
			</p>
		);
	}

	const kinds = [...grouped.keys()];
	const visible =
		filter === "all"
			? kinds
			: kinds.filter((kind) => kind === filter);

	return (
		<div className="space-y-6">
			<div className="flex flex-wrap items-center gap-2">
				<Button
					size="sm"
					variant={filter === "all" ? "default" : "outline"}
					onClick={() => setFilter("all")}
				>
					All
					<Badge variant="secondary">{brand.assets.length}</Badge>
				</Button>
				{kinds.map((kind) => (
					<Button
						key={kind}
						size="sm"
						variant={filter === kind ? "default" : "outline"}
						onClick={() => setFilter(kind)}
					>
						{KIND_LABELS[kind]}
						<Badge variant="secondary">{grouped.get(kind)?.length ?? 0}</Badge>
					</Button>
				))}

				<div className="ml-auto flex items-center gap-1">
					<span className="text-muted-foreground text-xs">Preview on</span>
					{(["checker", "light", "dark"] as Backdrop[]).map((option) => (
						<Button
							key={option}
							size="sm"
							variant={backdrop === option ? "default" : "outline"}
							onClick={() => setBackdrop(option)}
						>
							{option === "checker" ? "Checker" : option === "light" ? "Light" : "Dark"}
						</Button>
					))}
				</div>
			</div>

			{visible.map((kind) => (
				<section key={kind} className="space-y-3">
					<h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
						{KIND_LABELS[kind]}
					</h3>
					<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
						{(grouped.get(kind) ?? []).map((asset) => (
							<AssetTile
								key={asset.id}
								brand={brand}
								asset={asset}
								backdrop={backdrop}
							/>
						))}
					</div>
				</section>
			))}
		</div>
	);
}
