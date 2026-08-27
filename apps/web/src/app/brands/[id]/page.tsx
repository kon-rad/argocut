"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
	Alert02Icon,
	Delete02Icon,
	RefreshIcon,
	Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { BasePage } from "@/app/base-page";
import { BrandAssets } from "@/brands/components/brand-assets";
import { BrandMark } from "@/brands/components/brand-mark";
import { StyleGuideEditor } from "@/brands/components/style-guide-editor";
import { useBrandsStore } from "@/brands/store";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function BrandDetailPage() {
	const params = useParams<{ id: string }>();
	const router = useRouter();
	const {
		brands,
		activeBrandId,
		isReady,
		load,
		selectBrand,
		rescanBrand,
		deleteBrand,
	} = useBrandsStore();

	const [isRescanning, setIsRescanning] = useState(false);
	const brand = brands.find((candidate) => candidate.id === params.id);

	useEffect(() => {
		if (!isReady) void load();
	}, [isReady, load]);

	if (!isReady) {
		return (
			<BasePage maxWidth="6xl" mainClassName="gap-4 pt-12 md:pt-16">
				<Skeleton className="h-10 w-64" />
				<Skeleton className="h-64 w-full" />
			</BasePage>
		);
	}

	if (!brand) {
		return (
			<BasePage maxWidth="6xl" mainClassName="gap-4 pt-12 md:pt-16">
				<p className="text-muted-foreground text-sm">
					No such brand.{" "}
					<Link href="/brands" className="underline">
						Back to brands
					</Link>
					.
				</p>
			</BasePage>
		);
	}

	const isActive = brand.id === activeBrandId;
	const colors = brand.tokens?.colors ?? {};
	const fonts = brand.tokens?.fonts ?? {};

	const rescan = async () => {
		setIsRescanning(true);
		try {
			const updated = await rescanBrand({ id: brand.id });
			toast.success(
				`${updated.assets.length} ${updated.assets.length === 1 ? "asset" : "assets"} indexed`,
			);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		} finally {
			setIsRescanning(false);
		}
	};

	return (
		<BasePage maxWidth="6xl" mainClassName="gap-0 pt-12 md:pt-16">
			<Breadcrumb className="pb-6">
				<BreadcrumbList>
					<BreadcrumbItem>
						<BreadcrumbLink asChild>
							<Link href="/brands">Brands</Link>
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbPage>{brand.name}</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>

			<header className="flex flex-wrap items-start justify-between gap-4 pb-8">
				<div className="flex items-start gap-4">
					<BrandMark brand={brand} size={48} />
					<div className="space-y-1">
						<div className="flex items-center gap-2">
							<h1 className="text-2xl font-semibold">{brand.name}</h1>
							{isActive && (
								<Badge variant="secondary" className="gap-1">
									<HugeiconsIcon icon={Tick02Icon} className="size-3" />
									Active
								</Badge>
							)}
							{!brand.rootExists && (
								<Badge variant="destructive" className="gap-1">
									<HugeiconsIcon icon={Alert02Icon} className="size-3" />
									Folder missing
								</Badge>
							)}
						</div>
						<p className="text-muted-foreground font-mono text-xs">
							{brand.rootPath}
						</p>
						{brand.description && (
							<p className="text-muted-foreground max-w-xl text-sm">
								{brand.description}
							</p>
						)}
					</div>
				</div>

				<div className="flex flex-wrap gap-2">
					<Button
						variant="outline"
						onClick={() => void rescan()}
						disabled={isRescanning}
					>
						<HugeiconsIcon icon={RefreshIcon} className="size-4" />
						{isRescanning ? "Rescanning…" : "Rescan folder"}
					</Button>
					{!isActive && (
						<Button
							onClick={async () => {
								await selectBrand({ id: brand.id });
								toast.success(`Working in ${brand.name}`);
							}}
						>
							Select
						</Button>
					)}
					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button variant="outline" size="icon">
								<HugeiconsIcon icon={Delete02Icon} className="size-4" />
							</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>Remove {brand.name}?</AlertDialogTitle>
								<AlertDialogDescription>
									ArgoCut forgets this brand. The folder at{" "}
									<code className="text-xs">{brand.rootPath}</code> and
									everything in it is left exactly as it is — your style guide
									and assets are your files, not the app's.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Cancel</AlertDialogCancel>
								<AlertDialogAction
									onClick={async () => {
										await deleteBrand({ id: brand.id });
										toast.success(`Removed ${brand.name}`);
										router.push("/brands");
									}}
								>
									Remove brand
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</div>
			</header>

			<Tabs defaultValue="assets">
				<TabsList>
					<TabsTrigger value="assets">
						Assets
						<Badge variant="secondary">{brand.assets.length}</Badge>
					</TabsTrigger>
					<TabsTrigger value="style-guide">Style guide</TabsTrigger>
					<TabsTrigger value="tokens">Palette</TabsTrigger>
				</TabsList>

				<TabsContent value="assets" className="pt-6">
					<BrandAssets brand={brand} />
				</TabsContent>

				<TabsContent value="style-guide" className="pt-6">
					<StyleGuideEditor brand={brand} />
				</TabsContent>

				<TabsContent value="tokens" className="space-y-6 pt-6">
					{Object.keys(colors).length === 0 &&
					Object.keys(fonts).length === 0 ? (
						<p className="text-muted-foreground text-sm">
							No tokens yet. Add YAML front matter to{" "}
							<code className="text-xs">{brand.styleGuidePath}</code> with{" "}
							<code className="text-xs">colors:</code> and{" "}
							<code className="text-xs">fonts:</code> maps and they appear here.
						</p>
					) : null}

					{Object.keys(colors).length > 0 && (
						<section className="space-y-3">
							<h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
								Colour
							</h3>
							<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
								{Object.entries(colors).map(([token, value]) => (
									<div
										key={token}
										className="border-border overflow-hidden rounded-lg border"
									>
										<div className="h-16" style={{ background: value }} />
										<div className="space-y-0.5 border-t p-2">
											<p className="text-xs font-medium">{token}</p>
											<p className="text-muted-foreground font-mono text-[10px]">
												{value}
											</p>
										</div>
									</div>
								))}
							</div>
						</section>
					)}

					{Object.keys(fonts).length > 0 && (
						<section className="space-y-3">
							<h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
								Type
							</h3>
							<dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
								{Object.entries(fonts).map(([token, value]) => (
									<div
										key={token}
										className="border-border rounded-lg border p-3"
									>
										<dt className="text-muted-foreground text-xs">{token}</dt>
										<dd className="text-sm font-medium">{value}</dd>
									</div>
								))}
							</dl>
						</section>
					)}
				</TabsContent>
			</Tabs>
		</BasePage>
	);
}
