"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
	Alert02Icon,
	PaintBoardIcon,
	PlusSignIcon,
	Settings02Icon,
	Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/utils/ui";
import { useActiveBrand, useBrandsStore } from "../store";
import { BrandDialog } from "./brand-dialog";
import { BrandMark } from "./brand-mark";

/**
 * Which brand am I working in, and switch it.
 *
 * Deliberately always visible rather than buried in settings: the whole point
 * of a brand is that it silently scopes what you make, and a silent scope you
 * cannot see is a trap.
 */
export function BrandSwitcher({ className }: { className?: string }) {
	const { brands, isReady, load, selectBrand } = useBrandsStore();
	const activeBrand = useActiveBrand();
	const [isDialogOpen, setIsDialogOpen] = useState(false);

	useEffect(() => {
		if (!isReady) void load();
	}, [isReady, load]);

	const select = async ({ id }: { id: string | null }) => {
		try {
			await selectBrand({ id });
			const name = brands.find((brand) => brand.id === id)?.name;
			toast.success(name ? `Working in ${name}` : "Brand cleared");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		}
	};

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="outline"
						className={cn("bg-background max-w-56 gap-2 text-sm", className)}
					>
						{activeBrand ? (
							<BrandMark brand={activeBrand} size={16} />
						) : (
							<HugeiconsIcon icon={PaintBoardIcon} className="size-4" />
						)}
						<span className="truncate">
							{activeBrand?.name ?? "No brand"}
						</span>
						{activeBrand && !activeBrand.rootExists && (
							<HugeiconsIcon
								icon={Alert02Icon}
								className="text-destructive size-4 shrink-0"
							/>
						)}
					</Button>
				</DropdownMenuTrigger>

				<DropdownMenuContent align="start" className="w-64">
					<DropdownMenuLabel>Brand context</DropdownMenuLabel>
					<DropdownMenuSeparator />

					{brands.length === 0 && (
						<div className="text-muted-foreground px-2 py-3 text-xs">
							No brands yet. A brand scopes your projects, exports and
							workflows to one folder of assets and one style guide.
						</div>
					)}

					{brands.map((brand) => (
						<DropdownMenuItem
							key={brand.id}
							className="gap-2"
							onClick={() => void select({ id: brand.id })}
						>
							<BrandMark brand={brand} size={16} />
							<span className="flex-1 truncate">{brand.name}</span>
							{!brand.rootExists && (
								<HugeiconsIcon
									icon={Alert02Icon}
									className="text-destructive size-3.5"
								/>
							)}
							{brand.id === activeBrand?.id && (
								<HugeiconsIcon icon={Tick02Icon} className="size-4" />
							)}
						</DropdownMenuItem>
					))}

					{activeBrand && (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem onClick={() => void select({ id: null })}>
								Work without a brand
							</DropdownMenuItem>
						</>
					)}

					<DropdownMenuSeparator />
					<DropdownMenuItem onClick={() => setIsDialogOpen(true)}>
						<HugeiconsIcon icon={PlusSignIcon} className="size-4" />
						Add a brand
					</DropdownMenuItem>
					<Link href="/brands">
						<DropdownMenuItem>
							<HugeiconsIcon icon={Settings02Icon} className="size-4" />
							Manage brands
						</DropdownMenuItem>
					</Link>
				</DropdownMenuContent>
			</DropdownMenu>

			<BrandDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} />
		</>
	);
}
