import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

// Filet de sécurité global : sans lui, une erreur de rendu inattendue
// dans n'importe quel écran (donnée API imprévue, bug) fait disparaître
// toute l'application derrière un écran blanc, sans explication ni
// moyen de s'en sortir autrement qu'en devinant qu'il faut recharger.
// Seule une classe React peut intercepter ces erreurs (pas de
// composant fonctionnel équivalent à ce jour).
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Erreur non gérée dans l’application', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
          <div className="w-full max-w-sm text-center">
            <h1 className="text-xl font-bold text-slate-900 mb-2">Une erreur inattendue est survenue</h1>
            <p className="text-slate-500 mb-6">
              Désolé, quelque chose s'est mal passé. Rechargez la page pour continuer.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-[44px] px-6 rounded-lg bg-slate-900 text-white font-medium"
            >
              Recharger la page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
