let editorReady = false;
const waiters = new Set<() => void>();

export function setAgentEditorReady({ ready }: { ready: boolean }): void {
	editorReady = ready;
	if (ready) {
		for (const waiter of waiters) {
			waiter();
		}
		waiters.clear();
	}
}

export function isAgentEditorReady(): boolean {
	return editorReady;
}

export function waitForAgentEditor({
	timeoutMs = 30_000,
}: {
	timeoutMs?: number;
} = {}): Promise<void> {
	if (editorReady) {
		return Promise.resolve();
	}

	return new Promise((resolve, reject) => {
		const onReady = () => {
			clearTimeout(timer);
			resolve();
		};

		const timer = setTimeout(() => {
			waiters.delete(onReady);
			reject(new Error("Timed out waiting for the editor to finish loading"));
		}, timeoutMs);

		waiters.add(onReady);
	});
}
