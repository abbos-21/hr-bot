import { create } from "zustand";
import { authApi } from "../api";

interface Admin {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AuthStore {
  admin: Admin | null;
  token: string | null;
  loading: boolean;
  /** True while the startup /me check is in flight. ProtectedLayout waits
   *  for this to become false before deciding whether to redirect to /login.
   *  This prevents the race where admin is momentarily null on page refresh. */
  initializing: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
}

// Module-level flag so concurrent calls (e.g. from StrictMode double-invoke
// or multiple components) share a single in-flight request.
let fetchMePromise: Promise<void> | null = null;

export const useAuthStore = create<AuthStore>((set, get) => ({
  admin: null,
  token: localStorage.getItem("token"),
  loading: false,
  // Start as true only when there is a token to validate; if there's no
  // stored token the user is definitely logged-out — no spinner needed.
  initializing: !!localStorage.getItem("token"),

  login: async (email, password) => {
    set({ loading: true });
    const data = await authApi.login(email, password);
    localStorage.setItem("token", data.token);
    set({ token: data.token, admin: data.admin, loading: false });
  },

  logout: () => {
    localStorage.removeItem("token");
    fetchMePromise = null;
    set({ admin: null, token: null, initializing: false });
  },

  fetchMe: async () => {
    // If a fetch is already running, reuse it — don't fire a second request.
    if (fetchMePromise) return fetchMePromise;

    fetchMePromise = (async () => {
      try {
        const admin = await authApi.me();
        set({ admin, initializing: false });
      } catch {
        localStorage.removeItem("token");
        set({ admin: null, token: null, initializing: false });
      } finally {
        fetchMePromise = null;
      }
    })();

    return fetchMePromise;
  },
}));
