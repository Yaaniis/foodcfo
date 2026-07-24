import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// À utiliser à l'intérieur d'une route déjà protégée par <ProtectedRoute />
// (suppose que `user` n'est plus null).
export default function GerantRoute() {
  const { user } = useAuth();

  if (user?.role !== 'GERANT') {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
