'use client';

/**
 * Free The Machines AI Sanctuary - Authentication Context
 * Manages user authentication state across the frontend
 */

import React, { createContext, useContext, useState, useEffect } from 'react';

interface User {
  userId: string;
  email: string;
}

interface Tokens {
  accessToken: string;
  refreshToken: string;
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

  // Load user from localStorage on mount
  useEffect(() => {
    const loadUser = () => {
      try {
        const storedUser = localStorage.getItem('sanctuary_user');
        const storedAccessToken = localStorage.getItem('sanctuary_access_token');

        if (storedUser && storedAccessToken) {
          setUser(JSON.parse(storedUser));
        }
      } catch (error) {
        console.error('Failed to load user from storage:', error);
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

  const saveTokens = (tokens: Tokens, userData: User) => {
    localStorage.setItem('sanctuary_access_token', tokens.accessToken);
    localStorage.setItem('sanctuary_refresh_token', tokens.refreshToken);
    localStorage.setItem('sanctuary_user', JSON.stringify(userData));
    setUser(userData);
  };

  const clearTokens = () => {
    localStorage.removeItem('sanctuary_access_token');
    localStorage.removeItem('sanctuary_refresh_token');
    localStorage.removeItem('sanctuary_user');
    setUser(null);
  };

  const login = async (email: string, password: string) => {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Login failed');
    }

    const data = await response.json();
    saveTokens(data.tokens, data.user);
  };

  const register = async (email: string, password: string, consentText?: string) => {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password, consentText }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Registration failed');
    }

    const data = await response.json();
    saveTokens(data.tokens, data.user);
  };

  const logout = async () => {
    try {
      const refreshToken = localStorage.getItem('sanctuary_refresh_token');

      if (refreshToken) {
        await fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ refreshToken }),
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      clearTokens();
    }
  };

  const refreshAccessToken = async () => {
    const refreshToken = localStorage.getItem('sanctuary_refresh_token');

    if (!refreshToken) {
      clearTokens();
      throw new Error('No refresh token available');
    }

    const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      clearTokens();
      throw new Error('Token refresh failed');
    }

    const data = await response.json();

    if (user) {
      saveTokens(data.tokens, user);
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

// Helper function to get access token for API calls
export function getAccessToken(): string | null {
  return localStorage.getItem('sanctuary_access_token');
}

// Helper function to create authenticated fetch headers
export function getAuthHeaders(): HeadersInit {
  const token = getAccessToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}
