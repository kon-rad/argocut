"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
	Alert02Icon,
	FolderOpenIcon,
	PlusSignIcon,
	RefreshIcon,
	Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { BasePage } from "@/app/base-page";
import { BrandDialog } from "@/brands/components/brand-dialog";
import { BrandMark } from "@/brands/components/brand-mark";
import { useBrandsStore } from "@/brands/store";
import type { BrandWithStatus } from "@/brands/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/ui";

/**
 * Manage brands: what exists, which one is active, and what each one holds.
 */
export default function BrandsPage() {
	const { brands, activeBrandId, isReady, isLoading, error, load, selectBrand } =
		useBrandsStore();
	const [isDialogOpen, setIsDialogOpen] = useState(false);

	useEffect(() => {
		if (!isReady) void load();
	}, [isReady, load]);

	const select = async ({ brand }: { brand: BrandWithStatus }) => {
		try {
			await selectBrand({ id: brand.id });
			toast.success(`Working in ${brand.name}`);
		} catch (caught) {
			toast.error(caught instanceof Error ? caught.message : String(caught));
		}
	};

	return (
		<BasePage maxWidth="6xl" mainClassName="gap-0 pt-12 md:pt-16">
			<header className="flex flex-wrap items-start justify-between gap-4 pb-8">
				<div className="space-y-1">
					<h1 className="text-2xl font-semibold">Brands</h1>
					<p className="text-muted-foreground max-w-2xl text-sm">
						A brand is a folder on this machine — a style guide and a set of
						assets. Select one and everything you create belongs to it, so
						projects, exports and agent workflows all know which brand they are
						working in.
					</p>
				</div>
				<div className="flex gap-2">
					<Button variant="outline" onClick={() => void load()} disabled={isLoading}>
						<HugeiconsIcon icon={RefreshIcon} className="size-4" />
						Refresh
					</Button>
					<Button onClick={() => setIsDialogOpen(true)}>
						<HugeiconsIcon icon={PlusSignIcon} className="size-4" />
						Add a brand
					</Button>
				</div>
			</header>

			{error && (
				<Card className="border-destructive/40 mb-6">
					<CardContent className="space-y-2 p-4 text-sm">
						<p className="text-destructive font-medium">
							Could not load brands.
						</p>
						<p className="text-muted-foreground font-mono text-xs">{error}</p>
						<p className="text-muted-foreground">
							Brands live in Postgres. If the database is not running, start it
							with <code className="text-xs">docker compose up -d db</code>.
						</p>
					</CardContent>
				</Card>
			)}

			{!isReady && (
				<div className="grid gap-4 sm:grid-cols-2">
					{[0, 1, 2, 3].map((key) => (
						<Skeleton key={key} className="h-32 w-full rounded-lg" />
					))}
				</div>
			)}

			{isReady && brands.length === 0 && !error && (
				<Card>
					<CardContent className="flex flex-col items-center gap-3 p-12 text-center">
						<HugeiconsIcon
							icon={FolderOpenIcon}
							className="text-muted-foreground size-8"
						/>
						<div className="space-y-1">
							<p className="font-medium">No brands yet</p>
							<p className="text-muted-foreground max-w-md text-sm">
								Create one to scaffold a new folder with a starter style guide,
								or import a folder you already keep your brand assets in.
							</p>
						</div>
						<Button onClick={() => setIsDialogOpen(true)}>
							<HugeiconsIcon icon={PlusSignIcon} className="size-4" />
							Add a brand
						</Button>
					</CardContent>
				</Card>
			)}

			<div className="grid gap-4 sm:grid-cols-2">
				{brands.map((brand) => {
					const isActive = brand.id === activeBrandId;
					return (
						<Card
							key={brand.id}
							className={cn(
								"transition-colors",
								isActive && "border-primary ring-primary/20 ring-1",
							)}
						>
							<CardContent className="space-y-3 p-4">
								<div className="flex items-start gap-3">
									<BrandMark brand={brand} size={36} />
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-2">
											<Link
												href={`/brands/${brand.id}`}
												className="truncate font-medium hover:underline"
											>
												{brand.name}
											</Link>
											{isActive && (
												<Badge variant="secondary" className="gap-1">
													<HugeiconsIcon icon={Tick02Icon} className="size-3" />
													Active
												</Badge>
											)}
											{!brand.rootExists && (
												<Badge variant="destructive" className="gap-1">
													<HugeiconsIcon icon={Alert02Icon} className="size-3" />
													Missing
												</Badge>
											)}
										</div>
										<p
											className="text-muted-foreground truncate font-mono text-xs"
											title={brand.rootPath}
										>
											{brand.rootPath}
										</p>
									</div>
								</div>

								{brand.description && (
									<p className="text-muted-foreground line-clamp-2 text-sm">
										{brand.description}
									</p>
								)}

								<div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
									<span>
										{brand.assets.length}{" "}
										{brand.assets.length === 1 ? "asset" : "assets"}
									</span>
									<span>
										{brand.hasStyleGuide ? "Style guide" : "No style guide"}
									</span>
								</div>

								<div className="flex gap-2 pt-1">
									<Button
										size="sm"
										variant={isActive ? "outline" : "default"}
										disabled={isActive}
										onClick={() => void select({ brand })}
									>
										{isActive ? "Selected" : "Select"}
									</Button>
									<Link href={`/brands/${brand.id}`}>
										<Button size="sm" variant="outline">
											Open
										</Button>
									</Link>
								</div>
							</CardContent>
						</Card>
					);
				})}
			</div>

			<BrandDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} />
		</BasePage>
	);
}
