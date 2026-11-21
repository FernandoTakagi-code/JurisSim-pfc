import { Router } from 'express';
import { requireAuth, requireRoles, type AuthenticatedRequest } from '../middlewares/auth-middleware';
import { ApiError } from '../errors/api-error';
import versions from '../legal-versions.json';
import { currentTermsOfUse, publishTermsOfUse, termsOfUseOverview, termsOfUseVersion } from '../services/accounts/terms-of-use';

const VERSION_FORMAT = /^\d{4}-\d{2}-\d{2}\.\d{1,4}$/;

export function createLegalRoutes() {
  const routes = Router();
  // Público: usado pela página dos Termos e pelos formulários de cadastro.
  routes.get('/current', async (_req, res) => {
    res.json({ terms: await currentTermsOfUse(), privacyVersion: versions.privacyVersion });
  });
  routes.get('/admin/terms-of-use', requireAuth, requireRoles('ADMIN'), async (_req, res) => {
    res.json(await termsOfUseOverview());
  });
  routes.get('/admin/terms-of-use/:version', requireAuth, requireRoles('ADMIN'), async (req, res) => {
    const version = String(req.params.version);
    if (!VERSION_FORMAT.test(version)) throw new ApiError(404, 'Versão dos Termos de Uso não encontrada.');
    res.json(await termsOfUseVersion(version));
  });
  routes.post('/admin/terms-of-use', requireAuth, requireRoles('ADMIN'), async (req: AuthenticatedRequest, res) => {
    res.status(201).json(await publishTermsOfUse(req.auth!.userId, req.body?.sections));
  });
  return routes;
}

export const legalRoutes = createLegalRoutes();
