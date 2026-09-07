import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface StorageService {
  savePage(sessionId: string, pageId: string, buffer: Buffer): Promise<string>;
  getPage(storagePath: string): Promise<Buffer | null>;
  deleteSessionPages(sessionId: string): Promise<void>;
}

export class InMemoryStorageService implements StorageService {
  private readonly files = new Map<string, Buffer>();

  async savePage(sessionId: string, pageId: string, buffer: Buffer): Promise<string> {
    const storagePath = `sessions/${sessionId}/pages/${pageId}.jpg`;
    this.files.set(storagePath, Buffer.from(buffer));
    return storagePath;
  }

  async getPage(storagePath: string): Promise<Buffer | null> {
    const file = this.files.get(storagePath);
    return file ? Buffer.from(file) : null;
  }

  async deleteSessionPages(sessionId: string): Promise<void> {
    const prefix = `sessions/${sessionId}/`;
    for (const key of this.files.keys()) {
      if (key.startsWith(prefix)) {
        this.files.delete(key);
      }
    }
  }

  clear(): void {
    this.files.clear();
  }
}

export class SupabaseStorageService implements StorageService {
  private readonly client: SupabaseClient;
  private readonly bucketName: string;

  constructor(
    supabaseUrl: string,
    secretKey: string,
    bucketName: string = process.env.STORAGE_BUCKET || "documents",
  ) {
    const baseUrl = supabaseUrl.trim().replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
    this.client = createClient(baseUrl, secretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    this.bucketName = bucketName;
  }

  async savePage(sessionId: string, pageId: string, buffer: Buffer): Promise<string> {
    const storagePath = `sessions/${sessionId}/pages/${pageId}.jpg`;

    const { error } = await this.client.storage
      .from(this.bucketName)
      .upload(storagePath, buffer, {
        contentType: "image/jpeg",
        upsert: true,
      });

    if (error) {
      throw new Error(`Failed to upload to Supabase storage: ${error.message}`);
    }

    return storagePath;
  }

  async getPage(storagePath: string): Promise<Buffer | null> {
    const cleanPath = storagePath.replace(/^\/+/, "");
    const { data, error } = await this.client.storage
      .from(this.bucketName)
      .download(cleanPath);

    if (error || !data) {
      return null;
    }

    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async deleteSessionPages(sessionId: string): Promise<void> {
    const { data: files, error } = await this.client.storage
      .from(this.bucketName)
      .list(`sessions/${sessionId}`);

    if (error || !files || files.length === 0) {
      return;
    }

    const prefixes = files.map((f) => `sessions/${sessionId}/${f.name}`);
    await this.client.storage.from(this.bucketName).remove(prefixes);
  }
}

let storageServiceInstance: StorageService | null = null;

export function getStorageService(): StorageService {
  if (storageServiceInstance) {
    return storageServiceInstance;
  }

  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "")
    .trim()
    .replace(/\/rest\/v1\/?$/i, "")
    .replace(/\/+$/, "");
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (supabaseUrl && secretKey) {
    storageServiceInstance = new SupabaseStorageService(supabaseUrl, secretKey);
  } else {
    storageServiceInstance = new InMemoryStorageService();
  }

  return storageServiceInstance;
}

export function setStorageServiceForTest(service: StorageService | null): void {
  storageServiceInstance = service;
}
