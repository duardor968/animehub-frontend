"use client";

import { Button, Spinner, Tooltip, toast } from "@heroui/react";
import { buttonVariants } from "@heroui/styles";
import { Copy } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import {
  mergeProps,
  type PressEvent,
  useFocusRing,
  useFocusVisible,
  useFocusable,
  useHover,
  usePress,
} from "react-aria";
import { formatEpisodeNumber } from "@/lib/format";
import {
  MegaLogo,
  PixeldrainLogo,
  mp4uploadLogo,
  oneFichierLogo,
} from "../brand-icons";
import { RequestTitle } from "./download-activity";
import { useDownloads, type EpisodeLinks } from "./download-provider";
import { providerLabels, type DownloadProviderId } from "./download-types";

/** Pause on the button before its links are looked up. */
const OPEN_DELAY = 120;
/** Grace to cross the gaps between the pieces without closing. */
const CLOSE_DELAY = 200;
/** Ring thickness: a touch target in every sector, with room around a 20 px
 *  icon (28 px wide: MP4Upload's "m") even in a ring of three. */
const RING = 42;
/** Between the center and the ring, and between sectors. */
const GAP = 4;
/** Sector corners: HeroUI's field radius (1.5 × --radius). */
const CORNER = 12;
/** The center button's scale while the ring is open (globals.css). */
const CENTER_SCALE = 0.85;
/** Closest the ring gets to the viewport edge. */
const EDGE = 8;
/** The center's copy: every link. */
const ALL = "ALL";

// Every mark is a logo; the sector's label names it.
const logos: Record<DownloadProviderId, ReactNode> = {
  MEGA: <MegaLogo />,
  PIXELDRAIN: <PixeldrainLogo />,
  MP4UPLOAD: (
    <Image src={mp4uploadLogo} alt="" width={34} height={24} unoptimized />
  ),
  ONE_FICHIER: (
    <Image src={oneFichierLogo} alt="" width={46} height={42} unoptimized />
  ),
};

const arrowAngles: Record<string, number> = {
  ArrowUp: -90,
  ArrowRight: 0,
  ArrowDown: 90,
  ArrowLeft: 180,
};

/** Sector i of n is centred at -90° + i·360/n: the first on top, clockwise. */
const sectorAngle = (index: number, count: number) =>
  -90 + (360 / count) * index;

function angleBetween(a: number, b: number) {
  return Math.abs(((((a - b) % 360) + 540) % 360) - 180);
}

/** The sector an arrow points at (on a tie, the one already focused). */
export function sectorForArrow(
  key: string,
  count: number,
  current: number | null,
) {
  const target = arrowAngles[key];
  let best: number | null = null;
  for (let index = 0; index < count; index++) {
    const delta =
      best === null
        ? -1
        : angleBetween(sectorAngle(index, count), target) -
          angleBetween(sectorAngle(best, count), target);
    if (delta < -0.01 || (Math.abs(delta) <= 0.01 && index === current))
      best = index;
  }
  return best;
}

const menuItems = (ring: HTMLElement | null) => [
  ...(ring?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []),
];

const round = (value: number) => Math.round(value * 100) / 100;

function polar(center: number, radius: number, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  return [
    round(center + radius * Math.cos(radians)),
    round(center + radius * Math.sin(radians)),
  ];
}

/**
 * Path of a sector inside the ring's square box (its clip-path and its focus
 * contour): an annular sector with rounded corners, straight edges GAP apart.
 * A ring of one is two circles (evenodd).
 */
