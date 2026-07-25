import { Link } from 'react-router-dom';

export default function LegalFooter() {
  return (
    <p className="text-xs text-slate-400 mt-6 text-center space-x-3">
      <Link to="/mentions-legales" className="underline hover:text-slate-600">
        Mentions légales
      </Link>
      <Link to="/cgu" className="underline hover:text-slate-600">
        CGU
      </Link>
      <Link to="/confidentialite" className="underline hover:text-slate-600">
        Confidentialité
      </Link>
    </p>
  );
}
