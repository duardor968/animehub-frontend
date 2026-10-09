// One look for both paginations (catalog links and the episode pager):
// 44px rounded squares, chevron arrows, the current page filled with the accent.

export const pagerItemClass =
  "grid size-11 shrink-0 place-items-center rounded-xl text-sm font-semibold tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/** A page you can go to. */
export const pagerLinkClass = `${pagerItemClass} border border-white/10 bg-surface text-subtle hover:border-link/45 hover:bg-surface-hover hover:text-foreground`;

/** The page being shown. */
export const pagerCurrentClass = `${pagerItemClass} bg-accent text-accent-foreground`;

/** An arrow with nowhere to go (first or last page). */
export const pagerUnavailableClass = `${pagerItemClass} border border-white/6 text-faint opacity-60`;

/** Page being loaded: its item shows this instead of the number. */
export const pagerSpinnerClass =
  "size-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none";
