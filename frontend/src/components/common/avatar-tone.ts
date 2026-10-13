/** Deterministic, name-hashed avatar tints so initials stay colourful (and
 * stable per person) instead of one flat primary colour for every row. */

const AVATAR_TONES = [
  "bg-primary/15 text-primary",
  "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  "bg-teal-500/15 text-teal-600 dark:text-teal-400",
  "bg-slate-500/15 text-slate-600 dark:text-slate-400",
] as const;

export function avatarTone(name?: string): string {
  if (!name) return AVATAR_TONES[0];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0x7fffffff;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}