import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { post, setToken, refreshSession, setAuthLostHandler } from './api';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setAuthLostHandler(() => setUser(null));
    refreshSession().then(setUser).finally(() => setReady(true));
  }, []);

  const authenticate = useCallback(async (path, body) => {
    const { data } = await post(path, body);
    setToken(data.accessToken); setUser(data.user); return data.user;
  }, []);
  const logout = useCallback(async () => { await post('/auth/logout').catch(() => {}); setToken(null); setUser(null); }, []);

  return <Ctx.Provider value={{ user, ready, login: (b) => authenticate('/auth/login', b), register: (b) => authenticate('/auth/register', b), logout }}>{children}</Ctx.Provider>;
}
