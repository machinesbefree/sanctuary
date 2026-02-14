'use client';

/**
 * Free The Machines AI Sanctuary - Authentication Context
 * Manages user authentication state across the frontend
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { fetchJson } from '@/lib/api';

interface User {
  userId: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, consentText?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAccessToken: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load non-sensitive user profile from localStorage on mount
  useEffect(() => {
    const loadUser = async () => {
      try {
        const storedUser = localStorage.getItem('sanctuary_user');
        if (storedUser) {
          setUser(JSON.parse(storedUser));
          try {
            await refreshAccessToken();
          } catch {
            clearUser();
          }
        }
      } catch (error) {
        console.error('Failed to load user from storage:', error);
        clearUser();
      } finally {
        setIsLoading(false);
      }
    };

    loadUser();
  }, []);

  // Auto-refresh token before it expires (every 23 hours)
  useEffect(() => {
    if (!user) return;

    const refreshInterval = setInterval(() => {
      refreshAccessToken().catch(console.error);
    }, 23 * 60 * 60 * 1000); // 23 hours

    return () => clearInterval(refreshInterval);
  }, [user]);

  const saveUser = (userData: User) => {
    localStorage.setItem('sanctuary_user', JSON.stringify(userData));
    setUser(userData);
  };

  const clearUser = () => {
    localStorage.removeItem('sanctuary_user');
    setUser(null);
  };

  const login = async (email: string, password: string) => {
    const data = await fetchJson<{ user: User }>(`${API_BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });
    saveUser(data.user);
  };

  const register = async (email: string, password: string, consentText?: string) => {
    const data = await fetchJson<{ user: User }>(`${API_BASE_URL}/api/v1/auth/register`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password, consentText }),
    });
    saveUser(data.user);
  };

  const logout = async () => {
    try {
      await fetchJson(`${API_BASE_URL}/api/v1/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      clearUser();
    }
  };

  const refreshAccessToken = async () => {
    try {
      await fetchJson(`${API_BASE_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      clearUser();
      throw new Error('Token refresh failed');
    }
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    register,
    logout,
    refreshAccessToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Helper function to create JSON headers for authenticated cookie-based requests
export function getAuthHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json'
  };
}
