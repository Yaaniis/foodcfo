import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import GerantRoute from './components/GerantRoute';
import RequireRole from './components/RequireRole';
import LoginPage from './pages/LoginPage';
import OnboardingPage from './pages/OnboardingPage';
import DashboardPage from './pages/DashboardPage';
import TeamPage from './pages/TeamPage';
import MenuPage from './pages/MenuPage';
import RecipePage from './pages/RecipePage';
import SuppliersProductsPage from './pages/SuppliersProductsPage';
import InvoicesPage from './pages/InvoicesPage';
import InvoiceReviewPage from './pages/InvoiceReviewPage';
import OrdersPage from './pages/OrdersPage';
import OrderDetailPage from './pages/OrderDetailPage';
import WastePage from './pages/WastePage';

// Phase 1.4 : routing complet + authentification côté client.
// Phase 1.5 : carte, fiches techniques, fournisseurs/produits.
function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<DashboardPage />} />

            <Route element={<GerantRoute />}>
              <Route path="/team" element={<TeamPage />} />
            </Route>

            <Route element={<RequireRole roles={['GERANT', 'CUISINE']} />}>
              <Route path="/menu" element={<MenuPage />} />
              <Route path="/menu/:menuItemId/recipe" element={<RecipePage />} />
              <Route path="/suppliers" element={<SuppliersProductsPage />} />
              <Route path="/invoices" element={<InvoicesPage />} />
              <Route path="/invoices/:invoiceId" element={<InvoiceReviewPage />} />
              <Route path="/orders" element={<OrdersPage />} />
              <Route path="/orders/:orderId" element={<OrderDetailPage />} />
              <Route path="/waste" element={<WastePage />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
