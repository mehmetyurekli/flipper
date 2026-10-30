import { Injectable, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { config } from '../config';

/** Abstract storage so local disk can later be swapped for S3 etc. */
export abstract class StorageService {
  /** Persist a PNG buffer and return its absolute public URL. */
  abstract save(buffer: Buffer): Promise<string>;
}

@Injectable()
export class LocalDiskStorageService extends StorageService implements OnModuleInit {
  private readonly root = config.uploadsDir;

  async onModuleInit() {
    await fs.mkdir(this.root, { recursive: true });
  }

  async save(buffer: Buffer): Promise<string> {
    const name = `${randomUUID()}.png`;
    const target = path.resolve(this.root, name);
    // Defence in depth: the name is generated, but make sure it stays inside the root.
    if (path.dirname(target) !== this.root) throw new Error('Invalid storage path');
    await fs.writeFile(target, buffer, { flag: 'wx' });
    return `${config.publicUrl}/uploads/${name}`;
  }
}
