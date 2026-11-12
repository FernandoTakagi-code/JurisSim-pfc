import { readFileSync } from 'node:fs'; // quebra proposital do linter: import não usado (será revertida)
export const escapeMail =(value:string) => value.replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
