import { registerPlugin } from '@capacitor/core';
import { WordTag } from '../models/Tags';

declare module '@capacitor/core' {
  interface PluginRegistry {
    TagDB: TagDBPlugin;
  }
}

export interface TagDBPlugin {
  createDB(options: { name: string }): Promise<{ id: number }>;
  search(options: {
    id: number;
    query: string;
  }): Promise<{ results: WordTag[] }>;
  loadDB(options: { id: number; path: string }): Promise<void>;
  releaseDB(options: { id: number }): Promise<void>;
}

const TagDB = registerPlugin<TagDBPlugin>('TagDB');

export { TagDB };
