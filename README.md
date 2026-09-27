# Pluto TV para Kino

Plugin comunitario para explorar y reproducir **contenido VOD** de Pluto TV en Kino. No incluye canales de TV en vivo.

## Instalación

En Kino, abre **Ajustes → Plugins**, añade el repositorio público `joseang226-coder/kino-pluto-tv` y acepta los dominios solicitados. El repositorio debe ser público para que Kino pueda descargar el manifiesto y el plugin.

## Qué incluye esta versión

- Filas de inicio y navegación paginada por categorías/shelves de VOD que Pluto expone.
- Búsqueda aproximada de películas y series dentro de un conjunto limitado de categorías seleccionadas.
- Listado de episodios de series cuando la API de Pluto devuelve temporadas y episodios en el formato esperado.
- Resolución de reproducción HLS mediante la sesión de Pluto y sus parámetros de stitcher.

## Límites conocidos

- Es un **MVP**: no se ha verificado que funcione con todos los títulos, categorías ni regiones. La disponibilidad cambia según el país; el funcionamiento desde Venezuela no está confirmado.
- Pluto no ofreció un endpoint global de búsqueda verificable durante el desarrollo. La búsqueda revisa solo la primera página de un máximo de 12 shelves seleccionados; puede no encontrar títulos aunque estén disponibles en Pluto.
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
