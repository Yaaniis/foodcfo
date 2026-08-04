import { Link } from 'react-router-dom';
import AuthBrandMark from '../components/AuthBrandMark';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg bg-app-gradient px-4">
      <div className="w-full max-w-[380px] flex flex-col items-center gap-4 text-center">
        <AuthBrandMark />
        <p className="text-5xl font-bold font-display text-text-faint">404</p>
        <div>
          <h2 className="font-display text-lg font-bold">Page introuvable</h2>
          <p className="text-sm text-text-muted mt-1">Cette page n'existe pas ou plus.</p>
        </div>
        <Link to="/" className="text-sm text-accent font-semibold hover:underline">
          ← Retour à l'accueil
        </Link>
      </div>
    </div>
  );
}
