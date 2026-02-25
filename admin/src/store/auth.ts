import { create } from 'zustand';
import { authApi } from '../api';

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
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set) => ({
  admin: null,
  token: localStorage.getItem('token'),
  loading: false,

  login: async (email, password) => {
    set({ loading: true });
    const data = await authApi.login(email, password);
    localStorage.setItem('token', data.token);
    set({ token: data.token, admin: data.admin, loading: false });
  },

  logout: () => {
    localStorage.removeItem('token');
    set({ admin: null, token: null });
  },

  fetchMe: async () => {
    try {
      const admin = await authApi.me();
      set({ admin });
    } catch {
      localStorage.removeItem('token');
      set({ admin: null, token: null });
    }
  },
}));
