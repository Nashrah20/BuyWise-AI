import axios from 'axios';

export const api = axios.create({ baseURL: '/api' });

/* Attach the JWT to every request once the shopper has signed in. */
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('buywise_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** Turn an axios error into the message the server actually sent. */
export const errorMessage = (err) =>
  err?.response?.data?.error || err?.message || 'Something went wrong. Please try again.';

export const formatINR = (value) =>
  `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

/* ------------------------------------------------------------------ endpoints */

export const authApi = {
  login: (payload) => api.post('/auth/login', payload).then((r) => r.data),
  signup: (payload) => api.post('/auth/signup', payload).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data),
};

export const productApi = {
  list: (params) => api.get('/products', { params }).then((r) => r.data),
  get: (id) => api.get(`/products/${id}`).then((r) => r.data.product),
  categories: () => api.get('/products/categories').then((r) => r.data.categories),
};

export const aiApi = {
  status: () => api.get('/ai/status').then((r) => r.data),
  chat: (message, conversationId) =>
    api.post('/ai/chat', { message, conversationId }).then((r) => r.data),
  conversation: (id) => api.get(`/ai/conversation/${id}`).then((r) => r.data),
  search: (message) => api.post('/ai/search', { message }).then((r) => r.data),
  rescore: (requirements) =>
    api.post('/recommendations', { requirements, limit: 6 }).then((r) => r.data),
};

export const cartApi = {
  get: () => api.get('/cart').then((r) => r.data.cart),
  add: (productId, quantity = 1) =>
    api.post('/cart', { productId, quantity }).then((r) => r.data.cart),
  update: (productId, quantity) =>
    api.put(`/cart/${productId}`, { quantity }).then((r) => r.data.cart),
  remove: (productId) => api.delete(`/cart/${productId}`).then((r) => r.data.cart),
};

export const orderApi = {
  list: () => api.get('/orders').then((r) => r.data.orders),
};

export const paymentApi = {
  config: () => api.get('/payment/config').then((r) => r.data),
  createOrder: () => api.post('/payment/create-order').then((r) => r.data),
  verify: (payload) => api.post('/payment/verify', payload).then((r) => r.data.order),
};

export const merchantApi = {
  dashboard: () => api.get('/merchant/dashboard').then((r) => r.data.stats),
  products: () => api.get('/merchant/products').then((r) => r.data.products),
  generateProfile: (payload) =>
    api.post('/merchant/generate-profile', payload).then((r) => r.data.profile),
  createProduct: (payload) => api.post('/merchant/products', payload).then((r) => r.data.product),
  deleteProduct: (id) => api.delete(`/merchant/products/${id}`).then((r) => r.data),
};
