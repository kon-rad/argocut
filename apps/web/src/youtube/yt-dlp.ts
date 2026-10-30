import { spawn } from "node:child_process";

export function runYtDlpCapture({ args }: { args: string[] }): Promise<string> {
	return new Promise((resolve, reject) => {
		const proc = spawn("yt-dlp", args, { shell: false });
		let stdout = "";
		let stderr = "";

		proc.stdout.on("data", (chunk) => {
			stdout += chunk.toString();
		});
		proc.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		proc.on("error", (error) => {
			reject(error);
		});
		proc.on("close", (code) => {
			if (code === 0) {
				resolve(stdout);
			} else {
				reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
			}
		});
	});
}

export function runYtDlp({ args }: { args: string[] }): Promise<void> {
	return new Promise((resolve, reject) => {
		const proc = spawn("yt-dlp", args, { shell: false });
		let stderr = "";

		proc.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		proc.on("error", (error) => {
			reject(error);
		});
		proc.on("close", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
			}
		});
	});
}
