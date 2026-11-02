# Micelio — Documento de diseño

> Título provisional. Incremental espacial sobre un hongo que se expande bajo un bosque que se descompone.

## Pitch

Eres un micelio bajo el suelo de un bosque. Extiendes hifas casilla a casilla para alcanzar la hojarasca y la madera muerta, las digieres y envías los nutrientes de vuelta a tu núcleo. Pero cada nutriente que ordenas genera **entropía**, y la entropía encarece mantener la red. Tarde o temprano tu micelio ya no puede sostenerse: entonces **esporulas**, y una nueva generación empieza en otro bosque, más fuerte que la anterior.

## Pilares

1. **La forma de la red importa.** Crecer no es solo comprar más: es decidir *por dónde*. Las redes largas pierden nutrientes por el camino.
2. **Mantener cuesta.** El crecimiento choca con el mantenimiento y la entropía. El jugador busca equilibrio, no solo acumular.
3. **El mundo está vivo.** La hojarasca se agota y vuelve a caer en otros lugares; hay que perseguirla.
4. **Cada reinicio cambia las reglas.** Las capas de prestigio añaden mecánicas, no solo multiplicadores.

## Bucle principal (capa 1)

```
crecer hifas → alcanzar materia orgánica → absorber materia
     ↑                                              ↓
comprar mejoras ← nutrientes llegan al núcleo ← transporte con pérdida
                                                    ↓
                            entropía sube → mantenimiento sube → presión para esporular
```

## Sistemas

### Mundo
- Cuadrícula de 31×31 casillas, generada con semilla (determinista, reproducible).
- Tipos de casilla: **Suelo**, **Hojarasca** (materia que se agota rápido), **Madera muerta** (mucha materia, requiere mejora), **Roca** (infranqueable).
- **Caída de hojas:** cada pocos segundos cae hojarasca en una casilla aleatoria. Cada cierto tiempo cae un tronco.

### Red
- El **núcleo** está en el centro y digiere un poco de materia por sí solo.
- Las hifas solo crecen en casillas adyacentes (4 direcciones) a la red.
- Cada casilla recorrida pierde un % de los nutrientes. La eficiencia de una hifa es el producto de `(1 − pérdida)` a lo largo del **mejor camino** hasta el núcleo (Dijkstra).
- **Cordones:** una hifa convertida en cordón pierde un 75% menos, pero cuesta 1,5× mantenerla. Sirven como "autopistas".

### Economía
- Cada hifa absorbe la materia de su casilla: **humus** del suelo (infinito pero pobre), **hojarasca** (rica, se agota) o **madera** (enorme, lenta).
- `nutrientes/s = Σ materia_absorbida × rendimiento × eficiencia_efectiva`
- `mantenimiento/s = hifas × coste_base × rendimiento`: escala con el juego, así que la relación coste/beneficio de cada hifa nunca queda obsoleta.
- Consecuencia: una hifa sobre humus solo es rentable cerca del núcleo. Existe un **radio óptimo de red**, y la hojarasca lejana justifica rutas largas o cordones.
- Si los nutrientes llegan a 0, el micelio **pasa hambre**: muere la hifa menos eficiente cada segundo (siempre una punta, nunca se parte la red).

### Entropía
- `entropía = (nutrientes_totales_del_ciclo / 1000)^0.6`
- `eficiencia_efectiva = eficiencia^(1 + 0.05 × entropía)`: el desorden castiga las rutas largas y encoge el radio óptimo.
- Es consecuencia de producir, no del tiempo: el progreso offline no castiga más que el online.
- Es el muro suave que empuja al prestigio. La quitina, los cordones y los esclerocios lo combaten.

### Prestigio 1: Esporulación
- `esporas = ⌊√(nutrientes_totales_del_ciclo / 2000)⌋`
- Reinicia el ciclo en un **bosque nuevo** (nueva semilla).
- Cada espora sin gastar da +10% de rendimiento. Las esporas también se gastan en mejoras permanentes, así que **gastar o guardar** es una decisión.

Todos los números de balance están en `src/sim/config.ts` y `src/sim/upgrades.ts`.

## Capas futuras (hoja de ruta)

| Capa | Nombre | Qué añade |
|---|---|---|
| 1 | Esporulación | Reinicio de bosque, esporas y mejoras permanentes *(hecha en v0.1)* |
| 2 | Biomas | Al esporular eliges a dónde viajan las esporas: desierto (agua escasa), cueva (sin hojas, hay guano), cadáver de ballena (un único recurso gigante) |
| 3 | Simbiosis | Raíces de árboles: si las conectas, intercambias nutrientes por azúcares. Los árboles alimentados tiran más hojas. Economía cooperativa |
| 4 | Colapso térmico | El bosque entero muere. Reinicio profundo: eliges las *constantes* del nuevo mundo (pérdida, ritmo de caída, exponente de entropía) |
| — | Competencia | Otros hongos rivales crecen en el mapa y disputan la materia |

## Objetivo Steam

- **Tecnología:** TypeScript + Vite (web). Para Steam se empaqueta con **Electron + steamworks.js** (logros, guardado en la nube y overlay).
- Por eso el código separa la **simulación** (`src/sim`, sin DOM y testeable) de la **plataforma** (`src/platform`): el almacenamiento del guardado es una interfaz que luego se implementa con archivos y Steam Cloud.
- `vite.config.ts` usa `base: "./"` para que el build funcione bajo `file://` en Electron.
- Requisitos que tendremos que cubrir: logros, guardado en la nube, progreso offline, ajustes (volumen, notación numérica), localización (inglés como mínimo), pantalla de créditos y página de tienda con capturas y tráiler.

## Hitos

- **v0.1, prototipo jugable:** capa 1 completa, guardado, progreso offline y exportar/importar. ← *estamos aquí*
- **v0.2, sensaciones:** sonido, partículas de flujo de nutrientes, tutorial ligero, balance de los primeros 30 minutos.
- **v0.3, capa 2 (biomas):** 3 biomas con reglas propias.
- **v0.4, Electron + Steamworks:** build de escritorio, logros y nube.
- **v0.5, contenido:** capas 3 y 4, localización EN y demo para Steam Next Fest.
