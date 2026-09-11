type FileSystemWriteChunkType =
	| BufferSource
	| Blob
	| string
	| { type: "write"; data: BufferSource | Blob | string; position?: number }
	| { type: "seek"; position: number }
	| { type: "truncate"; size: number };

interface FileSystemWritableFileStream extends WritableStream {
	write(data: FileSystemWriteChunkType): Promise<void>;
	seek(position: number): Promise<void>;
	truncate(size: number): Promise<void>;
}

interface FileSystemFileHandle {
	createWritable(options?: {
		keepExistingData?: boolean;
	}): Promise<FileSystemWritableFileStream>;
}

interface SaveFilePickerOptions {
	suggestedName?: string;
	types?: { description?: string; accept: Record<string, string[]> }[];
	excludeAcceptAllOption?: boolean;
}

interface Window {
	showSaveFilePicker?(
		options?: SaveFilePickerOptions,
	): Promise<FileSystemFileHandle>;
}
