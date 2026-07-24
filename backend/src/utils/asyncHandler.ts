// Express 4 ne capture pas automatiquement les rejets de Promise dans
// les routes async — sans ce wrapper, une erreur dans un `await` ferait
// planter la requête silencieusement (pas de réponse envoyée) au lieu
// d'être traitée proprement par errorHandler.

import type { Request, Response, NextFunction, RequestHandler } from 'express';

type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export function asyncHandler(fn: AsyncRouteHandler): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
