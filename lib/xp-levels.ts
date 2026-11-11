import type { XpProgress } from "@/lib/xp-rules";

export const XP_LEVELS = [
  { name: "Newcomer", minimum: 0, next: 25, description: "Your journey starts here." },
  { name: "Explorer", minimum: 25, next: 75, description: "You're finding your way around the ecosystem." },
  { name: "Builder", minimum: 75, next: 150, description: "You're turning exploration into verified action." },
  { name: "WIF Guide", minimum: 150, next: null, description: "You're helping others find their way forward." }
] as const;

export function getXpLevel(xp: number) {
  const safeXp = Math.max(0, Number.isFinite(xp) ? xp : 0);
  const level = [...XP_LEVELS].reverse().find((item) => safeXp >= item.minimum) ?? XP_LEVELS[0];
  const progress = level.next === null ? 100 : Math.min(100, Math.round(((safeXp - level.minimum) / (level.next - level.minimum)) * 100));
  return { ...level, progress, xpToNext: level.next === null ? 0 : Math.max(0, level.next - safeXp) };
}

export function getVerifiedActivityCount(progress: XpProgress) {
  return Number(progress.swapCount || 0) + Number(progress.walletVerified) + Number(progress.addressProven);
}
