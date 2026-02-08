// GitHub Gist API wrapper — uses Secret Gists as a database

import type { VaultData } from '../types';

const GIST_FILENAME = 'promptvault_data.json';
const API_BASE = 'https://api.github.com';

interface GistFile {
  filename: string;
  content: string;
}

interface GistResponse {
  id: string;
  files: Record<string, GistFile>;
  description: string;
  updated_at: string;
}

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/vnd.github.v3+json',
  };
}

// Validate token by fetching user info
export async function validateToken(token: string): Promise<{ valid: boolean; username?: string }> {
  try {
    const res = await fetch(`${API_BASE}/user`, { headers: headers(token) });
    if (!res.ok) return { valid: false };
    const data = await res.json();
    return { valid: true, username: data.login };
  } catch {
    return { valid: false };
  }
}

// Find existing PromptVault gist
export async function findVaultGist(token: string): Promise<string | null> {
  try {
    // Check up to 3 pages of gists
    for (let page = 1; page <= 3; page++) {
      const res = await fetch(`${API_BASE}/gists?per_page=100&page=${page}`, {
        headers: headers(token),
      });
      if (!res.ok) return null;
      const gists: GistResponse[] = await res.json();
      if (gists.length === 0) break;

      const found = gists.find(g => GIST_FILENAME in g.files);
      if (found) return found.id;
    }
    return null;
  } catch {
    return null;
  }
}

// Load data from gist
export async function loadFromGist(token: string, gistId: string): Promise<VaultData | null> {
  try {
    const res = await fetch(`${API_BASE}/gists/${gistId}`, {
      headers: headers(token),
    });
    if (!res.ok) return null;
    const gist: GistResponse = await res.json();
    const file = gist.files[GIST_FILENAME];
    if (!file) return null;
    return JSON.parse(file.content) as VaultData;
  } catch {
    return null;
  }
}

// Save data to gist (create or update)
export async function saveToGist(
  token: string,
  gistId: string | null,
  data: VaultData
): Promise<string | null> {
  const body = {
    description: 'PromptVault — encrypted prompt storage (do not edit manually)',
    public: false,
    files: {
      [GIST_FILENAME]: {
        content: JSON.stringify(data, null, 2),
      },
    },
  };

  try {
    if (gistId) {
      // Update existing
      const res = await fetch(`${API_BASE}/gists/${gistId}`, {
        method: 'PATCH',
        headers: headers(token),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        console.error('Failed to update gist:', res.status);
        return null;
      }
      return gistId;
    } else {
      // Create new
      const res = await fetch(`${API_BASE}/gists`, {
        method: 'POST',
        headers: headers(token),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        console.error('Failed to create gist:', res.status);
        return null;
      }
      const gist: GistResponse = await res.json();
      return gist.id;
    }
  } catch (err) {
    console.error('Gist save error:', err);
    return null;
  }
}

// Delete a gist
export async function deleteGist(token: string, gistId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/gists/${gistId}`, {
      method: 'DELETE',
      headers: headers(token),
    });
    return res.ok || res.status === 204;
  } catch {
    return false;
  }
}
