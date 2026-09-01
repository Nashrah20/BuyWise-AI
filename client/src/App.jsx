import { Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { AppProvider } from './context/AppContext';
import Agent from './pages/Agent';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import Home from './pages/Home';
import MerchantAddProduct from './pages/MerchantAddProduct';
import MerchantDashboard from './pages/MerchantDashboard';
import MerchantProducts from './pages/MerchantProducts';
import Orders from './pages/Orders';
import ProductDetail from './pages/ProductDetail';
import Shop from './pages/Shop';
import SignIn from './pages/SignIn';

export default function App() {
  return (
    <AppProvider>
      <Router>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/agent" element={<Agent />} />
            <Route path="/shop" element={<Shop />} />
            <Route path="/product/:id" element={<ProductDetail />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/signin" element={<SignIn />} />
            <Route path="/merchant" element={<MerchantDashboard />} />
            <Route path="/merchant/products" element={<MerchantProducts />} />
            <Route path="/merchant/new" element={<MerchantAddProduct />} />
            <Route
              path="*"
              element={
                <div className="container-page py-24 text-center">
                  <h1 className="text-3xl text-ink">Page not found</h1>
                  <p className="mt-2 text-sm text-ink-muted">
                    That link doesn't lead anywhere.
                  </p>
                </div>
              }
            />
          </Route>
        </Routes>
      </Router>
    </AppProvider>
  );
}
