"use client";

import { useCallback, useRef, useState } from "react";
import { useEditor } from "@/editor/use-editor";
import {
	getElementFadeInDuration,
	getElementFadeOutDuration,
} from "@/timeline/audio-state";
import { clampFadeDuration } from "@/timeline/fade-drag";
import type { AudioElement } from "@/timeline/types";
import { TICKS_PER_SECOND } from "@/wasm";
import { cn } from "@/utils/ui";

const HANDLE_SIZE_PX = 12;

type FadeSide = "in" | "out";

function useFadeHandleDrag({
	element,
	trackId,
	side,
	pixelsPerSecond,
}: {
	element: AudioElement;
	trackId: string;
	side: FadeSide;
	pixelsPerSecond: number;
}) {
	const editor = useEditor();
	const activePointerIdRef = useRef<number | null>(null);
	const startClientXRef = useRef(0);
	const startDurationRef = useRef(0);
	const hasChangedRef = useRef(false);
	const [isDragging, setIsDragging] = useState(false);

	const paramKey = side === "in" ? "fadeInDuration" : "fadeOutDuration";
	const currentDuration =
		side === "in"
			? getElementFadeInDuration({ element })
			: getElementFadeOutDuration({ element });
	const otherDuration =
		side === "in"
			? getElementFadeOutDuration({ element })
			: getElementFadeInDuration({ element });
	const clipDurationSeconds = element.duration / TICKS_PER_SECOND;

	const previewDuration = useCallback(
		(nextDuration: number) => {
			editor.timeline.previewElements({
				updates: [
					{
						trackId,
						elementId: element.id,
						updates: {
							params: { ...element.params, [paramKey]: nextDuration },
						},
					},
				],
			});
			hasChangedRef.current = nextDuration !== startDurationRef.current;
		},
		[editor, element.id, element.params, paramKey, trackId],
	);

	const finishDrag = useCallback(
		({ shouldCommit }: { shouldCommit: boolean }) => {
			activePointerIdRef.current = null;
			setIsDragging(false);

			if (shouldCommit && hasChangedRef.current) {
				editor.timeline.commitPreview();
			} else {
				editor.timeline.discardPreview();
			}

			hasChangedRef.current = false;
		},
		[editor],
	);

	const updateFromClientX = useCallback(
		(clientX: number) => {
			const draggedPx =
				side === "in"
					? clientX - startClientXRef.current
					: startClientXRef.current - clientX;
			const nextDuration = clampFadeDuration({
				rawSeconds: startDurationRef.current + draggedPx / pixelsPerSecond,
				otherFadeSeconds: otherDuration,
				clipDurationSeconds,
			});
			previewDuration(nextDuration);
		},
		[clipDurationSeconds, otherDuration, previewDuration, pixelsPerSecond, side],
	);

	const handleClick = useCallback((event: React.MouseEvent) => {
		event.preventDefault();
		event.stopPropagation();
	}, []);

	const handleMouseDown = useCallback((event: React.MouseEvent) => {
		event.stopPropagation();
	}, []);

	const handlePointerDown = useCallback(
		(event: React.PointerEvent<HTMLDivElement>) => {
			if (event.button !== 0) {
				return;
			}

			event.preventDefault();
			event.stopPropagation();
			editor.selection.setSelectedElements({
				elements: [{ trackId, elementId: element.id }],
			});
			activePointerIdRef.current = event.pointerId;
			startClientXRef.current = event.clientX;
			startDurationRef.current = currentDuration;
			hasChangedRef.current = false;
			setIsDragging(true);
			event.currentTarget.setPointerCapture(event.pointerId);
		},
		[currentDuration, editor.selection, element.id, trackId],
	);

	const handlePointerMove = useCallback(
		(event: React.PointerEvent) => {
			if (activePointerIdRef.current !== event.pointerId) {
				return;
			}

			event.preventDefault();
			updateFromClientX(event.clientX);
		},
		[updateFromClientX],
	);

	const handlePointerUp = useCallback(
		(event: React.PointerEvent) => {
			if (activePointerIdRef.current !== event.pointerId) {
				return;
			}

			event.preventDefault();
			event.stopPropagation();
			finishDrag({ shouldCommit: true });
		},
		[finishDrag],
	);

	const handlePointerCancel = useCallback(
		(event: React.PointerEvent) => {
			if (activePointerIdRef.current !== event.pointerId) {
				return;
			}

			event.preventDefault();
			event.stopPropagation();
			finishDrag({ shouldCommit: false });
		},
		[finishDrag],
	);

	const handleLostPointerCapture = useCallback(() => {
		if (activePointerIdRef.current === null) {
			return;
		}

		finishDrag({ shouldCommit: hasChangedRef.current });
	}, [finishDrag]);

	return {
		isDragging,
		currentDuration,
		handleClick,
		handleMouseDown,
		handlePointerDown,
		handlePointerMove,
		handlePointerUp,
		handlePointerCancel,
		handleLostPointerCapture,
	};
}

function FadeHandle({
	element,
	trackId,
	side,
	pixelsPerSecond,
}: {
	element: AudioElement;
	trackId: string;
	side: FadeSide;
	pixelsPerSecond: number;
}) {
	const {
		isDragging,
		currentDuration,
		handleClick,
		handleMouseDown,
		handlePointerDown,
		handlePointerMove,
		handlePointerUp,
		handlePointerCancel,
		handleLostPointerCapture,
	} = useFadeHandleDrag({ element, trackId, side, pixelsPerSecond });

	const isLeft = side === "in";
	const edgeProp = isLeft ? "left" : "right";
	const wedgeWidthPx = Math.max(0, currentDuration * pixelsPerSecond);
	const handleOffsetPx = Math.max(0, wedgeWidthPx - HANDLE_SIZE_PX / 2);

	return (
		<>
			{wedgeWidthPx > 0 && (
				<div
					className="pointer-events-none absolute inset-y-0"
					style={{
						[edgeProp]: 0,
						width: `${wedgeWidthPx}px`,
						clipPath: isLeft
							? "polygon(0 0, 100% 100%, 0 100%)"
							: "polygon(100% 0, 100% 100%, 0 100%)",
						backgroundColor: "rgba(0, 0, 0, 0.45)",
					}}
				/>
			)}
			{/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- custom drag widget for clip fade duration; mirrors AudioVolumeLine's pointer-driven handle. */}
			<div
				className={cn(
					"absolute top-1 -translate-y-1/2 size-3 touch-none cursor-ew-resize rounded-full border pointer-events-auto transition-colors",
					isDragging
						? "border-white bg-white"
						: "border-white/70 bg-white/40 opacity-0 group-hover/audio:opacity-100",
				)}
				style={{ [edgeProp]: `${handleOffsetPx}px` }}
				onClick={handleClick}
				onMouseDown={handleMouseDown}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
				onPointerCancel={handlePointerCancel}
				onLostPointerCapture={handleLostPointerCapture}
				title={side === "in" ? "Drag to set fade in" : "Drag to set fade out"}
			/>
		</>
	);
}

export function AudioFadeHandles({
	element,
	trackId,
	pixelsPerSecond,
}: {
	element: AudioElement;
	trackId: string;
	pixelsPerSecond: number;
}) {
	return (
		<div className="pointer-events-none absolute inset-0">
			<FadeHandle
				element={element}
				trackId={trackId}
				side="in"
				pixelsPerSecond={pixelsPerSecond}
			/>
			<FadeHandle
				element={element}
				trackId={trackId}
				side="out"
				pixelsPerSecond={pixelsPerSecond}
			/>
		</div>
	);
}
