import { PRIORITY_LABELS, type Priority } from "@/lib/domain/priority";

const RING: Record<Priority, string> = {
  1: "ring-p1",
  2: "ring-p2",
  3: "ring-p3",
  4: "ring-p4",
  5: "ring-p5",
};

/** Friends' initials, ringed in the colour of how much they want to go. */
export function FriendBadges({
  friends,
  max = 4,
  size = "md",
}: {
  friends: { userId: string; username: string; priority: Priority }[];
  max?: number;
  size?: "sm" | "md";
}) {
  if (friends.length === 0) return null;
  const shown = friends.slice(0, max);
  const extra = friends.length - shown.length;
  const label = friends.map((f) => `${f.username} (${PRIORITY_LABELS[f.priority]})`).join(", ");
  const dim = size === "sm" ? "h-5 w-5 text-[10px]" : "h-7 w-7 text-xs";

  return (
    <div className="flex items-center -space-x-1" aria-label={`Friends: ${label}`} title={label}>
      {shown.map((f) => (
        <span
          key={f.userId}
          className={`${dim} ${RING[f.priority]} inline-flex items-center justify-center rounded-full bg-surface-2 font-semibold uppercase ring-2`}
          aria-hidden
        >
          {f.username.slice(0, 2)}
        </span>
      ))}
      {extra > 0 && (
        <span className={`${dim} inline-flex items-center justify-center rounded-full bg-surface-2 font-semibold text-muted`} aria-hidden>
          +{extra}
        </span>
      )}
    </div>
  );
}
