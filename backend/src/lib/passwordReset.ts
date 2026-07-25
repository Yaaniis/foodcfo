// Isolé du contrôleur pour être appelable directement depuis les tests
// (créer un token valide sans dépendre de la réception d'un vrai email,
// impossible à intercepter dans cet environnement faute de vraie clé
// Resend — même contrainte que les autres intégrations externes).

import { prisma } from './prisma';
import { hashToken, generateResetToken, expiryDateFromDuration } from '../utils/tokens';

export async function createPasswordResetToken(email: string): Promise<string> {
  const rawToken = generateResetToken();
  await prisma.passwordResetToken.create({
    data: {
      email,
      tokenHash: hashToken(rawToken),
      expiresAt: expiryDateFromDuration('1h'),
    },
  });
  return rawToken;
}
