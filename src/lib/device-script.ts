/**
 * Inline <head> script, run before the first paint:
 * - html[data-device], so the touch-specific CSS (hover panels, tap targets)
 *   doesn't shift the layout after hydration. Mirrors detectDeviceProfile()
 *   in src/components/downloads/device-profile.ts (same attribute values);
 *   the DownloadProvider effect still runs as a fallback.
 * - html[data-tz], the viewer's IANA time zone: the schedule shows its
 *   server-rendered week at once when it was grouped in that zone (see
 *   ScheduleBoard).
 */
export const deviceProfileScript = `(function(){var h=document.documentElement;try{var n=navigator,u=n.userAgent||"",d=n.userAgentData,p=(d&&d.mobile===true)||/Android|iPhone|iPad|iPod/i.test(u)||(n.platform==="MacIntel"&&(n.maxTouchPoints||0)>1);if(u||n.platform||d)h.dataset.device=p?"portable":"desktop";}catch(e){}try{var z=Intl.DateTimeFormat().resolvedOptions().timeZone;if(z)h.dataset.tz=z;}catch(e){}})();`;
