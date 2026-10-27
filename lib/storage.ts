import { constants, createReadStream } from "node:fs";
import type { Readable } from "node:stream";
import { access, copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Storage abstraction. Dev uses the local filesystem under STORAGE_LOCAL_DIR;
 * production can swap in S3/R2 by implementing this interface.
 *
 * Renders are addressed by *key* (e.g. `renders/<jobId>/video.mp4`), never by
 * absolute path, so the database stays portable across drivers.
 */
export interface StorageDriver {
  readonly name: string;
  putFile(sourcePath: string, key: string): Promise<void>;
  putBuffer(data: Buffer, key: string): Promise<void>;
  /** Absolute local path. Only meaningful for the local driver. */
  localPath(key: string): string;
  exists(key: string): Promise<boolean>;
  size(key: string): Promise<number>;
  read(key: string): Promise<Buffer>;
  /**
   * Byte range of a stored file as a Node readable. `end` is inclusive and
   * defaults to the last byte — this is what powers HTTP Range requests when
   * a browser seeks inside a video.
   */
  readStream(
    key: string,
    range?: { start: number; end?: number }
  ): Promise<Readable>;
  /** Best-effort delete. Missing files are not an error. */
  remove(key: string): Promise<void>;
  /** Best-effort recursive delete of everything under a key prefix. */
  removePrefix(prefix: string): Promise<void>;
}

/**
 * Single source of truth for where a job's media lives. The key is a logical
 * path, not a filesystem path, so swapping in S3/R2 later needs no schema
 * change.
 */
export function renderPrefix(jobId: string): string {
  return `renders/${jobId}`;
}

/** Prefix for one user's uploaded files, e.g. `uploads/<userId>/<assetId>`. */
export function uploadPrefix(userId: string, assetId: string): string {
  assertSafeKey(userId);
  assertSafeKey(assetId);
  return `uploads/${userId}/${assetId}`;
}

/** Prefix for every file a project produces, e.g. `projects/<projectId>/`. */
export function projectPrefix(projectId: string): string {
  assertSafeKey(projectId);
  return `projects/${projectId}`;
}

function assertSafeKey(key: string): void {
  if (!key || key.includes("..") || path.isAbsolute(key) || key.startsWith("/")) {
    throw new Error(`Unsafe storage key: ${key}`);
  }
}

class LocalStorage implements StorageDriver {
  readonly name = "local";
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  localPath(key: string): string {
    assertSafeKey(key);
    return path.join(this.root, key);
  }

  private async ensureParent(key: string): Promise<string> {
    const dest = this.localPath(key);
    await mkdir(path.dirname(dest), { recursive: true });
    return dest;
  }

  async putFile(sourcePath: string, key: string): Promise<void> {
    const dest = await this.ensureParent(key);
    await copyFile(sourcePath, dest);
  }

  async putBuffer(data: Buffer, key: string): Promise<void> {
    const dest = await this.ensureParent(key);
    await writeFile(dest, data);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await access(this.localPath(key), constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async size(key: string): Promise<number> {
    const info = await stat(this.localPath(key));
    return info.size;
  }

  async read(key: string): Promise<Buffer> {
    return readFile(this.localPath(key));
  }

  async readStream(
    key: string,
    range?: { start: number; end?: number }
  ): Promise<Readable> {
    const target = this.localPath(key);
    if (!range) return createReadStream(target);

    const info = await stat(target);
    const start = Math.max(0, Math.min(range.start, info.size - 1));
    const end = Math.max(start, Math.min(range.end ?? info.size - 1, info.size - 1));
    return createReadStream(target, { start, end });
  }

  async remove(key: string): Promise<void> {
    await rm(this.localPath(key), { force: true });
  }

  async removePrefix(prefix: string): Promise<void> {
    await rm(this.localPath(prefix), { recursive: true, force: true });
  }
}

let cached: StorageDriver | null = null;

export function getStorage(): StorageDriver {
  if (cached) return cached;

  const driver = process.env.STORAGE_DRIVER ?? "local";
  if (driver !== "local") {
    throw new Error(
      `Unsupported STORAGE_DRIVER "${driver}". Only "local" is implemented.`
    );
  }

  cached = new LocalStorage(process.env.STORAGE_LOCAL_DIR ?? "./storage");
  return cached;
}
