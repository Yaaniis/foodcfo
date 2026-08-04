import { Link } from 'react-router-dom';

export default function LegalFooter() {
  return (
    <p className="text-xs text-text-faint mt-6 text-center space-x-3">
      <Link to="/mentions-legales" className="hover:text-accent">
        Mentions légales
      </Link>
      <Link to="/cgu" className="hover:text-accent">
        CGU
      </Link>
      <Link to="/confidentialite" className="hover:text-accent">
        Confidentialité
      </Link>
    </p>
  );
}
