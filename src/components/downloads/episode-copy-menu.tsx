"use client";

import { Button, Skeleton, Spinner, Tooltip } from "@heroui/react";
import { buttonVariants } from "@heroui/styles";
import { Copy } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
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
import { useDownloads, type EpisodeLinks } from "./download-provider";
import { providerLabels, type DownloadProviderId } from "./download-types";

/** Pause on the button before its links are looked up. */
const OPEN_DELAY = 250;
/** Grace to cross the gaps between the pieces without closing. */
const CLOSE_DELAY = 200;
/** Ring thickness: a touch target in every sector. */
const RING = 52;
/** Between the center and the ring, and between sectors. */
const GAP = 4;
/** Closest the ring gets to the viewport edge. */
const EDGE = 8;

// Every mark is a logo; the sector's label names it.
const logos: Record<DownloadProviderId, ReactNode> = {
  MEGA: <MegaLogo />,
  PIXELDRAIN: <PixeldrainLogo />,
  MP4UPLOAD: (
    <Image
      src={mp4uploadLogo}
      alt=""
      width={144}
      height={23}
      unoptimized
      className="copy-ring__wordmark"
    />
  ),
  ONE_FICHIER: (
    <Image src={oneFichierLogo} alt="" width={40} height={48} unoptimized />
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

/** The sector an arrow points at, among the enabled ones (on a tie, the
 *  one already focused); null when none is enabled. */
export function sectorForArrow(
  key: string,
  count: number,
  current: number | null,
  enabled: boolean[] = [],
) {
  const target = arrowAngles[key];
  let best: number | null = null;
  for (let index = 0; index < count; index++) {
    if (enabled[index] === false) continue;
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
const isEnabled = (item: HTMLElement) => !item.hasAttribute("aria-disabled");

const round = (value: number) => Math.round(value * 100) / 100;

function polar(center: number, radius: number, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  return [
    round(center + radius * Math.cos(radians)),
    round(center + radius * Math.sin(radians)),
  ];
}

/** Path of an annular sector inside the ring's square box: its clip-path
 *  and its keyboard-focus contour. A ring of one is two circles (evenodd). */
function sectorPath(index: number, count: number, inner: number) {
  const outer = inner + RING;
  if (count === 1) {
    const circle = (r: number) =>
      `M ${outer - r} ${outer} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
    return `${circle(outer)} ${circle(inner)}`;
  }
  const span = 360 / count;
  const mid = sectorAngle(index, count);
  // The gap is constant in pixels, so it takes a wider angle on the inside.
  const pad = (radius: number) => (GAP / 2 / radius) * (180 / Math.PI);
  const [ax, ay] = polar(outer, outer, mid - span / 2 + pad(outer));
  const [bx, by] = polar(outer, outer, mid + span / 2 - pad(outer));
  const [cx, cy] = polar(outer, inner, mid + span / 2 - pad(inner));
  const [dx, dy] = polar(outer, inner, mid - span / 2 + pad(inner));
  const large = span > 180 ? 1 : 0;
  return `M ${ax} ${ay} A ${outer} ${outer} 0 ${large} 1 ${bx} ${by} L ${cx} ${cy} A ${inner} ${inner} 0 ${large} 0 ${dx} ${dy} Z`;
}

interface Ring {
  /** Center of the ring in the viewport (the button's, unless clamped). */
  x: number;
  y: number;
  inner: number;
  /** Opened with an arrow: focus the sector that way once its links are in. */
  focus: string | null;
  closing: boolean;
}

/**
 * The episode's button when links go to the clipboard: a copy button that,
 * after a pause on it (hover or keyboard focus) or a tap, opens a ring around
 * itself, like a remote's directional pad. The center copies every link; each
 * sector copies one provider's. The links are looked up on the first opening.
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
  // A copy made with the pointer on the button leaves it there: no reopening
  // until it leaves and comes back.
  const copiedUnderPointer = useRef(false);
  const [ring, setRing] = useState<Ring | null>(null);
  const [links, setLinks] = useState<EpisodeLinks | undefined>();
  const [waiting, setWaiting] = useState(false);
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
    const inner = button.offsetWidth / 2 + GAP;
    const reach = inner + RING + EDGE;
    const clamp = (value: number, size: number) =>
      Math.min(Math.max(value, reach), size - reach);
    setRing({
      x: clamp(box.left + box.width / 2, window.innerWidth),
      y: clamp(box.top + box.height / 2, window.innerHeight),
      inner,
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

  function copy(provider?: DownloadProviderId, underPointer = false) {
    copiedUnderPointer.current = underPointer;
    if (links) {
      copyEpisodeLinks(request, links, provider);
      close();
      return;
    }
    // The center before the lookup ends: copy everything once it does.
    setWaiting(true);
    void resolveEpisodeLinks(request).then((value) => {
      setWaiting(false);
      if (value) copyEpisodeLinks(request, value);
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

  // Opened with an arrow: once the links are in, focus that way.
  useEffect(() => {
    if (!ring?.focus || ring.closing || !links) return;
    const items = menuItems(ringRef.current);
    const index = sectorForArrow(
      ring.focus,
      items.length,
      null,
      items.map(isEnabled),
    );
    if (index !== null) items[index].focus();
  }, [ring, links]);

  useEffect(() => clearTimer, []);

  function onTriggerKeyDown(event: KeyboardEvent) {
    if (!(event.key in arrowAngles)) return;
    event.preventDefault();
    show(event.key);
  }

  // Arrows and Home/End move between the sectors that have links.
  function onRingKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = menuItems(event.currentTarget);
    const enabled = items.filter(isEnabled);
    let next: HTMLElement | undefined;
    if (event.key in arrowAngles) {
      const current = items.indexOf(document.activeElement as HTMLElement);
      const index = sectorForArrow(
        event.key,
        items.length,
        current,
        items.map(isEnabled),
      );
      next = index === null ? undefined : items[index];
    } else if (event.key === "Home") next = enabled[0];
    else if (event.key === "End") next = enabled.at(-1);
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
      variant="tertiary"
      aria-label={label}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={open ? menuId : undefined}
      isPending={waiting}
      className={className}
      onHoverStart={() => {
        if (!copiedUnderPointer.current) schedule(() => show(), OPEN_DELAY);
      }}
      onHoverEnd={() => {
        copiedUnderPointer.current = false;
        if (ring) schedule(close, CLOSE_DELAY);
        else clearTimer();
      }}
      onKeyDown={onTriggerKeyDown}
      onPress={(event) => {
        // On touch the first tap opens it; the center then copies.
        if (event.pointerType === "touch" && !open) show();
        else copy(undefined, event.pointerType === "mouse");
      }}
    >
      {waiting ? (
        <Spinner color="current" size="sm" aria-label="Buscando enlaces" />
      ) : (
        <Copy aria-hidden="true" />
      )}
    </Button>
  );

  const center = (
    <RingButton
      aria-hidden="true"
      className={`${buttonVariants({ variant: "tertiary", isIconOnly: true })} copy-ring__center ${isFocusVisible ? "is-focus-visible" : ""}`}
      onPress={(event) => copy(undefined, event.pointerType === "mouse")}
    >
      {waiting ? (
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
            data-sectors={providers.length}
            className={`copy-ring ${ring.closing ? "animate-out fade-out-0 zoom-out-90 fill-mode-forwards duration-150" : "animate-in fade-in-0 zoom-in-75 duration-200"}`}
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
            onAnimationEnd={(event) => {
              if (event.target === event.currentTarget && ring.closing)
                setRing(null);
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
                portable={portable}
                onCopy={() => copy(provider)}
              />
            ))}
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
  portable,
  onCopy,
}: {
  provider: DownloadProviderId;
  index: number;
  count: number;
  inner: number;
  links: EpisodeLinks | undefined;
  portable: boolean;
  onCopy: () => void;
}) {
  const name = providerLabels[provider];
  const shape = sectorPath(index, count, inner);
  const found =
    links?.episode.links.filter((link) => link.provider === provider).length ??
    0;
  const label = !links
    ? `Buscando el enlace de ${name}…`
    : found === 0
      ? `${name} no tiene este episodio`
      : `Copiar ${found === 1 ? "el enlace" : "los enlaces"} de ${name}`;
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
      // Still looking it up: neither available nor without a link.
      data-loading={!links || undefined}
      className="copy-ring__sector"
      style={{ clipPath: `path(evenodd, "${shape}")` }}
      onPress={() => {
        if (found > 0) onCopy();
      }}
    >
      {!links && <Skeleton animationType="pulse" />}
      <span
        className="copy-ring__mark"
        style={{ left: x, top: y }}
        translate="no"
      >
        {logos[provider]}
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
  ...attributes
}: {
  onPress: (event: PressEvent) => void;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const ref = useRef<HTMLButtonElement>(null);
  const { focusableProps } = useFocusable({ excludeFromTabOrder: true }, ref);
  const { pressProps, isPressed } = usePress({
    onPress,
    preventFocusOnPress: true,
    ref,
  });
  const { hoverProps, isHovered } = useHover({});
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
