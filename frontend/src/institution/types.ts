export type Page<T> = { items: T[]; page: number; hasMore: boolean };

export type Institution = {
  id: string;
  name: string;
  responsibleName: string;
  email: string;
  phone: string;
  description: string;
  status: string;
  registrationNumber?: string;
  createdAt?: string;
};

export type Member = {
  id: string;
  userId: string;
  active: boolean;
  user?: { id: string; nome: string; email: string };
};

export type Class = {
  id: string;
  nome: string;
  archivedAt?: string | null;
  professores?: { id: string; nome: string }[];
  _count: { alunos: number };
};

export type Summary = {
  institution: Institution;
  teachers: Page<Member>;
  classes: Page<Class>;
  indicators: {
    students: number;
    classes: number;
    completedAttempts: number;
    activeTeachers?: number;
    pendingInvitations?: number;
    activeClasses?: number;
    publishedExams?: number | null;
  };
};

export type Invitation = {
  id: string;
  invitedName?: string;
  email: string;
  status: string;
  createdAt: string;
  expiresAt: string;
  sentAt?: string;
  deliveryState?: 'ACCEPTED_BY_PROVIDER' | 'UNCONFIRMED' | 'NOT_PENDING';
};

export type Event = { id: string; event: string; occurredAt: string; result: string };
