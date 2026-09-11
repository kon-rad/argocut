import { BlobSource, UrlSource, type Source } from "mediabunny";

/**
 * Video assets loaded from server storage carry a `url` but no `file` — the
 * whole point is to avoid pulling a multi-GB clip into memory before mediabunny
 * can read a single frame from it. `UrlSource` reads over HTTP range requests
 * instead. When a real `File` is already in memory (new imports, OPFS/local
 * storage, audio/image assets), `BlobSource` is preferred since it needs no
 * network round trip.
 */
export function sourceForMediaAsset({
	file,
	url,
}: {
	file?: File;
	url?: string;
}): Source {
	if (file) return new BlobSource(file);
	if (url) return new UrlSource(url);
	throw new Error("Media asset has neither a file nor a url to read from");
}
