// Ative somente depois que a migração aditiva tiver sido aprovada e aplicada.
// Desativado por padrão para que os bancos compartilhados existentes continuem funcionando sem alteração.
import { restrictedOperationsEnabled } from './institution-homologation';
export const institutionsGloballyEnabled = () => process.env.INSTITUTIONS_ENABLED === 'true';
export const institutionsEnabled = () => institutionsGloballyEnabled() || restrictedOperationsEnabled();
// Capacidade restrita para gerenciar apenas vínculos e convites de professores da
// própria instituição. Não ativa turmas, simulados, atividades nem APIs de ciclo de vida.
export const institutionalTeacherManagementEnabled = () =>
  institutionsGloballyEnabled() || process.env.INSTITUTION_TEACHER_MANAGEMENT_ENABLED === 'true' || restrictedOperationsEnabled();
// Os simulados institucionais são uma capacidade independente. As configurações de
// convite/vínculo de professores, sozinhas, nunca dão acesso para criar ou publicar avaliações acadêmicas.
export const institutionalExamManagementEnabled = () =>
  institutionsEnabled() || process.env.INSTITUTION_EXAM_MANAGEMENT_ENABLED === 'true';

// Ativações explícitas; o módulo completo original continua retrocompatível.
export const administrationEnabled = () => institutionsGloballyEnabled() || process.env.ADMINISTRATION_ENABLED === 'true';
export const institutionRegistrationEnabled = () => institutionsGloballyEnabled() || process.env.INSTITUTION_REGISTRATION_ENABLED === 'true';
export function administrativeCapabilities() {
  const full = institutionsEnabled(), administration = administrationEnabled(), registration = institutionRegistrationEnabled();
  const teacherManagement = institutionalTeacherManagementEnabled();
  return { enabled: full, registrationEnabled: registration, administrationEnabled: administration,
    capabilities: { overview: administration, institutions: administration || registration,
      requests: administration || registration, decisions: administration || registration,
      users: administration, teachers: administration, classes: false,
      audit: administration || registration, notifications: administration || registration,
      teacherManagement, teacherInvitations: teacherManagement,
      classAssignment: teacherManagement, examManagement: institutionalExamManagementEnabled(), institutionalOperations: full },
  };
}
