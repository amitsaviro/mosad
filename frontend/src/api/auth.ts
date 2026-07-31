import { api } from '@/api/client';
import { AuthResponse, User } from '@/types';

export function register(email: string, password: string, fullName: string) {
  return api.post<AuthResponse>('/auth/register', {
    email,
    password,
    full_name: fullName,
  });
}

export function login(email: string, password: string) {
  return api.post<AuthResponse>('/auth/login', { email, password });
}

export function me() {
  return api.get<User>('/auth/me');
}
