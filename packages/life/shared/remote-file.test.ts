import { rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { RemoteFile } from "./remote-file";

const TEST_CACHE_DIR = path.join(os.tmpdir(), "lifejs-test-cache");

const createFile = (remotePath = "test-1mib.bin", noProgressLogging = true) =>
  new RemoteFile({ name: "Test File", remotePath, noProgressLogging });

const clearCache = () =>
  rm(TEST_CACHE_DIR, { recursive: true, force: true }).catch(() => undefined);

beforeAll(() => {
  process.env.LIFEJS_CACHE = TEST_CACHE_DIR;
});

afterAll(async () => {
  process.env.LIFEJS_CACHE = undefined;
  await clearCache();
});

describe("RemoteFile", () => {
  describe("downloading", () => {
    beforeEach(clearCache);

    it("downloads file and returns local path", async () => {
      const [error, localPath] = await createFile().getLocalPath();

      expect(error).toBeUndefined();
      expect(localPath).toBeDefined();
      expect(localPath).toContain(".bin");

      if (!localPath) throw new Error("Expected localPath");
      const stats = await stat(localPath);
      expect(stats.size).toBe(1024 * 1024); // 1 MiB
    }, 30_000);

    it("logs progress during download", async () => {
      const spy = vi.spyOn(console, "log");
      await createFile("test-1mib.bin", false).getLocalPath();

      const logs = spy.mock.calls.flat().join("\n");
      expect(logs).toContain("Downloading");
      expect(logs).toContain("%");
      spy.mockRestore();
    }, 30_000);

    it("skips logging when disabled", async () => {
      const spy = vi.spyOn(console, "log");
      await createFile("test-1mib.bin", true).getLocalPath();

      const logs = spy.mock.calls.flat().join("\n");
      expect(logs).not.toContain("Downloading");
      spy.mockRestore();
    }, 30_000);
  });

  describe("caching", () => {
    beforeEach(clearCache);

    it("returns cached path on subsequent calls", async () => {
      const file = createFile();
      const [, path1] = await file.getLocalPath();

      const start = Date.now();
      const [, path2] = await file.getLocalPath();

      expect(path1).toBe(path2);
      expect(Date.now() - start).toBeLessThan(500);
    }, 30_000);

    it("uses content-addressed storage (etag-based filename)", async () => {
      const [error, localPath] = await createFile().getLocalPath();

      expect(error).toBeUndefined();
      if (!localPath) throw new Error("Expected localPath");
      const filename = path.basename(localPath, ".bin");
      expect(filename.length).toBeGreaterThan(10); // etag hash
    }, 30_000);

    it("shares cache between different RemoteFile instances", async () => {
      const [, path1] = await createFile().getLocalPath();
      const [, path2] = await createFile().getLocalPath();

      expect(path1).toBe(path2);
    }, 30_000);
  });

  describe("error handling", () => {
    it("returns NotFound for non-existent files", async () => {
      const [error] = await createFile("does-not-exist.png").getLocalPath();

      expect(error).toBeDefined();
      expect(error?.code).toBe("NotFound");
      expect(error?.message).toContain("lifejs/files");
    }, 30_000);
  });

  describe("concurrency", () => {
    beforeEach(clearCache);

    it("handles concurrent downloads safely (small file)", async () => {
      const files = Array.from({ length: 3 }, () => createFile());
      const results = await Promise.all(files.map((f) => f.getLocalPath()));

      const paths = results.map(([err, p]) => {
        expect(err).toBeUndefined();
        return p;
      });

      // All should resolve to same cached path
      expect(new Set(paths).size).toBe(1);
    }, 60_000);

    it("shows waiting progress during concurrent large downloads", async () => {
      const spy = vi.spyOn(console, "log");

      // Use 50MB file - takes long enough for waiting processes to poll
      const files = Array.from(
        { length: 3 },
        () =>
          new RemoteFile({
            name: "Large File",
            remotePath: "test-50mib.bin",
            noProgressLogging: false,
          }),
      );
      const results = await Promise.all(files.map((f) => f.getLocalPath()));

      // All should succeed
      for (const [err, p] of results) {
        expect(err).toBeUndefined();
        expect(p).toBeDefined();
      }

      const logs = spy.mock.calls.flat().join("\n");

      // One process downloads, others wait
      expect(logs).toContain("Downloading");
      expect(logs).toContain("Waiting");

      spy.mockRestore();
    }, 120_000);
  });
});
