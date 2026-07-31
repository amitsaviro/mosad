import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState } from 'react';

import * as authApi from '@/api/auth';
import { setAuthToken } from '@/api/client';
import { User } from '@/types';

// AsyncStorage works identically on iOS/Android/web (backed by
// localStorage on web) — this is what makes the JWT survive an app
// restart or a browser page refresh.
const TOKEN_STORAGE_KEY = 'mosad_token';

type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On first mount: try to restore a previously-saved session so the
  // user doesn't have to log in again every time they open the app.
  useEffect(() => {
    (async () => {
      const savedToken = await AsyncStorage.getItem(TOKEN_STORAGE_KEY);
      if (savedToken) {
        setAuthToken(savedToken);
        try {
          const currentUser = await authApi.me();
          setUser(currentUser);
        } catch {
          // Saved token is invalid/expired — clear it silently.
          await AsyncStorage.removeItem(TOKEN_STORAGE_KEY);
          setAuthToken(null);
        }
      }
      setIsLoading(false);
    })();
  }, []);

  async function applyAuthResponse(response: { access_token: string; user: User }) {
    await AsyncStorage.setItem(TOKEN_STORAGE_KEY, response.access_token);
    setAuthToken(response.access_token);
    setUser(response.user);
  }

  async function login(email: string, password: string) {
    const response = await authApi.login(email, password);
    await applyAuthResponse(response);
  }

  async function register(email: string, password: string, fullName: string) {
    const response = await authApi.register(email, password, fullName);
    await applyAuthResponse(response);
  }

  async function logout() {
    await AsyncStorage.removeItem(TOKEN_STORAGE_KEY);
    setAuthToken(null);
    setUser(null);
  }

  async function refreshUser() {
    // Called after actions that change the user's role/institution,
    // e.g. creating or joining a layer for the first time.
    const currentUser = await authApi.me();
    setUser(currentUser);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
