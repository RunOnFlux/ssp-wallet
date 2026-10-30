// Badges ABE publishes in an exchange provider's `tags` (ABE README,
// "Provider badges"). Only these are shown; any other tag ABE adds is ignored
// until it is given a label here. Shared by the provider cards, which show the
// badges, and the legends, which say what they mean — a hover tooltip alone
// never reaches a touch screen.
export const SWAP_BADGES = {
  DEX: {
    label: 'home:swap.tag_dex',
    info: 'home:swap.tag_dex_info',
    color: 'green',
  },
  Private: {
    label: 'home:swap.tag_private',
    info: 'home:swap.tag_private_info',
    color: 'purple',
  },
  ZK: {
    label: 'home:swap.tag_zk',
    info: 'home:swap.tag_zk_info',
    color: 'geekblue',
  },
} as const;

export type SwapBadge = keyof typeof SWAP_BADGES;

export const isSwapBadge = (tag: string): tag is SwapBadge =>
  Object.prototype.hasOwnProperty.call(SWAP_BADGES, tag);

/** Known badges among these tags, deduplicated, in SWAP_BADGES order. */
export function knownBadges(tags: (string | undefined)[]): SwapBadge[] {
  const present = new Set(tags.filter((tag): tag is string => !!tag));
  return (Object.keys(SWAP_BADGES) as SwapBadge[]).filter((badge) =>
    present.has(badge),
  );
}
