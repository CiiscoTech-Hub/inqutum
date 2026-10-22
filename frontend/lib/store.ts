import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Stellar public key starts with G and is 56 characters of base-32. */
const STELLAR_PUBLIC_KEY_RE = /^G[A-Z2-7]{55}$/;

/** Validate a Stellar public key. Returns the key unchanged or throws. */
export function validatePublicKey(key: string): string {
  if (!key || typeof key !== 'string') {
    throw new Error('Wallet public key must be a non-empty string');
  }
  const trimmed = key.trim();
  if (!STELLAR_PUBLIC_KEY_RE.test(trimmed)) {
    throw new Error(
      'Wallet public key must start with G and be 56 base-32 characters'
    );
  }
  return trimmed;
}

/** Validate a balance string. Returns a normalized decimal string or throws. */
export function validateBalance(balance: string): string {
  if (typeof balance !== 'string') {
    throw new Error('Balance must be a string');
  }
  const trimmed = balance.trim();
  if (trimmed === '' || isNaN(Number(trimmed)) || Number(trimmed) < 0) {
    throw new Error('Balance must be a non-negative numeric string');
  }
  return trimmed;
}

/** Result type for store operations that may fail gracefully. */
export type StoreResult<T = void> =
  | { ok: true; value: T }
  | { ok: false; error: string };

interface WalletState {
  publicKey: string | null;
  balance: string;
  connected: boolean;
  /** Last validation error from a rejected setWallet/updateBalance call. */
  lastError: string | null;
  setWallet: (publicKey: string, balance: string) => StoreResult;
  updateBalance: (balance: string) => StoreResult;
  disconnect: () => void;
  clearError: () => void;
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      publicKey: null,
      balance: '0',
      connected: false,
      lastError: null,

      setWallet: (publicKey, balance) => {
        try {
          const validKey = validatePublicKey(publicKey);
          const validBalance = validateBalance(balance);
          set({ publicKey: validKey, balance: validBalance, connected: true, lastError: null });
          return { ok: true, value: undefined };
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Invalid wallet input';
          set({ lastError: error });
          return { ok: false, error };
        }
      },

      updateBalance: (balance) => {
        try {
          const validBalance = validateBalance(balance);
          set({ balance: validBalance, lastError: null });
          return { ok: true, value: undefined };
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Invalid balance';
          set({ lastError: error });
          return { ok: false, error };
        }
      },

      disconnect: () =>
        set({ publicKey: null, balance: '0', connected: false, lastError: null }),

      clearError: () => set({ lastError: null }),
    }),
    {
      name: 'wallet-storage',
      partialize: (state) => ({
        publicKey: state.publicKey,
        balance: state.balance,
        connected: state.connected,
      }),
      // Recover gracefully when persisted state is corrupt or missing fields.
      merge: (persisted, current) => {
        const p = (persisted as Partial<WalletState>) || {};
        return {
          ...current,
          publicKey: typeof p.publicKey === 'string' ? p.publicKey : null,
          balance: typeof p.balance === 'string' ? p.balance : '0',
          connected: typeof p.connected === 'boolean' ? p.connected : false,
        };
      },
    }
  )
);

