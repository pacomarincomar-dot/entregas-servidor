# Web Transportes Calderón

Rediseño completo de la web de Transportes Calderón (Écija, Sevilla), como
sitio estático HTML + Tailwind CSS. Sustituye la web antigua (tablas HTML de
~2011, sin diseño responsive).

## Estructura

```
web-transcalderon/
  index.html              Inicio
  servicios.html          Servicios
  vehiculos.html          Flota (furgones / gran volumen)
  centro-logistico.html   Instalaciones y capacidades logísticas
  empresa.html            Quiénes somos + sostenibilidad (ayuda UE)
  clientes.html           Área de clientes (acceso / alta / departamentos)
  contacto.html           Formulario de contacto + datos + mapas
  assets/
    css/input.css         Fuente Tailwind (editar aquí)
    css/styles.css        CSS compilado (generado, no editar a mano)
    js/main.js            Menú móvil, año del footer, formulario de contacto
    img/                  Imágenes (favicon incluido; el resto son "huecos"
                           de foto pendientes de sustituir, ver abajo)
```

## Desarrollo

```bash
npm install
npm run watch   # recompila assets/css/styles.css al guardar cambios
npm run build   # build minificado para producción
```

No hay backend: son HTML estáticos, se pueden alojar en cualquier hosting
(o servir como estáticos desde Express, Nginx, Netlify, etc.).

## Fotos pendientes

El cliente no tenía fotos digitales disponibles en el momento de este
rediseño. En su lugar hay bloques "hueco de foto" (borde discontinuo + icono
de cámara) en: inicio, servicios, vehículos (4 huecos: 2 furgones + 2 gran
volumen), centro logístico (2 mapas ya son iframes reales, no fotos) y
empresa. Cuando lleguen fotos reales, sustituir cada `<div class="photo-slot">`
por un `<img>` con la ruta correspondiente dentro de `assets/img/`.

## Pendiente de confirmar con el cliente

- **Direcciones duplicadas**: la web original mostraba dos direcciones
  distintas — "Ctra. N-IV Km 456" (Centro Logístico) y "Polígono Industrial
  La Campiña, Nave 5B" (contacto/oficinas). Se han mantenido ambas como
  instalaciones separadas en `centro-logistico.html`. Confirmar si es correcto
  o si una de las dos está obsoleta.
- **Portal de clientes real**: la web original tenía login (`pedido.php`) y
  alta (`alta.php`) con backend PHP no disponible. En `clientes.html` esos
  botones enlazan de momento al formulario de contacto. Si se quiere un login
  real con seguimiento de pedidos, requiere desarrollo de backend aparte.
- **Formulario de contacto**: al no haber backend, el formulario usa
  `mailto:` (abre el cliente de correo del visitante). Para una experiencia
  sin salir del navegador, conectarlo a un servicio de envío (SMTP propio,
  Formspree, etc.).
- **Contenido de "Servicios"**: en la web original esta página tenía el
  contenido duplicado de "Centro Logístico" (bug del sitio antiguo). El copy
  de `servicios.html` en esta versión es redactado de nuevo con servicios
  típicos del sector; conviene que el cliente lo revise y ajuste.
