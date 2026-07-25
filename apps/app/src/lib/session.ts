import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Session storage.
 *
 * The access token is held in memory only and never persisted: it lives 15 minutes, and
 * writing it to disk buys nothing while widening the attack surface. Only the refresh
 * token is stored.
 *
 * Storage differs by platform for a real reason rather than convenience:
 *
 *   native — expo-secure-store, backed by the iOS keychain and Android keystore.
 *   web    — localStorage, which is readable by any script that achieves XSS.
 *
 * The web position is a known compromise. The proper fix is an httpOnly cookie the
 * client cannot read, which needs the API to set it on the auth responses and a CSRF
 * defence on refresh. That is planned; until then the exposure is a refresh token on a
 * club site with no payment data, which is a reasonable interim risk to carry knowingly
 * rather than accidentally.
 */

const REFRESH_KEY = 'kv.refresh_token';

let accessToken: string | null = null;
let accessExpiresAt = 0;

export function getAccessToken(): string | null {
  // Treat a token within 30s of expiry as already expired, so a request cannot be sent
  // with a token that dies in flight.
  if (!accessToken || Date.now() > accessExpiresAt - 30_000) return null;
  return accessToken;
}

export function setAccessToken(token: string, expiresInSeconds: number): void {
  accessToken = token;
  accessExpiresAt = Date.now() + expiresInSeconds * 1000;
}

export function clearAccessToken(): void {
  accessToken = null;
  accessExpiresAt = 0;
}

export async function getRefreshToken(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(REFRESH_KEY) ?? null;
    return await SecureStore.getItemAsync(REFRESH_KEY);
  } catch {
    // Storage unavailable (private browsing, keychain locked) is a logged-out state,
    // not a crash.
    return null;
  }
}

export async function setRefreshToken(token: string): Promise<void> {
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(REFRESH_KEY, token);
    else await SecureStore.setItemAsync(REFRESH_KEY, token);
  } catch {
    // Session simply will not survive a restart.
  }
}

export async function clearRefreshToken(): Promise<void> {
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.removeItem(REFRESH_KEY);
    else await SecureStore.deleteItemAsync(REFRESH_KEY);
  } catch {
    /* nothing useful to do */
  }
}

export async function clearSession(): Promise<void> {
  clearAccessToken();
  await clearRefreshToken();
}
