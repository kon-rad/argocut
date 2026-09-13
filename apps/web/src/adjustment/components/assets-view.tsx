"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { SlidersHorizontalIcon } from "@hugeicons/core-free-icons";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import {
	Section,
	SectionContent,
	SectionHeader,
	SectionTitle,
	SectionFields,
} from "@/components/section";
import { PropertyParamField } from "@/components/editor/panels/properties/components/property-param-field";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { effectsRegistry } from "@/effects";
import { useEditor } from "@/editor/use-editor";
import { isVisualElement } from "@/timeline/element-utils";
import type { VisualElement } from "@/timeline";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import { useElementPreview } from "@/timeline/hooks/use-element-preview";

const COLOR_GRADING_EFFECT_TYPE = "color-grading";

export function AdjustmentView() {
	const editor = useEditor();
	const { selectedElements } = useElementSelection();

	if (selectedElements.length !== 1) {
		return (
			<PanelView title="Adjustment">
				<EmptyState
					message={
						selectedElements.length === 0
							? "Select a clip on the timeline to adjust its color."
							: "Select a single clip to adjust its color."
					}
				/>
			</PanelView>
		);
	}

	const elementsWithTracks = editor.timeline.getElementsWithTracks({
		elements: selectedElements,
	});
	const elementWithTrack = elementsWithTracks[0];

	if (!elementWithTrack || !isVisualElement(elementWithTrack.element)) {
		return (
			<PanelView title="Adjustment">
				<EmptyState message="Color grading works on video, image, sticker, and graphic clips." />
			</PanelView>
		);
	}

	return (
		<PanelView title="Adjustment" contentClassName="px-0">
			<ColorGradingSection
				element={elementWithTrack.element}
				trackId={elementWithTrack.track.id}
			/>
		</PanelView>
	);
}

function ColorGradingSection({
	element,
	trackId,
}: {
	element: VisualElement;
	trackId: string;
}) {
	const editor = useEditor();
	const { renderElement, previewUpdates, commit } = useElementPreview({
		trackId,
		elementId: element.id,
		fallback: element,
	});

	const committedEffects = element.effects ?? [];
	const renderEffects = (renderElement as VisualElement).effects ?? committedEffects;
	const colorGradingEffect = renderEffects.find(
		(effect) => effect.type === COLOR_GRADING_EFFECT_TYPE,
	);
	const isEnabled = committedEffects.some(
		(effect) => effect.type === COLOR_GRADING_EFFECT_TYPE,
	);
	const definition = effectsRegistry.get(COLOR_GRADING_EFFECT_TYPE);

	const handleToggle = (enabled: boolean) => {
		if (enabled) {
			editor.timeline.addClipEffect({
				trackId,
				elementId: element.id,
				effectType: COLOR_GRADING_EFFECT_TYPE,
			});
			return;
		}

		const existing = committedEffects.find(
			(effect) => effect.type === COLOR_GRADING_EFFECT_TYPE,
		);
		if (existing) {
			editor.timeline.removeClipEffect({
				trackId,
				elementId: element.id,
				effectId: existing.id,
			});
		}
	};

	const previewParam =
		(key: string) => (value: number | string | boolean) => {
			if (!colorGradingEffect) return;
			const updatedEffects = renderEffects.map((existing) =>
				existing.id !== colorGradingEffect.id
					? existing
					: { ...existing, params: { ...existing.params, [key]: value } },
			);
			previewUpdates({ effects: updatedEffects });
		};

	return (
		<Section showTopBorder={false} showBottomBorder={false}>
			<SectionHeader
				trailing={
					<Switch
						checked={isEnabled}
						onCheckedChange={handleToggle}
						aria-label="Enable Color Grading"
					/>
				}
			>
				<SectionTitle>Color Grading</SectionTitle>
			</SectionHeader>
			{colorGradingEffect && (
				<SectionContent className="p-0">
					<SectionFields>
						{definition.params.map((param) => (
							<div key={param.key} className="flex flex-col gap-3.5">
								<div className="px-4">
									<PropertyParamField
										param={param}
										value={colorGradingEffect.params[param.key] ?? param.default}
										onPreview={previewParam(param.key)}
										onCommit={commit}
									/>
								</div>
								<Separator />
							</div>
						))}
					</SectionFields>
				</SectionContent>
			)}
		</Section>
	);
}

function EmptyState({ message }: { message: string }) {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
			<HugeiconsIcon
				icon={SlidersHorizontalIcon}
				className="text-muted-foreground/75 size-10"
				strokeWidth={1}
			/>
			<p className="text-muted-foreground text-sm text-balance max-w-52">
				{message}
			</p>
		</div>
	);
}
