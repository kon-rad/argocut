import { BrandFolderError } from "./folder";

/**
 * Route handlers for brands all fail the same two ways: the user gave a path
 * that does not work (their problem, and fixable — say what is wrong), or
 * something else broke (ours).
 */
export function brandError(error: unknown): Response {
	if (error instanceof BrandFolderError) {
		return Response.json({ error: error.message }, { status: 400 });
	}
	console.error("[brands]", error);
	return Response.json({ error: String(error) }, { status: 500 });
}

export function notFound(what = "Brand"): Response {
	return Response.json({ error: `${what} not found` }, { status: 404 });
}
