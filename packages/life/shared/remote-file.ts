import { close, createWriteStream, open } from "node:fs";
import { mkdir, readdir, rename, stat, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { downloadFile, fileDownloadInfo } from "@huggingface/hub";
import { lifeError } from "./error";
import * as op from "./operation";

const fsOpen = promisify(open);
const fsClose = promisify(close);

const HF_REPO = "lifejs/files";
const POLL_INTERVAL_MS = 500;
const STALL_TIMEOUT_MS = 30_000;
const LOG_INTERVAL_MS = 3000;

// Track active downloads for cleanup on process exit
const activeDownloads = new Set<{ tempPath: string; abort: () => void }>();

const cleanup = () => {
  for (const download of activeDownloads) {
    download.abort();
    unlink(download.tempPath).catch(() => undefined);
  }
  activeDownloads.clear();
};

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

interface RemoteFileOptions {
  name: string;
  remotePath: string;
  noProgressLogging?: boolean;
}

interface ProgressState {
  lastLoggedPercent: number;
  lastLogTime: number;
}

/**
 * Downloads files from HuggingFace (lifejs/files) with content-addressed caching.
 * Handles concurrent downloads safely via file locking.
 */
export class RemoteFile {
  readonly options: RemoteFileOptions;

  constructor(options: RemoteFileOptions) {
    this.options = options;
  }

  /** Downloads file if needed and returns local path. */
  async getLocalPath(): Promise<op.OperationResult<string>> {
    return await op.attempt(async () => {
      const cacheDir = process.env.LIFEJS_CACHE ?? path.join(os.homedir(), ".cache", "lifejs");
      const info = await fileDownloadInfo({ repo: HF_REPO, path: this.options.remotePath });

      if (!info)
        throw lifeError({
          code: "NotFound",
          message: `Remote file not found: ${HF_REPO}/${this.options.remotePath}`,
        });

      const etag = info.etag.replace(/"/g, "");
      const ext = path.extname(this.options.remotePath) || ".bin";
      const cachedPath = path.join(cacheDir, `${etag}${ext}`);

      // Return if already cached
      if (await this.#exists(cachedPath)) return cachedPath;

      await mkdir(cacheDir, { recursive: true });
      const lockPath = `${cachedPath}.lock`;

      // If lock taken, wait for other process to complete
      if (!(await this.#acquireLock(lockPath))) {
        return this.#waitForDownload(cachedPath, lockPath, info.size);
      }

      try {
        // Double-check after acquiring lock
        if (await this.#exists(cachedPath)) return cachedPath;
        return await this.#download(cachedPath, info.size);
      } finally {
        await unlink(lockPath).catch(() => undefined);
      }
    });
  }

  async #download(cachedPath: string, totalSize: number): Promise<string> {
    const blob = await downloadFile({ repo: HF_REPO, path: this.options.remotePath });
    if (!blob) throw lifeError({ code: "Upstream", message: "Download failed" });

    const tempPath = `${cachedPath}.${process.pid}.${Date.now()}.tmp`;
    const abortController = new AbortController();
    const downloadHandle = { tempPath, abort: () => abortController.abort() };

    activeDownloads.add(downloadHandle);

    try {
      let downloaded = 0;
      const progressState: ProgressState = { lastLoggedPercent: -1, lastLogTime: 0 };

      const progressStream = new TransformStream<Uint8Array, Uint8Array>({
        transform: (chunk, controller) => {
          if (abortController.signal.aborted) {
            controller.error(new Error("Download aborted"));
            return;
          }
          downloaded += chunk.length;
          this.#logProgress("Downloading", downloaded, totalSize, progressState);
          controller.enqueue(chunk);
        },
      });

      await pipeline(
        Readable.fromWeb(blob.stream().pipeThrough(progressStream) as never),
        createWriteStream(tempPath),
      );

      await rename(tempPath, cachedPath);
      return cachedPath;
    } finally {
      activeDownloads.delete(downloadHandle);
    }
  }

  async #acquireLock(lockPath: string): Promise<boolean> {
    try {
      const fd = await fsOpen(lockPath, "wx");
      await fsClose(fd);
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "EEXIST") return false;
      throw err;
    }
  }

  async #waitForDownload(cachedPath: string, lockPath: string, expectedSize: number): Promise<string> {
    const state = { lastSize: 0, lastProgressAt: Date.now() };
    const progressState: ProgressState = { lastLoggedPercent: -1, lastLogTime: 0 };

    while (true) {
      const result = await this.#pollDownloadStatus(cachedPath, lockPath, expectedSize, state, progressState);
      if (result) return result;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }

  async #pollDownloadStatus(
    cachedPath: string,
    lockPath: string,
    expectedSize: number,
    state: { lastSize: number; lastProgressAt: number },
    progressState: ProgressState,
  ): Promise<string | null> {
    if (await this.#exists(cachedPath)) return cachedPath;

    const lockExists = await this.#exists(lockPath);
    if (!lockExists) {
      if (await this.#exists(cachedPath)) return cachedPath;
      throw lifeError({ code: "Upstream", message: "Download failed by another process" });
    }

    const currentSize = await this.#getTempFileSize(cachedPath);
    if (currentSize > state.lastSize) {
      state.lastSize = currentSize;
      state.lastProgressAt = Date.now();
      this.#logProgress("Waiting", currentSize, expectedSize, progressState);
    }

    if (Date.now() - state.lastProgressAt > STALL_TIMEOUT_MS) {
      throw lifeError({
        code: "Timeout",
        message: `Download stalled (no progress for ${STALL_TIMEOUT_MS / 1000}s)`,
      });
    }

    return null;
  }

  #logProgress(action: string, current: number, total: number, state: ProgressState): void {
    if (this.options.noProgressLogging || total <= 0) return;

    const percent = Math.floor((current / total) * 100);
    const now = Date.now();
    const isComplete = percent >= 100;
    const isNewPercent = percent > state.lastLoggedPercent;
    const isTimeElapsed = now - state.lastLogTime >= LOG_INTERVAL_MS;
    const shouldLog = isComplete || (isNewPercent && isTimeElapsed);

    if (!shouldLog) return;

    state.lastLoggedPercent = percent;
    state.lastLogTime = now;
    const emoji = isComplete ? "✅" : "⏳";
    console.log(`${emoji} ${action} '${this.options.name}' [${percent}%]`);
  }

  async #getTempFileSize(cachedPath: string): Promise<number> {
    try {
      const dir = path.dirname(cachedPath);
      const base = path.basename(cachedPath);
      const files = await readdir(dir);
      let max = 0;
      for (const f of files) {
        if (f.startsWith(base) && f.endsWith(".tmp")) {
          const s = await stat(path.join(dir, f)).catch(() => null);
          if (s && s.size > max) max = s.size;
        }
      }
      return max;
    } catch {
      return 0;
    }
  }

  async #exists(filePath: string): Promise<boolean> {
    try {
      await stat(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
