import { useEffect, useState } from 'react';

// Utilisé par les écrans concernés par le mode hors-ligne partiel
// (tableau de bord, gaspillage) pour afficher un indicateur clair et
// adapter leur comportement (file de synchronisation) plutôt que de
// laisser des requêtes échouer silencieusement.
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return isOnline;
}
