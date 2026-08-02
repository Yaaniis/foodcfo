import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import GerantRoute from './components/GerantRoute';
import RequireRole from './components/RequireRole';
import LoginPage from './pages/LoginPage';
import OnboardingPage from './pages/OnboardingPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import DashboardPage from './pages/DashboardPage';
import AccountPage from './pages/AccountPage';
import RestaurantSettingsPage from './pages/RestaurantSettingsPage';
import TeamPage from './pages/TeamPage';
import MenuPage from './pages/MenuPage';
import RecipePage from './pages/RecipePage';
import SuppliersProductsPage from './pages/SuppliersProductsPage';
import InvoicesPage from './pages/InvoicesPage';
import InvoiceReviewPage from './pages/InvoiceReviewPage';
import OrdersPage from './pages/OrdersPage';
import OrderDetailPage from './pages/OrderDetailPage';
import WastePage from './pages/WastePage';
import AlertsPage from './pages/AlertsPage';
import ReportsPage from './pages/ReportsPage';
import ConsolidatedPage from './pages/ConsolidatedPage';
import BillingPage from './pages/BillingPage';
import PlanningPage from './pages/PlanningPage';
import ScheduleDetailPage from './pages/ScheduleDetailPage';
import HygienePage from './pages/HygienePage';
import ChecklistCompletionPage from './pages/ChecklistCompletionPage';
import ControlPage from './pages/ControlPage';
import ControlOrganismPage from './pages/ControlOrganismPage';
import MentionsLegalesPage from './pages/legal/MentionsLegalesPage';
import CGUPage from './pages/legal/CGUPage';
import ConfidentialitePage from './pages/legal/ConfidentialitePage';
import NotFoundPage from './pages/NotFoundPage';

// Phase 1.4 : routing complet + authentification côté client.
// Phase 1.5 : carte, fiches techniques, fournisseurs/produits.
function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/mentions-legales" element={<MentionsLegalesPage />} />
          <Route path="/cgu" element={<CGUPage />} />
          <Route path="/confidentialite" element={<ConfidentialitePage />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/account" element={<AccountPage />} />

            <Route element={<GerantRoute />}>
              <Route path="/team" element={<TeamPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/consolidated" element={<ConsolidatedPage />} />
              <Route path="/billing" element={<BillingPage />} />
              <Route path="/restaurant-settings" element={<RestaurantSettingsPage />} />
              <Route path="/planning" element={<PlanningPage />} />
              <Route path="/planning/schedules/:scheduleId" element={<ScheduleDetailPage />} />
              <Route path="/control" element={<ControlPage />} />
              <Route path="/control/:organism" element={<ControlOrganismPage />} />
            </Route>

            {/* La carte est ouverte en lecture au Service (décision 0.5 :
                "consultation carte/allergènes en lecture seule") — MenuPage
                masque elle-même la marge et les actions d'édition pour ce
                rôle. Tout le reste (fiche technique avec coût matière,
                fournisseurs, factures, commandes, gaspillage) reste
                Gérant/Cuisine uniquement. */}
            <Route element={<RequireRole roles={['GERANT', 'CUISINE', 'SERVICE']} />}>
              <Route path="/menu" element={<MenuPage />} />
              <Route path="/hygiene" element={<HygienePage />} />
              <Route path="/hygiene/completions/:completionId" element={<ChecklistCompletionPage />} />
            </Route>

            <Route element={<RequireRole roles={['GERANT', 'CUISINE']} />}>
              <Route path="/menu/:menuItemId/recipe" element={<RecipePage />} />
              <Route path="/suppliers" element={<SuppliersProductsPage />} />
              <Route path="/invoices" element={<InvoicesPage />} />
              <Route path="/invoices/:invoiceId" element={<InvoiceReviewPage />} />
              <Route path="/orders" element={<OrdersPage />} />
              <Route path="/orders/:orderId" element={<OrderDetailPage />} />
              <Route path="/waste" element={<WastePage />} />
              <Route path="/alerts" element={<AlertsPage />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
