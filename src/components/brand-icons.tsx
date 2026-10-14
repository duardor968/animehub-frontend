import type { SVGProps } from "react";

/** GitHub mark, from Primer Octicons (`mark-github-24`, MIT). */
export function GithubMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M10.226 17.284c-2.965-.36-5.054-2.493-5.054-5.256 0-1.123.404-2.336 1.078-3.144-.292-.741-.247-2.314.09-2.965.898-.112 2.111.36 2.83 1.01.853-.269 1.752-.404 2.853-.404 1.1 0 1.999.135 2.807.382.696-.629 1.932-1.1 2.83-.988.315.606.36 2.179.067 2.942.72.854 1.101 2 1.101 3.167 0 2.763-2.089 4.852-5.098 5.234.763.494 1.28 1.572 1.28 2.807v2.336c0 .674.561 1.056 1.235.786 4.066-1.55 7.255-5.615 7.255-10.646C23.5 6.188 18.334 1 11.978 1 5.62 1 .5 6.188.5 12.545c0 4.986 3.167 9.12 7.435 10.669.606.225 1.19-.18 1.19-.786V20.63a2.9 2.9 0 0 1-1.078.224c-1.483 0-2.359-.808-2.987-2.313-.247-.607-.517-.966-1.034-1.033-.27-.023-.359-.135-.359-.27 0-.27.45-.471.898-.471.652 0 1.213.404 1.797 1.235.45.651.921.943 1.483.943.561 0 .92-.202 1.437-.719.382-.381.674-.718.944-.943" />
    </svg>
  );
}

/** MEGA logo, from mega.io (`megalib/icons/logos/mega.svg`). Trademark of
 *  Mega Limited, used only to name its service; no licence stated. */
export function MegaLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        fill="#DD1405"
        d="M12 24C5.376 24 0 18.624 0 12C0 5.376 5.376 0 12 0C18.624 0 24 5.376 24 12C24 18.624 18.624 24 12 24Z"
      />
      <path
        fill="#fff"
        d="M18 15.653C18 15.848 17.8425 15.9997 17.6475 15.9997H16.1325C15.9375 15.9997 15.78 15.848 15.78 15.653V11.1247C15.78 11.0813 15.7275 11.0669 15.705 11.0886L12.5025 14.2086C12.225 14.483 11.775 14.483 11.4975 14.2086L8.295 11.0886C8.2725 11.0669 8.22 11.0813 8.22 11.1247V15.653C8.22 15.848 8.0625 15.9997 7.8675 15.9997H6.3525C6.1575 15.9997 6 15.848 6 15.653V7.67967C6 7.48467 6.1575 7.33301 6.3525 7.33301H7.395C7.5825 7.33301 7.7625 7.40523 7.8975 7.53523L11.8725 11.4136C11.94 11.4786 12.06 11.4786 12.1275 11.4136L16.1025 7.53523C16.2375 7.40523 16.4175 7.33301 16.605 7.33301H17.6475C17.8425 7.33301 18 7.48467 18 7.67967V15.653Z"
      />
    </svg>
  );
}

/** Pixeldrain logo, from pixeldrain.com (`/res/img/pixeldrain.svg`), whose
 *  white fill is drawn in currentColor. Trademark of its owner, used only to
 *  name its service; no licence stated. */
export function PixeldrainLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 288 288"
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      <path d="m142 2.23c-77 0-139 62.5-139 140 0 77 62.5 139 139 139 77 0 139-62.5 139-139 1e-3 -77-62.5-140-139-140zm0 258c-65.7 0-119-53.2-119-119s53.2-119 119-119c65.7 0 119 53.2 119 119 0 65.7-53.2 119-119 119zm0-219c-55.1 0-99.8 44.7-99.8 99.8 0 55.1 44.7 99.8 99.8 99.8s99.8-44.7 99.8-99.8c0-55.1-44.7-99.8-99.8-99.8zm49.3 36c8.69 0 15.7 7.04 15.7 15.7 0 8.69-7.04 15.7-15.7 15.7s-15.7-7.04-15.7-15.7c0-8.69 7.04-15.7 15.7-15.7zm-49.3-20c8.69 0 15.7 7.04 15.7 15.7 0 8.69-7.04 15.7-15.7 15.7s-15.7-7.04-15.7-15.7c0-8.69 7.04-15.7 15.7-15.7zm-48.7 20c8.69 0 15.7 7.04 15.7 15.7 0 8.69-7.04 15.7-15.7 15.7s-15.7-7.04-15.7-15.7c-1e-3 -8.69 7.04-15.7 15.7-15.7zm-35 63.8c0-8.69 7.04-15.7 15.7-15.7s15.7 7.04 15.7 15.7c0 8.69-7.04 15.7-15.7 15.7-8.69 0-15.7-7.04-15.7-15.7zm35 65.6c-8.69 0-15.7-7.04-15.7-15.7s7.04-15.7 15.7-15.7 15.7 7.04 15.7 15.7-7.04 15.7-15.7 15.7zm48.7 20.7c-8.69 0-15.7-7.04-15.7-15.7 0-8.69 7.04-15.7 15.7-15.7 8.69 0 15.7 7.04 15.7 15.7 1e-3 8.68-7.04 15.7-15.7 15.7zm2e-3 -47c-21.2 0-38.5-17.2-38.5-38.5 0-21.2 17.2-38.5 38.5-38.5 21.2 0 38.5 17.2 38.5 38.5 0 21.2-17.2 38.5-38.5 38.5zm49.3 26.3c-8.69 0-15.7-7.04-15.7-15.7s7.04-15.7 15.7-15.7 15.7 7.04 15.7 15.7-7.04 15.7-15.7 15.7zm18.6-49.9c-8.69 0-15.7-7.04-15.7-15.7 0-8.69 7.04-15.7 15.7-15.7s15.7 7.04 15.7 15.7c0 8.69-7.04 15.7-15.7 15.7z" />
    </svg>
  );
}

/** 1Fichier's cube without its reflection, from img.1fichier.com/logo.png, and
 *  the "m" cropped from MP4Upload's wordmark, its only logo
 *  (mp4upload.com/mp4v2/img/logo3.png): WebP at over twice their display
 *  size. Trademarks of their owners, used only to name their services; no
 *  licence stated. */
export { default as oneFichierLogo } from "@/assets/providers/1fichier.webp";
export { default as mp4uploadLogo } from "@/assets/providers/mp4upload.webp";

/** Streamtape's mark, its favicon (streamtape.com/favicon.ico), and
 *  Transfer.it's (st.transfer.it/images/favicons/favicon.svg, a PNG inside):
 *  WebP at over twice their display size. Trademarks of their owners, used
 *  only to name their services; no licence stated. */
export { default as streamtapeLogo } from "@/assets/providers/streamtape.webp";
export { default as transferitLogo } from "@/assets/providers/transferit.webp";