function sectorPath(index: number, count: number, inner: number) {
  const outer = inner + RING;
  if (count === 1) {
    const circle = (r: number) =>
      `M ${outer - r} ${outer} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
    return `${circle(outer)} ${circle(inner)}`;
  }
  const span = ((360 / count) * Math.PI) / 180;
  const mid = (sectorAngle(index, count) * Math.PI) / 180;
  const point = (x: number, y: number) =>
    `${round(outer + x)} ${round(outer + y)}`;
  // A rounded corner between the edge at `angle` (the sector on its `side`)
  // and the circle of `radius`, which it meets from inside (outer circle) or
  // from outside (inner circle).
  const corner = (
    angle: number,
    side: number,
    radius: number,
    fromInside: boolean,
  ) => {
    const [ux, uy] = [Math.cos(angle), Math.sin(angle)];
    const [vx, vy] = [-uy * side, ux * side];
    const offset = GAP / 2 + CORNER;
    const distance = fromInside ? radius - CORNER : radius + CORNER;
    const along = Math.sqrt(distance ** 2 - offset ** 2);
    const [cx, cy] = [along * ux + offset * vx, along * uy + offset * vy];
    return {
      edge: point(cx - CORNER * vx, cy - CORNER * vy),
      circle: point((cx * radius) / distance, (cy * radius) / distance),
    };
  };
  const start = mid - span / 2;
  const end = mid + span / 2;
  const a = corner(start, 1, outer, true);
  const b = corner(end, -1, outer, true);
  const c = corner(end, -1, inner, false);
  const d = corner(start, 1, inner, false);
  const turn = `${CORNER} ${CORNER} 0 0 1`;
  return `M ${a.edge} A ${turn} ${a.circle} A ${outer} ${outer} 0 0 1 ${b.circle} A ${turn} ${b.edge} L ${c.edge} A ${turn} ${c.circle} A ${inner} ${inner} 0 0 0 ${d.circle} A ${turn} ${d.edge} Z`;
}

interface Ring {
  /** Center of the ring in the viewport (the button's, unless clamped). */
  x: number;
  y: number;
  inner: number;
  /** The button's center from the ring's, where the ring is shifted to fit
   *  the viewport: the center glides from there and back. */
  from: { x: number; y: number };
  /** Opened with an arrow: focus the sector that way once its links are in. */
  focus: string | null;
  closing: boolean;
  /** Closed with its button hidden (off a card that shows it on hover): the
   *  center fades out as the button would. */
  fading?: boolean;
}

/** Whether an element shows where it sits: no ancestor (a card showing its
 *  action on hover) fades it out. */
function isShown(element: HTMLElement | null) {
  let opacity = 1;
  for (let node = element; node; node = node.parentElement)
    opacity *= Number(getComputedStyle(node).opacity);
  return opacity > 0.5;
}

/**
 * The episode's button when links go to the clipboard: a copy button that,
 * after a pause on it (hover or keyboard focus) or a tap, opens a ring of
 * provider sectors around itself. The center copies every link; each sector
 * copies one provider's. The links are looked up on the first opening.
 */
export function EpisodeCopyMenu({
  slug,
  title,
  episodeNumber,
  withSeries,
  className,
  portable,
}: {
  slug: string;
  title: string;
  episodeNumber: number;
  withSeries: boolean;
  className: string;
  portable: boolean;
}) {
  const {
    preferences,
    cachedEpisodeLinks,
    resolveEpisodeLinks,
    copyEpisodeLinks,
  } = useDownloads();
  const request = { slug, title, episodeNumbers: [episodeNumber] };
  const label = `Copiar enlaces del episodio ${formatEpisodeNumber(episodeNumber)}${withSeries ? ` de ${title}` : ""}`;
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const keepClosed = useRef(false);
  // Whether a pointer (not touch) rests on the button or the ring's center.
  // Closing under it (a copy, Escape, no links) leaves it on the button: no
  // reopening until it leaves and comes back.
  const pointerOn = useRef({ trigger: false, center: false });
  const holdClosed = useRef(false);
  const [ring, setRing] = useState<Ring | null>(null);
  const [links, setLinks] = useState<EpisodeLinks | undefined>();
  // A copy pressed before the lookup ends: of every link or one server's.
  const [waiting, setWaiting] = useState<
    DownloadProviderId | typeof ALL | null
  >(null);
  const [tooltip, setTooltip] = useState(false);
  const [focused, setFocused] = useState(false);
  const isFocusVisible = useFocusVisible().isFocusVisible && focused;
  const providers = (
    Object.keys(providerLabels) as DownloadProviderId[]
  ).filter((provider) => preferences.providers.includes(provider));
  const open = Boolean(ring && !ring.closing);

  const clearTimer = () => window.clearTimeout(timer.current);

  const close = useCallback(() => {
    window.clearTimeout(timer.current);
    if (pointerOn.current.trigger || pointerOn.current.center)
      holdClosed.current = true;
    // Hidden under the ring, it would show again as the ring goes.
    setTooltip(false);
    // Focus inside the ring goes back to the button, which stays closed.
    if (ringRef.current?.contains(document.activeElement)) {
      keepClosed.current = true;
      triggerRef.current?.focus();
    }
    setRing((current) => current && { ...current, closing: true });
  }, []);

  function show(focus: string | null = null) {
    clearTimer();
    const button = triggerRef.current;
    if (!button) return;
    const box = button.getBoundingClientRect();
    // Layout size: the box may be mid scale-in on a card being hovered.
    const inner = (button.offsetWidth * CENTER_SCALE) / 2 + GAP;
    const reach = inner + RING + EDGE;
    const clamp = (value: number, size: number) =>
      Math.min(Math.max(value, reach), size - reach);
    const [x, y] = [box.left + box.width / 2, box.top + box.height / 2];
    const center = {
      x: clamp(x, window.innerWidth),
      y: clamp(y, window.innerHeight),
    };
    setRing({
      ...center,
      inner,
      from: { x: x - center.x, y: y - center.y },
      focus,
      closing: false,
    });
    const cached = cachedEpisodeLinks(request);
    setLinks(cached);
    if (cached) return;
    void resolveEpisodeLinks(request).then((value) => {
      if (value) setLinks(value);
      // No links or a failed lookup: the provider shows why in a toast.
      else close();
    });
  }

  const schedule = (action: () => void, delay: number) => {
    clearTimer();
    timer.current = window.setTimeout(action, delay);
  };

  function remove() {
    setRing(null);
    // Gone, the center ends no hover; and closed over the page (the ring
    // shifted, a scroll), nothing is held.
    pointerOn.current.center = false;
    if (!pointerOn.current.trigger) holdClosed.current = false;
  }

  function copy(provider?: DownloadProviderId) {
    if (links) {
      copyEpisodeLinks(request, links, provider);
      close();
      return;
    }
    // Pressed before the lookup ends: copy once it does. A server found
    // without a link says so; the ring stays, its sector greyed.
    setWaiting(provider ?? ALL);
    void resolveEpisodeLinks(request).then((value) => {
      setWaiting(null);
      const has = (id: DownloadProviderId) =>
        value?.episode.links.some((link) => link.provider === id);
      if (value && provider && !has(provider)) {
        toast.warning(<RequestTitle request={request} />, {
          description: `${providerLabels[provider]} no tiene este episodio.`,
        });
        return;
      }
      if (value) copyEpisodeLinks(request, value, provider);
      close();
    });
  }

  // Keyboard focus opens it like a pause of the pointer does.
  useEffect(() => {
    if (!isFocusVisible) {
      keepClosed.current = false;
      return;
    }
    if (keepClosed.current) return;
    timer.current = window.setTimeout(() => show(), OPEN_DELAY);
    return () => window.clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open on focus only
  }, [isFocusVisible]);

  // While open: an outside press, Escape, scrolling or resizing closes it.
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      // The ring box itself is hit only through its phone backdrop.
      if (
        target === ringRef.current ||
        (!ringRef.current?.contains(target) &&
          !triggerRef.current?.contains(target))
      )
        close();
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const dismiss = () => close();
    // Capture, registered before any sector's tooltip opens: one Escape
    // closes the ring, not just the tooltip.
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape, true);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [open, close]);

  // Opened with an arrow: focus that way, the links still on their way.
  useEffect(() => {
    if (!ring?.focus || ring.closing) return;
    const items = menuItems(ringRef.current);
    const index = sectorForArrow(ring.focus, items.length, null);
    if (index !== null) items[index].focus();
  }, [ring]);

  useEffect(() => clearTimer, []);

  function onTriggerKeyDown(event: KeyboardEvent) {
    if (!(event.key in arrowAngles)) return;
    event.preventDefault();
    show(event.key);
  }

  // Arrows and Home/End move between the sectors, those without a link
  // too: their label says why.
  function onRingKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = menuItems(event.currentTarget);
    let next: HTMLElement | undefined;
    if (event.key in arrowAngles) {
      const current = items.indexOf(document.activeElement as HTMLElement);
      const index = sectorForArrow(event.key, items.length, current);
      next = index === null ? undefined : items[index];
    } else if (event.key === "Home") next = items[0];
    else if (event.key === "End") next = items.at(-1);
    else {
      // Back on the button first, so Tab continues from its place in the page.
      if (event.key === "Tab") close();
      return;
    }
    event.preventDefault();
    next?.focus();
  }

  const trigger = (
    <Button
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        setFocused(false);
        if (!ringRef.current?.contains(event.relatedTarget)) close();
      }}
      ref={triggerRef}
      isIconOnly
      aria-label={label}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={open ? menuId : undefined}
      // The ring's center stands in for it while the ring is there.
      data-ring={ring ? true : undefined}
      isPending={waiting === ALL}
      className={`${className} episode-action copy-ring__trigger`}
      onHoverStart={() => {
        pointerOn.current.trigger = true;
        if (!holdClosed.current) schedule(() => show(), OPEN_DELAY);
      }}
      onHoverEnd={() => {
        pointerOn.current.trigger = false;
        holdClosed.current = false;
        if (ring) schedule(close, CLOSE_DELAY);
        else clearTimer();
      }}
      onKeyDown={onTriggerKeyDown}
      onPress={(event) => {
        // On touch the first tap opens it; the center then copies.
        if (event.pointerType === "touch" && !open) show();
        else copy();
      }}
    >
      {waiting === ALL ? (
        <Spinner color="current" size="sm" aria-label="Buscando enlaces" />
      ) : (
        <Copy aria-hidden="true" />
      )}
    </Button>
  );

  const center = (
    <RingButton
      aria-hidden="true"
      className={`${buttonVariants({ isIconOnly: true })} episode-action copy-ring__center ${isFocusVisible ? "is-focus-visible" : ""}`}
      style={
        {
          "--from-x": `${ring?.from.x ?? 0}px`,
          "--from-y": `${ring?.from.y ?? 0}px`,
        } as CSSProperties
      }
      data-fading={ring?.fading || undefined}
      onHoverChange={(isHovering) => {
        pointerOn.current.center = isHovering;
      }}
      onTransitionEnd={(event) => {
        if (ring?.fading && event.propertyName === "opacity") remove();
      }}
      onPress={() => copy()}
    >
      {waiting === ALL ? (
        <Spinner color="current" size="sm" aria-hidden="true" />
      ) : (
        <Copy aria-hidden="true" />
      )}
    </RingButton>
  );

  return (
    <>
      {portable ? (
        trigger
      ) : (
        // The ring replaces the button's tooltip, even one already showing.
        <Tooltip
          delay={300}
          isOpen={tooltip && !ring}
          onOpenChange={setTooltip}
        >
          {trigger}
          <Tooltip.Content>Copiar enlaces</Tooltip.Content>
        </Tooltip>
      )}
      {ring &&
        createPortal(
          <div
            ref={ringRef}
            id={menuId}
            role="menu"
            aria-label={label}
            aria-busy={!links}
            data-exiting={ring.closing || undefined}
            className="copy-ring"
            style={{
              left: ring.x - ring.inner - RING,
              top: ring.y - ring.inner - RING,
              width: 2 * (ring.inner + RING),
              height: 2 * (ring.inner + RING),
            }}
            onKeyDown={onRingKeyDown}
            onPointerEnter={clearTimer}
            onPointerLeave={(event) => {
              if (event.pointerType !== "touch") schedule(close, CLOSE_DELAY);
            }}
          >
            {/* The sectors come and go; the center stays, shrinking. */}
            <div
              // Out as long as the center's way back (globals.css).
              className={`copy-ring__sectors ${ring.closing ? "animate-out fade-out-0 zoom-out-90 fill-mode-forwards duration-200" : "animate-in fade-in-0 zoom-in-75 duration-150"}`}
              onAnimationEnd={(event) => {
                if (event.target !== event.currentTarget || !ring.closing)
                  return;
                // The button takes the center's place, or, hidden, the
                // center fades out first.
                if (isShown(triggerRef.current)) remove();
                else setRing({ ...ring, fading: true });
              }}
            >
              {providers.map((provider, index) => (
                <Sector
                  key={provider}
                  provider={provider}
                  index={index}
                  count={providers.length}
                  inner={ring.inner}
                  links={links}
                  waiting={waiting === provider}
                  portable={portable}
                  onCopy={() => copy(provider)}
                />
              ))}
            </div>
            {/* The pointer's center, over the button; keyboard and screen
                readers act on the button itself. */}
            {portable ? (
              center
            ) : (
              <Tooltip delay={300}>
                {center}
                {/* Clear of the ring: over a sector it would take its press. */}
                <Tooltip.Content offset={GAP + RING + 8}>
                  Copiar todos
                </Tooltip.Content>
              </Tooltip>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

function Sector({
  provider,
  index,
  count,
  inner,
  links,
  waiting,
  portable,
  onCopy,
}: {
  provider: DownloadProviderId;
  index: number;
  count: number;
  inner: number;
  links: EpisodeLinks | undefined;
  /** Pressed before the lookup ends: copies once it does. */
  waiting: boolean;
  portable: boolean;
  onCopy: () => void;
}) {
  const name = providerLabels[provider];
  const shape = sectorPath(index, count, inner);
  // Unknown until the lookup ends.
  const found = links?.episode.links.filter(
    (link) => link.provider === provider,
  ).length;
  const label =
    found === 0
      ? `${name} no tiene este episodio`
      : `Copiar ${found && found > 1 ? "los enlaces" : "el enlace"} de ${name}`;
  const [x, y] = polar(
    inner + RING,
    inner + RING / 2,
    sectorAngle(index, count),
  );
  const sector = (
    <RingButton
      role="menuitem"
      aria-label={label}
      aria-disabled={found === 0 || undefined}
      // Still looking it up: its mark pulses, a press waits for it.
      data-loading={!links || undefined}
      className="copy-ring__sector"
      style={{ clipPath: `path(evenodd, "${shape}")` }}
      onPress={() => {
        if (found !== 0 && !waiting) onCopy();
      }}
    >
      <span
        className="copy-ring__mark"
        style={{ left: x, top: y }}
        translate="no"
      >
        {waiting ? (
          <Spinner color="current" size="sm" aria-hidden="true" />
        ) : (
          logos[provider]
        )}
      </span>
      {/* An outline would be clipped with the sector: the focus is drawn
          along its shape instead. */}
      <svg className="copy-ring__contour" aria-hidden="true">
        <path d={shape} />
      </svg>
    </RingButton>
  );
  if (portable) return sector;
  return (
    <Tooltip delay={300}>
      {sector}
      <Tooltip.Content placement="top">{label}</Tooltip.Content>
    </Tooltip>
  );
}

/**
 * A piece of the ring: out of the tab order (arrows move between sectors),
 * not focused by a press, and a tooltip trigger. Its states are data
 * attributes for globals.css.
 */
function RingButton({
  onPress,
  onHoverChange,
  ...attributes
}: {
  onPress: (event: PressEvent) => void;
  onHoverChange?: (isHovering: boolean) => void;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const ref = useRef<HTMLButtonElement>(null);
  const { focusableProps } = useFocusable({ excludeFromTabOrder: true }, ref);
  const { pressProps, isPressed } = usePress({
    onPress,
    preventFocusOnPress: true,
    ref,
  });
  const { hoverProps, isHovered } = useHover({ onHoverChange });
  const { focusProps, isFocusVisible } = useFocusRing();
  return (
    <button
      {...mergeProps(
        attributes,
        focusableProps,
        pressProps,
        hoverProps,
        focusProps,
      )}
      ref={ref}
      type="button"
      data-hovered={isHovered || undefined}
      data-pressed={isPressed || undefined}
      data-focus-visible={isFocusVisible || undefined}
    />
  );
}
