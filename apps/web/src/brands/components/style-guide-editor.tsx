"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ReactMarkdownWrapper } from "@/components/ui/react-markdown-wrapper";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useBrandsStore } from "../store";
import type { BrandWithStatus } from "../types";

/**
 * The style guide, edited in place.
 *
 * Writes straight back to the `.md` in the brand folder rather than to a
 * database column, so the same file stays editable in Obsidian, diffable in
 * git, and readable by any skill that knows the path. This editor is one way in
 * among several, not the way in.
 */
export function StyleGuideEditor({ brand }: { brand: BrandWithStatus }) {
	const saveStyleGuide = useBrandsStore((state) => state.saveStyleGuide);

	const [content, setContent] = useState<string | null>(null);
	const [saved, setSaved] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const response = await fetch(`/api/brands/${brand.id}/style-guide`);
				if (!response.ok) throw new Error(await response.text());
				const body = (await response.json()) as { content: string | null };
				if (cancelled) return;
				setContent(body.content ?? "");
				setSaved(body.content ?? "");
			} catch {
				if (!cancelled) {
					setContent("");
					setSaved("");
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [brand.id]);

	if (content === null) {
		return <p className="text-muted-foreground text-sm">Loading style guide…</p>;
	}

	const isDirty = content !== saved;

	const save = async () => {
		setIsSaving(true);
		try {
			await saveStyleGuide({ id: brand.id, content });
			setSaved(content);
			toast.success(`Saved ${brand.styleGuidePath}`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between gap-3">
				<p className="text-muted-foreground font-mono text-xs">
					{brand.rootPath}/{brand.styleGuidePath}
				</p>
				<Button size="sm" disabled={!isDirty || isSaving} onClick={save}>
					{isSaving ? "Saving…" : isDirty ? "Save" : "Saved"}
				</Button>
			</div>

			<Tabs defaultValue="edit">
				<TabsList>
					<TabsTrigger value="edit">Edit</TabsTrigger>
					<TabsTrigger value="preview">Preview</TabsTrigger>
				</TabsList>

				<TabsContent value="edit" className="pt-3">
					<Textarea
						value={content}
						spellCheck={false}
						// The shared Textarea is `display: flex`, which makes `rows`
						// inert — it collapses to min-h-[60px]. Height has to be a class.
						className="min-h-[32rem] resize-y font-mono text-xs leading-relaxed"
						placeholder="Voice, colour, type, and how the assets are meant to be used."
						onChange={(event) => setContent(event.target.value)}
					/>
					<p className="text-muted-foreground pt-2 text-xs">
						YAML front matter with <code className="text-xs">colors:</code> and{" "}
						<code className="text-xs">fonts:</code> is read into the brand's
						tokens and shown on the palette.
					</p>
				</TabsContent>

				<TabsContent value="preview" className="pt-3">
					<div className="border-border max-h-[36rem] overflow-y-auto rounded-lg border p-4 text-sm">
						{content.trim() ? (
							<ReactMarkdownWrapper>{content}</ReactMarkdownWrapper>
						) : (
							<p className="text-muted-foreground">Nothing written yet.</p>
						)}
					</div>
				</TabsContent>
			</Tabs>
		</div>
	);
}
