/**
 * Papéis do escritório. Cada papel é um subagente do Claude Code
 * (arquivo em .claude/agents/<papel>.md) e uma coruja na tela.
 */
export const ROLES = ['arquiteto', 'engenheiro', 'seguranca', 'qa', 'devops'] as const;

export type Role = (typeof ROLES)[number];

/** Dados de exibição de cada coruja (nome e acessório). */
export const ROLE_INFO: Record<Role, { label: string; accessory: string }> = {
  arquiteto: { label: 'Arquiteto', accessory: 'óculos e planta' },
  engenheiro: { label: 'Engenheiro', accessory: 'teclado' },
  seguranca: { label: 'Segurança', accessory: 'escudo' },
  qa: { label: 'QA', accessory: 'lupa' },
  devops: { label: 'DevOps', accessory: 'capacete' },
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}
