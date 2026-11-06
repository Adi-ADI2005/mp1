import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../services/api';

const SessionContext = createContext(null);
export function SessionProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(localStorage.getItem('pelagic_access_token') ? 'loading' : 'guest');
  useEffect(() => {
    if (!localStorage.getItem('pelagic_access_token')) return;
    authApi.me().then((currentUser) => {
      setUser(currentUser);
      setStatus('ready');
    }).catch(() => {
      localStorage.removeItem('pelagic_access_token');
      setUser(null);
      setStatus('guest');
    });
  }, []);
  const signIn = async (email, password) => {
    const result = await authApi.login({ email, password });
    localStorage.setItem('pelagic_access_token', result.access_token);
    setUser(result.user);
    setStatus('ready');
    return result.user;
  };
  const useDemoAccess = async () => {
    const result = await authApi.demo();
    localStorage.setItem('pelagic_access_token', result.access_token);
    setUser(result.user);
    setStatus('ready');
    return result.user;
  };
  const register = async (payload) => {
    const result = await authApi.register(payload);
    localStorage.setItem('pelagic_access_token', result.access_token);
    setUser(result.user);
    setStatus('ready');
    return result.user;
  };
  const signOut = async () => {
    try { await authApi.logout(); } finally {
      localStorage.removeItem('pelagic_access_token');
      setUser(null);
      setStatus('guest');
    }
  };
  const value = useMemo(() => ({ user, status, signIn, useDemoAccess, register, signOut }), [user, status]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}