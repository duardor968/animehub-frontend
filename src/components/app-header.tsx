import Link from "next/link";
import { DownloadSettingsButton } from "./downloads/download-settings-button";
import { Brand } from "./brand";
import { SearchBox } from "./search-box";

export function AppHeader() {
  return (
    <header className="app-header">
      <div className="header-inner">
        <Brand />
        <nav className="desktop-nav" aria-label="Principal">
          <Link href="/">Inicio</Link>
          <Link href="/catalogo">Catálogo</Link>
          <Link href="/horario">Horario</Link>
        </nav>
        <div className="header-tools">
          <SearchBox compact />
          <DownloadSettingsButton />
        </div>
      </div>
    </header>
  );
}
