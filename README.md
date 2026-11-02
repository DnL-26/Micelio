# Micelio

Incremental espacial: un hongo que se expande bajo un bosque que se descompone. Diseño completo en [docs/DESIGN.md](docs/DESIGN.md).

## Comandos

```bash
npm install        # dependencias
npm run dev        # servidor de desarrollo en http://localhost:5173
npm test           # tests de la simulación
npm run balance    # un bot juega 3 ciclos y muestra la evolución de la economía
npm run build      # build de producción en dist/
```

En desarrollo, `?speed=40` en la URL acelera la simulación, y `window.__game` / `window.__fx` dan acceso al juego desde la consola.

## Estructura

```
src/
  sim/        simulación pura, sin DOM (mundo, red, economía, mejoras, prestigio)
  core/       Game (fachada), bucle de paso fijo, guardado y progreso offline
  platform/   almacenamiento del guardado (localStorage ahora, Steam Cloud después)
  render/     dibujo del mapa en canvas
  ui/         panel, barra de herramientas, tooltip, diálogos, entrada
tests/        tests unitarios (vitest)
scripts/      simulaciones de balance
```

Todos los números de balance están en `src/sim/config.ts` y `src/sim/upgrades.ts`.
