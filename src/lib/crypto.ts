// AES-256-GCM encryption using Web Crypto API
// PIN is used to derive the encryption key via PBKDF2

const ITERATIONS = 100000;
const VERIFY_PHRASE = 'PROMPTVAULT_V1_OK';

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pin),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encrypt(plaintext: string, pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pin, salt);

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    new TextEncoder().encode(plaintext)
  );

  // Pack: salt(16) + iv(12) + ciphertext
  const encBytes = new Uint8Array(encrypted);
  const combined = new Uint8Array(salt.length + iv.length + encBytes.length);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(encBytes, salt.length + iv.length);

  return arrayBufferToBase64(combined.buffer as ArrayBuffer);
}

export async function decrypt(encryptedBase64: string, pin: string): Promise<string> {
  const combined = base64ToUint8Array(encryptedBase64);
  const salt = combined.slice(0, 16);
  const iv = combined.slice(16, 28);
  const data = combined.slice(28);

  const key = await deriveKey(pin, salt);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    data as unknown as BufferSource
  );

  return new TextDecoder().decode(decrypted);
}

// Store an encrypted verification phrase so we can check if PIN is correct
export async function createPinVerifier(pin: string): Promise<string> {
  return encrypt(VERIFY_PHRASE, pin);
}

export async function verifyPin(pin: string, verifier: string): Promise<boolean> {
  try {
    const result = await decrypt(verifier, pin);
    return result === VERIFY_PHRASE;
  } catch {
    return false;
  }
}
