"use client";

import { brandAssetUrl } from "../types";
import type { Brand } from "../types";

/**
 * The smallest visual stand-in for a brand.
 *
 * Prefers a real emblem or logo from the brand's own folder, because that is
 * the point — you should recognise which brand you are in without reading. When
 * there is no usable image it falls back to an initial on the brand's own
 * primary colour, which still beats a generic icon.
 */
export function BrandMark({
	brand,
	size = 20,
}: {
	brand: Pick<Brand, "id" | "name" | "assets" | "tokens">;
	size?: number;
}) {
	// Raster and SVG only: a font or a video cannot stand in for a mark.
	const displayable = brand.assets.filter(
		(asset) =>
			(asset.kind === "emblem" || asset.kind === "logo") &&
			asset.mime?.startsWith("image/"),
	);
	const mark =
		displayable.find((asset) => asset.kind === "emblem") ?? displayable[0];

	if (mark) {
		return (
			// A brand asset is an arbitrary file from the user's disk served by our
			// own API, so next/image's optimiser buys nothing here.
			// eslint-disable-next-line @next/next/no-img-element
			<img
				src={brandAssetUrl({ brandId: brand.id, assetId: mark.id })}
				alt=""
				width={size}
				height={size}
				className="shrink-0 rounded-sm object-contain"
				style={{ width: size, height: size }}
			/>
		);
	}

	const colors = brand.tokens?.colors ?? {};
	const background =
		colors.primary ?? colors.gold ?? colors.accent ?? Object.values(colors)[0];

	return (
		<span
			className="text-background flex shrink-0 items-center justify-center rounded-sm bg-foreground font-semibold"
			style={{
				width: size,
				height: size,
				fontSize: Math.max(9, Math.round(size * 0.55)),
				...(background ? { background, color: "#1B1526" } : {}),
			}}
			aria-hidden
		>
			{brand.name.trim().charAt(0).toUpperCase() || "B"}
		</span>
	);
}
