export interface Prompt {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  isFavorite: boolean;
  createdAt: number;
  updatedAt: number;
  usageCount: number;
}

export interface VaultData {
  prompts: Prompt[];
  version: number;
  lastSync: number;
}

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline';
export type SortBy = 'newest' | 'oldest' | 'most-used' | 'alphabetical' | 'recently-updated';
export type AppScreen = 'lock' | 'setup' | 'main';

export interface EncryptedBlob {
  salt: string;
  iv: string;
  data: string;
}
