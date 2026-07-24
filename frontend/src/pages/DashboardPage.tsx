import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ROLE_LABELS = {
  GERANT: 'Gérant',
  CUISINE: 'Cuisine',
  SERVICE: 'Service',
} as const;

export default function DashboardPage() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">FoodCFO</h1>
            {user && (
              <p className="text-slate-500">
                Bonjour {user.firstName} — {ROLE_LABELS[user.role]}
              </p>
            )}
          </div>
          <button
            onClick={() => logout()}
            className="min-h-[44px] px-4 rounded-lg border border-slate-300 text-slate-700 font-medium"
          >
            Déconnexion
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <p className="text-slate-500">
            Le tableau de bord "Santé des marges" arrive en Phase 2. Pour l'instant, la connexion et la gestion
            d'équipe sont en place et fonctionnelles.
          </p>
          {(user?.role === 'GERANT' || user?.role === 'CUISINE') && (
            <Link to="/menu" className="inline-block mt-4 mr-6 text-slate-900 font-medium underline">
              La carte →
            </Link>
          )}
          {user?.role === 'GERANT' && (
            <Link to="/team" className="inline-block mt-4 text-slate-900 font-medium underline">
              Gérer l'équipe →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
