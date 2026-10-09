# Handoff: pulido de UI/UX y actualización de dependencias (octubre de 2026)

Trabajo hecho de forma autónoma en dos repositorios, `animehub-frontend` (esta Web) y [`animehub-api`](https://github.com/duardor968/animehub-api), en la rama `claude/vigilant-feynman-banxr0` de cada uno y publicado también en `dev`. Este documento reúne los encargos originales, las decisiones tomadas, lo que cambió, cómo desplegarlo y todo lo que quedó pendiente.

## 1. Encargos originales

> **Prompt 1**
>
> Vamos a hacer un leve refactor y pulido de este sitio (https://animehub.duardo.dev/).
>
> Lo he pulido bastante pero quiero que lo analices a lujo de detalle y pulas hasta el más mínimo error de UI/UX que encuentres en cualquiera de sus partes, de paso actualiza todas sus dependencias también.
>
> Quiero que trabajes de forma autónoma hasta el final así que solo hazme un par de tandas de preguntas ahora luego de que tengas un poco de contexto y ya, seguirás solo hasta el final.
>
> PD: No tienes restricciones en subagentes Opus, tengo cuota de sobra.

> **Prompt 2** (durante el trabajo, con dos informes de PageSpeed Insights adjuntos)
>
> Te paso de paso unas cosas de la Google Search Console, para resolver lo de las imágenes habría que guardarlas convertidas a webp nosotros y luego mostrar las nuestras, sería más o menos como un caché que tarde mucho pero mucho en expirar, pero como no tienes acceso a BD eso solo planifícalo y no lo implementes, o sea, prepara al final un .md handoff con todo lo que no pudiste hacer y con mis prompt originales y con las decisiones que tomamdos.

## 2. Decisiones

### Respondidas por ti

| Tema               | Decisión                                                                                                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependencias       | Todo a la última, incluidos los majors.                                                                                                                                    |
| Alcance visual     | «Pulido + mejoras visibles»: se mantiene la identidad y se permiten piezas nuevas pequeñas (footer, enlace para saltar al contenido, mejores esqueletos y estados vacíos). |
| API                | Se toca también si el problema nace allí; se regenera el contrato y se sincroniza en la Web.                                                                               |
| Entrega            | Commits y push a `dev` (además de la rama de trabajo).                                                                                                                     |
| Runtime            | Node 24 LTS (CI con el último 24.x, imagen `node:24-alpine`). pnpm a la última si no rompe nada.                                                                           |
| Footer             | Mínimo: marca, navegación, aviso «AnimeHub no aloja archivos. Datos y enlaces de AnimeAV1.» y enlace al código (AGPL-3.0).                                                 |
| Episodios en móvil | Lista compacta (miniatura, número o título, selección y descarga en una fila).                                                                                             |
| Tema               | Solo oscuro, con los colores en tokens para que un tema claro sea fácil más adelante.                                                                                      |
| Imágenes WebP      | Solo planificar; no implementar (ver §6).                                                                                                                                  |

### Tomadas durante el trabajo (por delegación)

- **Colores:**
  - Paleta centralizada en tokens semánticos (`src/app/globals.css`).
  - El azul de los rellenos con texto pasa a `#1F6FEB`: el blanco sobre el anterior `#2F81F7` daba 3,75:1 y no cumplía AA; ahora da 4,63:1.
  - El azul de marca original queda para indicadores decorativos.
- **Contenedor:** uno solo de 1600 px para cabecera, páginas y footer; todos los bordes alinean.
- **Navegación:** la de escritorio aparece desde 1024 px; por debajo, barra inferior centrada y limitada en tabletas. Una sola variable, `--bottom-nav-clearance`, separa del borde inferior todo lo fijo.
- **Catálogo:**
  - Géneros de selección única: con dos o más, la fuente ignora el resto de filtros (verificado en animeav1.com).
  - Nuevo filtro «Inicial» (A–Z y #).
  - «Más de 1.000 obras» cuando la fuente recorta (`meta.capped`).
  - Paginación numerada con salto a página.
- **Descargas:**
  - Se siguen enviando todos los espejos, ahora indicados en el texto.
  - Confirmación de «Descargar todo» a partir de 25 episodios.
  - «Copiar enlaces» como tercer destino y como alternativa en cualquier fallo.
  - Cancelar y «Reintentar fallidos».
  - Un toast por descarga, actualizado en el sitio.
  - Las selecciones de más de 50 episodios usan el nuevo alcance `EPISODES` y ya no descargan la serie entera.
- **Horario:**
  - Aviso «Horarios referenciales» integrado en la página en lugar de un toast permanente.
  - El mismo criterio de estado (Emitido / Próximo / Ahora / Retrasado / Final) para todos los días.
- **Rendimiento:** se mantiene `images.unoptimized`, porque la caché WebP de imágenes remotas queda planificada (§6).

## 3. Qué cambió

### Web (`animehub-frontend`)

**Dependencias**

- Next 16.4, React 19.3, TypeScript 6.0, ESLint 10, Vitest 5, jest-dom 7 y lucide-react 1.53.
- pnpm 12.10.1 y GitHub Actions en sus últimos majors.
- Limpiados los `overrides` y `allowBuilds` heredados del monorepo, y retirada TanStack Query (no se usaba).

**Base visual**

- Tokens de color, utilidades `page-container` y `eyebrow`, anillo de foco uniforme y plurales y números en formato español (`plural()`, `formatNumber()`).
- Textos de React Aria/HeroUI en español (`I18nProvider es-ES`).

**Estructura**

- Footer, enlace para saltar al contenido, cabecera reorganizada (sin búsqueda duplicada en `/buscar`) y error con «Reintentar» que reintenta de verdad.
- Títulos, canonical y Open Graph correctos por página.
- Iconos y manifest; `viewport-fit=cover`.

**Portada**

- Secciones alineadas con enlaces «Ver horario» y «Ver catálogo».
- Carrusel corregido: autoplay, pausa, foco, movimiento reducido, un solo `h1` y diapositivas ocultas inertes.
- Póster como fondo en móvil y esqueleto con la forma real de la página.
- Renderizado en servidor: también funciona sin JavaScript.

**Ficha de anime**

- Cabecera móvil lado a lado con «Leer más».
- Lista compacta en móvil (One Piece pasa de ≈13.800 px a ≈5.950 px de alto).
- Paginación en la URL y navegación Atrás/Adelante correcta.
- Rango basado en `firstNumber`/`lastNumber`, con soporte de episodios decimales («12,5»).
- 404 real para slugs inexistentes, relacionados sin etiquetas repetidas y fecha relativa en los episodios.

**Descargas**

- Todo lo listado en §2, más textos de error en español y por causa.
- `Idempotency-Key` por acción y respeto de `Retry-After`.
- Cancelación segura frente a carreras con la API.
- Panel de MyJDownloader unificado y cajón cargado bajo demanda.

**Catálogo y búsqueda**

- Recuento mostrado una sola vez.
- El borrador de filtros se conserva al cerrar el cajón, que ahora atenúa el fondo.
- Redirecciones para URL inválidas o fuera de rango y metadatos con noindex en vistas filtradas.
- «Relevancia» como orden por defecto al buscar.
- Cuadro de búsqueda corregido: Escape, foco, Ctrl/⌘K, 16 px en móvil y límite de 100 caracteres.

**Horario**

- Renderizado en servidor de toda la semana, con zona horaria por cookie o por cabecera del edge y CLS 0.
- Pestañas propias en español.

**Seguridad y robustez**

- El SSR reenvía la IP del visitante en `X-Forwarded-For`.
- El sitemap lista todos los títulos conocidos (`GET /sitemap/anime`) con caché de 1 h.

### API (`animehub-api`)

**Dependencias**

- NestJS 12, TypeScript 6.0, ESLint 10, Vitest 5, Prisma 7.10, pg-boss 12.37, zod 4.6 y devalue 6.
- pnpm 12 y GitHub Actions en sus últimos majors.
- Eliminados Jest y otras dependencias de desarrollo sin uso; `test:cov` funciona.

**Contrato** (sincronizado en `contracts/` de la Web)

| Endpoint                           | Cambio                                                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /catalog`                     | Nuevo `meta.capped`.                                                                                                                             |
| `GET /anime/{slug}/episodes`       | Nuevos `meta.firstNumber` y `meta.lastNumber`.                                                                                                   |
| `POST /anime/{slug}/download-jobs` | Nuevo alcance `EPISODES`; `RANGE` exige `from` ≤ `to`; cabecera opcional `Idempotency-Key` (409/422); el recibo incluye `missingEpisodeNumbers`. |
| Nuevo `GET /sitemap/anime`         | Lista de títulos para el sitemap.                                                                                                                |
| `RelationDto.kind`                 | Añade `ALTERNATIVE_SETTING`, `FULL_STORY` y `SPIN_OFF`.                                                                                          |
| Respuestas 429                     | Llevan `Retry-After`, expuesto por CORS.                                                                                                         |

**Errores**

- Slug inexistente → 404 (antes 503).
- Límite de peticiones propio → 429 (antes 500).
- Fallos de la fuente → 503.
- Los POST responden 200, como documenta el contrato.

**Trabajos**

- Las transiciones de estado son seguras frente a carreras: cancelar ya no pisa trabajos terminados y el worker no pisa los cancelados.
- `retry` solo admite trabajos terminados en PARTIAL o FAILED.

**Otros**

- Géneros ordenados.
- El horario omite series sin episodio nuevo en 21 días.
- `RATE_LIMIT_MAX` es configurable, con `TRUST_PROXY` documentado.
- El sondeo de trabajos tiene su propio cupo (300/min).

**Migraciones nuevas**

| Migración                                      | Qué hace                                                                                  |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `20261009100000_relation_kinds`                | `ALTER TYPE ... ADD VALUE`.                                                               |
| `20261009100100_anime_content_updated_at`      | Columna nueva con backfill.                                                               |
| `20261009120000_refresh_folded_relation_kinds` | Reprograma, dentro de 24 h, el refresco de las relaciones guardadas con tipos colapsados. |
| `20261009120100_download_job_idempotency_key`  | Clave de idempotencia de los trabajos.                                                    |

## 4. Verificación y resultados

**Auditorías**

- Cuatro auditorías iniciales de solo lectura sumaron 182 hallazgos: portada y estructura, ficha y descargas, catálogo, búsqueda y horario, y accesibilidad y responsive.
- La re-auditoría del sitio integrado dio 171 corregidos, 7 parciales, 3 cambiados por decisión, 1 no reproducible y 0 sin corregir.
- Los parciales y los 22 hallazgos nuevos de esa re-auditoría se corrigieron en la última ronda.

**Accesibilidad:** axe sin violaciones en 13 páginas y 10 estados abiertos, a 390 y 1440 px.

**Lighthouse móvil** (build de producción local, Lighthouse 13.5)

| Página      | Rendimiento   | LCP                | Peso      |
| ----------- | ------------- | ------------------ | --------- |
| `/` antes   | 66–72         | ≈8,0 s             | 1.423 KiB |
| `/` después | 83–84         | ≈4,0–4,4 s         | 662 KiB   |
| `/catalogo` | 75–79 → 85–86 | 5,2–6,3 s → ≈4,1 s | —         |

- CSS bloqueante: 51,5 KB → 31,6 KB gzip (solo los estilos de HeroUI que se usan).
- CLS 0 en todas las páginas.

**Checks**

- Web: `format:check`, `lint`, `typecheck`, `test` (223 tests), `contract:check`, `test:audit`, `audit:ci` y `build` en verde.
- API: los mismos más `test:integration` (9), `openapi:check`, `test:shutdown` y `test:cov`, en verde (167 unitarios).

**Revisión de código:** sin bloqueantes. El hallazgo alto (la exención del límite de peticiones dejaba sin freno las consultas a AnimeAV1) se corrigió eliminando esa exención y reenviando la IP del visitante.

## 5. Despliegue

1. **Primero la API, después la Web.** La Web nueva usa `EPISODES`, `meta.capped`, los límites de episodios y el sitemap; contra la API anterior, las selecciones grandes devolverían 400.
2. **Migraciones de Prisma:** se aplican solas al arrancar la imagen de la API (`prisma migrate deploy`). `ALTER TYPE ... ADD VALUE` requiere PostgreSQL 12 o superior.
3. **pg-boss 12.27 → 12.37:** en el primer arranque con `JOBS_ENABLED=true` migra su esquema de la versión 37 a la 45. Los cambios son aditivos.
4. **Configuración nueva:**
   - Define `TRUST_PROXY` en la API con las direcciones de los proxies que tiene delante, **incluido el servidor de la Web**. Sin esto, todo el SSR comparte un único cupo de 120/min y, con tráfico, devolverá 429.
   - `RATE_LIMIT_MAX` es opcional (por defecto 120).
5. **Vuelta atrás:** una imagen antigua de la API no entiende las filas con los nuevos `RelationKind` una vez escritas, así que revertir exige corregir esos datos.
6. **Imágenes Docker:** no se pudieron construir en este entorno (no hay demonio de Docker); las construye CI al hacer push a `dev`.

## 6. Pendiente

### Planificado, sin implementar

- **Caché propia de imágenes en WebP de larga duración.** El plan completo está en el repositorio de la API, en [`docs/plan-cache-imagenes-webp.md`](https://github.com/duardor968/animehub-api/blob/dev/docs/plan-cache-imagenes-webp.md): endpoint de medios, almacenamiento (R2, volumen o `bytea`), tabla de metadatos, revalidación por ETag, URL versionadas y una alternativa rápida con el optimizador de Next. Es el mayor ahorro pendiente: PageSpeed estima 538 KiB solo en la portada, y el LCP depende hoy de un JPEG de 349 KiB de la fuente.

### Retenido a propósito

- TypeScript 7: typescript-eslint solo admite TS < 6.1.
- `@types/node` 26: el runtime es Node 24 LTS.
- Prisma 8: solo hay RC.
- embla-carousel 9: solo hay RC.
- vite 8.3.4 (dependencia de Vitest): pnpm lo bloquea por tener menos de 24 h; se puede subir a partir del 9 de octubre a las 12:07 UTC.
- `peerDependencyRules.allowedVersions` admite ESLint 10 en `eslint-plugin-react`, `jsx-a11y` e `import`, y TypeScript 6 en `openapi-typescript`. Quitarlo cuando esos paquetes declaren soporte.
- Override de `mysql2` (Prisma fija 3.15.3, vulnerable) y excepción GHSA de `deepmerge-ts`: retirar cuando Prisma los actualice.
- `braces` (solo en desarrollo, sin versión corregida).

### Requiere prueba manual o un entorno real

- Click'n'Load desde el origen HTTPS de producción: Chrome puede pedir permiso de red local para `127.0.0.1:9666`. Los textos de error ya lo mencionan.
- La lista de dispositivos de MyJDownloader y el flujo completo con un JDownloader real.
- PageSpeed contra producción tras el despliegue, para confirmar las cifras locales.

### Conocido y no resuelto

- **API:** si el worker cae, los ítems que quedaron en RUNNING no se recogen de nuevo. Conviene un barrido al arrancar que los devuelva a PENDING.
- **Web:**
  - Next renderiza en cliente la 404 de anime y la página de error; es un comportamiento del framework. El error de consola asociado sí se corrigió.
  - En desarrollo, el overlay de Next muestra «1 Issue» tras un login fallido de MyJDownloader, por una promesa rechazada dentro de `jdownloader-connect`. En producción no hay error.
  - El aviso de PageSpeed sobre JavaScript antiguo: el módulo de polyfills de Next (1,4 KB) no se puede quitar, y el beacon de Cloudflare Insights lo inyecta Cloudflare fuera del repositorio.
- **Limitaciones de la fuente:**
  - Los listados se cortan en 1.000 obras / 50 páginas; se mitiga con el filtro de inicial y el aviso.
  - Los filtros fallan con varios géneros; se mitiga con la selección única.
  - Las capturas de episodio miden 220×124, así que siguen viéndose algo borrosas en tarjetas grandes.
- **Historial:** el commit de `plural()` aparece tres veces porque cada rama de área lo incorporó por su cuenta; es solo cosmético.
