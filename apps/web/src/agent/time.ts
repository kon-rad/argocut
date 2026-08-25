import { mediaTimeFromSeconds, TICKS_PER_SECOND, type MediaTime } from "@/wasm";

export function toMediaTime({ seconds }: { seconds: number }): MediaTime {
	if (!Number.isFinite(seconds)) {
		throw new Error(`Expected a finite number of seconds, got ${seconds}`);
	}
	if (seconds < 0) {
		throw new Error(`Expected a non-negative number of seconds, got ${seconds}`);
	}

	return mediaTimeFromSeconds({ seconds });
}

export function toSeconds({ time }: { time: MediaTime }): number {
	return time / TICKS_PER_SECOND;
}
