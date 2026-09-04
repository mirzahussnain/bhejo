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
  private readonly baseUrl: string;
  private readonly serviceRoleKey: string;
  private readonly bucketName: string;

  constructor(
    supabaseUrl: string,
    serviceRoleKey: string,
    bucketName: string = process.env.STORAGE_BUCKET || "documents",
  ) {
    this.baseUrl = supabaseUrl.trim().replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
    this.serviceRoleKey = serviceRoleKey;
    this.bucketName = bucketName;
  }

  private headers(contentType?: string) {
    const h: Record<string, string> = {
      apikey: this.serviceRoleKey,
      Authorization: `Bearer ${this.serviceRoleKey}`,
    };
    if (contentType) {
      h["Content-Type"] = contentType;
    }
    return h;
  }

  async savePage(sessionId: string, pageId: string, buffer: Buffer): Promise<string> {
    const storagePath = `sessions/${sessionId}/pages/${pageId}.jpg`;
    const url = `${this.baseUrl}/storage/v1/object/${this.bucketName}/${storagePath}`;

    const res = await fetch(url, {
      method: "POST",
      headers: this.headers("image/jpeg"),
      body: new Uint8Array(buffer),
    });

    if (!res.ok) {
      throw new Error(`Failed to upload to Supabase storage: ${res.statusText}`);
    }

    return storagePath;
  }

  async getPage(storagePath: string): Promise<Buffer | null> {
    const url = `${this.baseUrl}/storage/v1/object/${this.bucketName}/${storagePath}`;
    const res = await fetch(url, {
      method: "GET",
      headers: this.headers(),
    });

    if (!res.ok) {
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async deleteSessionPages(sessionId: string): Promise<void> {
    const listUrl = `${this.baseUrl}/storage/v1/object/list/${this.bucketName}`;
    const listRes = await fetch(listUrl, {
      method: "POST",
      headers: this.headers("application/json"),
      body: JSON.stringify({
        prefix: `sessions/${sessionId}`,
      }),
    });

    if (!listRes.ok) {
      return;
    }

    const files = (await listRes.json()) as Array<{ name: string }>;
    if (!files || files.length === 0) {
      return;
    }

    const prefixes = files.map((f) => `sessions/${sessionId}/${f.name}`);
    await fetch(`${this.baseUrl}/storage/v1/object/${this.bucketName}`, {
      method: "DELETE",
      headers: this.headers("application/json"),
      body: JSON.stringify({ prefixes }),
    });
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
