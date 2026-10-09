# AnimeHub Web

AnimeHub Web permite explorar anime, consultar sus episodios y enviar enlaces a JDownloader desde el navegador. Puedes usarlo sin crear una cuenta en <https://animehub.duardo.dev/>.

Este repositorio contiene la interfaz web. Los datos y la resolución de enlaces llegan desde [AnimeHub API](https://animehub-api.duardo.dev/api/v1), que se desarrolla y despliega por separado en su [propio repositorio](https://github.com/duardor968/animehub-api).

## Qué puedes hacer

- Ver episodios recientes, destacados y títulos recién añadidos en la portada.
- Buscar anime, filtrar el catálogo y consultar un horario semanal estimado.
- Abrir fichas con metadatos, relaciones y episodios paginados.
- Resolver enlaces de un episodio, un rango o una serie completa.
- Enviar los enlaces a Click'n'Load o MyJDownloader, o copiarlos para usarlos por tu cuenta.

Los lotes muestran su progreso y permiten recuperar resultados parciales. El horario y la disponibilidad de enlaces dependen de los datos de la fuente actual, AnimeAV1.

La Web no incluye reproducción, cuentas, biblioteca personal ni seguimiento de lo visto. JDownloader se encarga de transferir los archivos.

## Arranque local

Necesitas Node.js 24, pnpm 12.10.1 y una instancia accesible de AnimeHub API. No hace falta instalar PostgreSQL ni Prisma para trabajar en la Web.

Desde la raíz del repositorio:

```sh
corepack enable
corepack prepare pnpm@12.10.1 --activate
pnpm install --frozen-lockfile
```

Copia `.env.example` a `.env.local`. El ejemplo apunta a una API local en el puerto `8000`; arráncala desde su propio repositorio antes de abrir las páginas que consultan datos. Después:

```sh
pnpm dev
```

Abre `http://localhost:3000`.

### Las tres URL de configuración

| Variable               | Quién la usa                                   | Valor local                    |
| ---------------------- | ---------------------------------------------- | ------------------------------ |
| `NEXT_PUBLIC_API_URL`  | El navegador, para llamar a la API.            | `http://localhost:8000/api/v1` |
| `API_INTERNAL_URL`     | El servidor de Next.js, para consultar la API. | `http://localhost:8000/api/v1` |
| `NEXT_PUBLIC_SITE_URL` | La Web, para sus URL canónicas y metadatos.    | `http://localhost:3000`        |

Las dos URL de API deben terminar en `/api/v1`. Si usas una instancia remota, su configuración de CORS debe permitir el origen de tu Web. No añadas contraseñas ni otros secretos a variables `NEXT_PUBLIC_*`: sus valores son públicos.

## Cómo se conecta con la API

La especificación original vive en el repositorio de la API. Aquí se guarda una copia concreta para que los tipos y el build no cambien cuando se publica una nueva versión del servidor:

- [`contracts/openapi.json`](contracts/openapi.json): contrato que consume esta revisión de la Web.
- [`contracts/source.json`](contracts/source.json): repositorio, commit, ruta, versión y SHA-256 de esa copia.
- [`src/lib/api/generated.ts`](src/lib/api/generated.ts): tipos generados; no se editan a mano.

```sh
pnpm contract:verify
pnpm contract:generate
pnpm contract:check
```

`contract:verify` comprueba el hash y la versión declarados. `contract:generate` regenera los tipos desde la copia local. `contract:check` hace ambas cosas y falla si los tipos difieren de lo registrado en Git. Ninguno descarga el contrato de producción ni necesita que la API esté encendida.

Para adoptar un cambio de la API:

1. Elige y revisa un commit concreto de su contrato.
2. Sustituye `contracts/openapi.json` y actualiza la procedencia y el hash en `contracts/source.json`.
3. Ejecuta `pnpm contract:generate`, adapta el cliente si hace falta y pasa las verificaciones.
4. Incluye contrato, procedencia y tipos generados en el mismo cambio.

Consulta [`contracts/source.json`](contracts/source.json) para conocer la revisión exacta del [repositorio de la API](https://github.com/duardor968/animehub-api) que consume esta Web. Ese archivo es la referencia para la procedencia y el hash del contrato.

## Trabajar en la interfaz

La Web usa Next.js con App Router, React, TypeScript, HeroUI y Tailwind CSS. Las versiones exactas están en [`package.json`](package.json) y el lockfile.

- `src/app/`: páginas, rutas y metadatos.
- `src/components/`: navegación, catálogo, portada, episodios y descargas.
- `src/lib/api/`: cliente HTTP y tipos de la API.
- `public/`: archivos estáticos, incluida la verificación del sitio.

Antes de dar un cambio por terminado:

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm contract:check
pnpm test:audit
pnpm audit:ci
pnpm build
```

Los tests usan Vitest y Testing Library. Para cambios visuales, revisa también escritorio, tablet y móvil, incluidos estados de carga, errores y acciones repetidas. Las pruebas automáticas no sustituyen comprobar el flujo real con JDownloader.

### Si falla el envío de enlaces

Click'n'Load se conecta a `http://127.0.0.1:9666` en la computadora del usuario, así que JDownloader debe estar abierto allí. Las restricciones del navegador pueden bloquear esa conexión local.

MyJDownloader funciona desde el navegador y necesita una sesión y un dispositivo disponible en ese servicio. Sus credenciales no se envían a AnimeHub API. Si ninguna integración está disponible, puedes copiar los enlaces.

## Despliegue

El [`Dockerfile`](Dockerfile) de la raíz genera una imagen Next.js standalone para el puerto `3000`:

```sh
docker build -t animehub-web \
  --build-arg NEXT_PUBLIC_API_URL=https://animehub-api.duardo.dev/api/v1 \
  --build-arg NEXT_PUBLIC_SITE_URL=https://animehub.duardo.dev .
```

`NEXT_PUBLIC_API_URL` y `NEXT_PUBLIC_SITE_URL` se fijan durante la construcción de la imagen. Cambiarlas después exige reconstruirla. `API_INTERNAL_URL` se configura al ejecutar el contenedor y debe ser accesible desde el servidor de Next.js; puede apuntar a la URL pública de la API o a una dirección interna estable. Conserva `HOSTNAME=0.0.0.0`.

Las peticiones que el servidor de Next.js hace a la API llevan la dirección del visitante en `X-Forwarded-For` (tomada de `cf-connecting-ip`, de `x-real-ip` o del último salto de `x-forwarded-for`). Para que la API limite las peticiones por visitante y no por servidor, configura su `TRUST_PROXY` con la dirección de este servidor en lugar de añadirla a `RATE_LIMIT_ALLOWLIST`.

El endpoint `/health` confirma que Next.js responde. No comprueba la API ni PostgreSQL. La Web puede desplegarse por separado, siempre que conserve la compatibilidad con la versión de API que consume.

La migración debe mantener `https://animehub.duardo.dev/`, sus metadatos y el archivo de verificación de Google. Este repositorio nace de la separación de `apps/web` del [monorepo AnimeHub Web](https://github.com/duardor968/animehub-web), conservando su historial. El monorepo anterior está archivado y se conserva como referencia histórica.

## Licencia

[GNU AGPL v3 o posterior](LICENSE).
