# Pluto TV para Kino

Plugin comunitario para explorar y reproducir **contenido VOD** de Pluto TV en Kino. No incluye canales de TV en vivo.

## Instalación

En Kino, abre **Ajustes → Plugins**, añade el repositorio público `joseang226-coder/kino-pluto-tv` y acepta los dominios solicitados. El repositorio debe ser público para que Kino pueda descargar el manifiesto y el plugin.

## Qué incluye esta versión

- Filas de inicio y navegación paginada por categorías/shelves de VOD que Pluto expone.
- Búsqueda de películas y series con el endpoint GraphQL que usa la web LATAM de Pluto TV; conserva una búsqueda de categorías como fallback.
- Listado de temporadas y episodios desde el endpoint GraphQL de Pluto TV (p. ej., Breadwinners devuelve 2 temporadas y 39 episodios).
- Resolución de reproducción HLS mediante la sesión de Pluto y sus parámetros de stitcher.

## Límites conocidos

- Es un **MVP**: no se ha verificado que funcione con todos los títulos, categorías ni regiones. La disponibilidad cambia según el país; el funcionamiento desde Venezuela no está confirmado.
- La API de inicio de sesión detecta la región por la conexión de red. Desde una sesión detectada como EE. UU., Pluto devuelve a veces una lista HLS con un slate de retirada de aproximadamente 25 segundos, incluso para episodios que la web LATAM sí reproduce. La metadata y el HLS no bastan para confirmar la reproducción real.
- El reproductor sigue los segmentos HLS alojados en `plutotv.net`; al actualizar, Kino puede pedir permiso para ese dominio.
- Las categorías y los endpoints usados por el plugin no son una API oficial documentada y pueden cambiar, aplicar límites o dejar de responder.
- Kino no admite canales en vivo dentro del contrato de este plugin. Los streams con DRM tampoco son compatibles.
- El listado de episodios y la reproducción requieren pruebas dentro de Kino; una URL o título en el catálogo no garantiza que el playback funcione.

## Desarrollo y validación local

El repositorio oficial de referencia de Kino incluye un SDK de validación. Con Node.js 18 o posterior y ese SDK disponible en `../kino-plugin-archive-main/`:

```sh
node ../kino-plugin-archive-main/sdk/validate.mjs .
node ../kino-plugin-archive-main/sdk/validate.mjs . --run home
node ../kino-plugin-archive-main/sdk/validate.mjs . --run browse pluto-category:58e1a299dca3c3a22fbd8319 1
```

La validación local comprueba el contrato y los esquemas; para verificar APIs, episodios y reproducción hacen falta pruebas reales en Kino.
