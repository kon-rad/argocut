"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useBrandsStore } from "../store";

/**
 * Two ways in: make a folder, or adopt one that already exists.
 *
 * They are genuinely different operations rather than one form with a checkbox.
 * Creating writes a scaffold into an empty directory; importing never writes
 * anything, because a brand folder you already maintain by hand should survive
 * being pointed at.
 */
export function BrandDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const createBrand = useBrandsStore((state) => state.createBrand);
	const importBrand = useBrandsStore((state) => state.importBrand);

	const [isSubmitting, setIsSubmitting] = useState(false);
	const [name, setName] = useState("");
	const [rootPath, setRootPath] = useState("");
	const [description, setDescription] = useState("");
	const [importPath, setImportPath] = useState("");
	const [importName, setImportName] = useState("");

	const reset = () => {
		setName("");
		setRootPath("");
		setDescription("");
		setImportPath("");
		setImportName("");
	};

	const close = () => {
		reset();
		onOpenChange(false);
	};

	const submit = async ({ action }: { action: () => Promise<unknown> }) => {
		setIsSubmitting(true);
		try {
			await action();
			close();
		} catch (error) {
			// The message is the useful part — the server explains what about the
			// path was wrong, and a generic toast would throw that away.
			toast.error(error instanceof Error ? error.message : String(error));
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Add a brand</DialogTitle>
					<DialogDescription>
						A brand is a folder on this machine: a style guide, and an{" "}
						<code className="text-xs">assets/</code> directory of logos, emblems
						and title cards. Everything you make while it is selected belongs to
						it.
					</DialogDescription>
				</DialogHeader>

				<Tabs defaultValue="create">
					<TabsList className="grid w-full grid-cols-2">
						<TabsTrigger value="create">New</TabsTrigger>
						<TabsTrigger value="import">Import folder</TabsTrigger>
					</TabsList>

					<TabsContent value="create" className="space-y-4 pt-4">
						<div className="space-y-2">
							<Label htmlFor="brand-name">Name</Label>
							<Input
								id="brand-name"
								value={name}
								placeholder="Argo"
								onChange={(event) => setName(event.target.value)}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="brand-root">Folder</Label>
							<Input
								id="brand-root"
								value={rootPath}
								placeholder="~/Brands/argo"
								spellCheck={false}
								onChange={(event) => setRootPath(event.target.value)}
							/>
							<p className="text-muted-foreground text-xs">
								Absolute path on this machine. Created if it does not exist,
								along with a starter style guide and an assets folder.
							</p>
						</div>
						<div className="space-y-2">
							<Label htmlFor="brand-description">Description</Label>
							<Textarea
								id="brand-description"
								rows={2}
								value={description}
								placeholder="What this brand is for."
								onChange={(event) => setDescription(event.target.value)}
							/>
						</div>
						<DialogFooter>
							<Button variant="outline" onClick={close} disabled={isSubmitting}>
								Cancel
							</Button>
							<Button
								disabled={isSubmitting || !name.trim() || !rootPath.trim()}
								onClick={() =>
									submit({
										action: () =>
											createBrand({
												input: {
													name: name.trim(),
													rootPath: rootPath.trim(),
													description: description.trim() || undefined,
												},
											}),
									})
								}
							>
								{isSubmitting ? "Creating…" : "Create brand"}
							</Button>
						</DialogFooter>
					</TabsContent>

					<TabsContent value="import" className="space-y-4 pt-4">
						<div className="space-y-2">
							<Label htmlFor="import-root">Folder</Label>
							<Input
								id="import-root"
								value={importPath}
								placeholder="~/Documents/secondbrain/Areas/argo"
								spellCheck={false}
								onChange={(event) => setImportPath(event.target.value)}
							/>
							<p className="text-muted-foreground text-xs">
								Nothing is written. The style guide and assets directory are
								found by name — <code className="text-xs">style-guide.md</code>,{" "}
								<code className="text-xs">assets/</code> and the usual variants.
							</p>
						</div>
						<div className="space-y-2">
							<Label htmlFor="import-name">Name</Label>
							<Input
								id="import-name"
								value={importName}
								placeholder="Defaults to the folder name"
								onChange={(event) => setImportName(event.target.value)}
							/>
						</div>
						<DialogFooter>
							<Button variant="outline" onClick={close} disabled={isSubmitting}>
								Cancel
							</Button>
							<Button
								disabled={isSubmitting || !importPath.trim()}
								onClick={() =>
									submit({
										action: () =>
											importBrand({
												input: {
													rootPath: importPath.trim(),
													name: importName.trim() || undefined,
												},
											}),
									})
								}
							>
								{isSubmitting ? "Importing…" : "Import brand"}
							</Button>
						</DialogFooter>
					</TabsContent>
				</Tabs>
			</DialogContent>
		</Dialog>
	);
}
