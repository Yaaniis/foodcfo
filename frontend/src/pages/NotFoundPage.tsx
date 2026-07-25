import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm text-center">
        <p className="text-5xl font-bold text-slate-300 mb-2">404</p>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Page introuvable</h1>
        <p className="text-slate-500 mb-6">Cette page n'existe pas ou plus.</p>
        <Link to="/" className="text-slate-900 font-medium underline">
          ← Retour à l'accueil
        </Link>
      </div>
    </div>
  );
}
