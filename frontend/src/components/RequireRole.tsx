import { Navigate, Outlet } from 'react-router-dom';
import { useAuth, type UserRole } from '../context/AuthContext';

interface RequireRoleProps {
  roles: UserRole[];
}

// À utiliser à l'intérieur d'une route déjà protégée par <ProtectedRoute />.
export default function RequireRole({ roles }: RequireRoleProps) {
  const { user } = useAuth();

  if (!user || !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
