/**
 * Inline <head> script: sets html[data-device] before the first paint so the
 * touch-specific CSS (hover panels, tap targets) doesn't shift the layout
 * after hydration. Mirrors detectDeviceProfile() in
 * src/components/downloads/device-profile.ts (same attribute values); the
 * DownloadProvider effect still runs as a fallback.
 */
export const deviceProfileScript = `(function(){try{var n=navigator,u=n.userAgent||"",d=n.userAgentData,p=(d&&d.mobile===true)||/Android|iPhone|iPad|iPod/i.test(u)||(n.platform==="MacIntel"&&(n.maxTouchPoints||0)>1);if(u||n.platform||d)document.documentElement.dataset.device=p?"portable":"desktop";}catch(e){}})();`;
