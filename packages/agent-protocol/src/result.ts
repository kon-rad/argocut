export type AgentErrorCode =
	| "editor_not_ready"
	| "invalid_argument"
	| "not_found"
	| "op_refused"
	| "storage_quota"
	| "unsupported"
	| "internal";

export interface AgentErrorPayload {
	code: AgentErrorCode;
	message: string;
	details?: unknown;
}

export type AgentResult<T> =
	| { ok: true; value: T }
	| { ok: false; error: AgentErrorPayload };

export function ok<T>({ value }: { value: T }): AgentResult<T> {
	return { ok: true, value };
}

export function err<T>({
	code,
	message,
	details,
}: {
	code: AgentErrorCode;
	message: string;
	details?: unknown;
}): AgentResult<T> {
	return { ok: false, error: { code, message, details } };
}
