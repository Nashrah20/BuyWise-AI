import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi, cartApi, errorMessage } from '../lib/api';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const notify = useCallback((message, tone = 'success') => {
    setToast({ message, tone, id: Date.now() });
    setTimeout(() => setToast(null), 3600);
  }, []);

  const refreshCart = useCallback(async () => {
    try {
      setCart(await cartApi.get());
    } catch {
      setCart(null);
    }
  }, []);

  /* Restore the session on first load. */
  useEffect(() => {
    (async () => {
      if (!localStorage.getItem('buywise_token')) return setLoading(false);
      try {
        const { user: me } = await authApi.me();
        setUser(me);
        await refreshCart();
      } catch {
        localStorage.removeItem('buywise_token');
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshCart]);

  const signIn = useCallback(
    async (payload, mode = 'login') => {
      const data = mode === 'signup' ? await authApi.signup(payload) : await authApi.login(payload);
      localStorage.setItem('buywise_token', data.token);
      setUser(data.user);
      await refreshCart();
      return data.user;
    },
    [refreshCart]
  );

  const signOut = useCallback(() => {
    localStorage.removeItem('buywise_token');
    setUser(null);
    setCart(null);
  }, []);

  const addToCart = useCallback(
    async (productId, quantity = 1) => {
      if (!user) {
        notify('Please sign in to add items to your cart.', 'error');
        return false;
      }
      try {
        setCart(await cartApi.add(productId, quantity));
        notify('Added to your cart.');
        return true;
      } catch (err) {
        notify(errorMessage(err), 'error');
        return false;
      }
    },
    [user, notify]
  );

  const value = useMemo(
    () => ({
      user,
      cart,
      loading,
      toast,
      notify,
      signIn,
      signOut,
      addToCart,
      refreshCart,
      setCart,
      cartCount: cart?.count || 0,
      isMerchant: user?.role === 'merchant',
    }),
    [user, cart, loading, toast, notify, signIn, signOut, addToCart, refreshCart]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
};
