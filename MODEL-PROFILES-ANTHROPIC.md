# Perfiles Anthropic de Claudia

Investigación realizada el 10 de octubre de 2026. Los perfiles usan IDs compatibles con el catálogo Anthropic de OpenCode:

- `anthropic/claude-haiku-5-5`
- `anthropic/claude-sonnet-5-5`

OpenCode resuelve los modelos habilitados desde su catálogo y el proveedor disponible. Los perfiles se distribuyen en `profiles/` y el instalador los copia a `~/.config/opencode/profiles/` si todavía no existe un archivo con ese nombre.

## Selección

| Perfil | Uso previsto | Asignación |
|---|---|---|
| Claude-low | Menor coste por token para todas las funciones. | Haiku 5.5 en Claudia y los seis subagentes. |
| Claude-med | Mejor capacidad en planificación, código y operaciones, reservando Haiku para trabajo sencillo. | Sonnet 5.5 en Claudia, code, system y browser; Haiku 5.5 en simple, explorer y reviewer. |

## Precios publicados por Anthropic

Precio USD por millón de tokens:

| Modelo | Entrada | Salida | Observación |
|---|---:|---:|---|
| Haiku 5.5 | $0.10 | $0.50 | Para prompts de hasta 100k tokens. Si el prompt excede 100k, la tarifa es $0.50/$2.50 por millón. |
| Sonnet 5.5 | $2.00 | $10.00 | Tarifa estándar publicada. |
| Opus 5.5 | $4.00 | $20.00 | Más caro; no se incluye en estos perfiles de bajo/medio consumo. |

Son precios de la API de Anthropic, no una medida universal de “tokens de plan”: el coste real en OpenCode depende de la vía de facturación/proveedor usada. La cantidad de tokens depende de la tarea, el contexto enviado, las respuestas y el razonamiento. Haiku 5.5 tiene una tokenización nueva que cuenta alrededor de 30% más tokens para el mismo texto frente a Haiku 4.5, aunque su tarifa por token es mucho menor. Mantener el prompt por debajo de 100k evita el tramo superior de Haiku 5.5.

No se fuerza una variante en los perfiles: OpenCode muestra variantes según los metadatos disponibles para el modelo y el proveedor. Se pueden ajustar en `/claudia` después de aplicarlos.

## Fuentes

- [Modelos Anthropic: IDs, contexto y comparación](https://platform.claude.com/docs/en/models/overview)
- [Claude Haiku 5.5: precios, límites y tokenización](https://platform.claude.com/docs/en/models/haiku-5-5/overview)
- [Claude Sonnet 5.5: precios y especificaciones](https://platform.claude.com/docs/en/models/sonnet-5-5/overview)
- [OpenCode: catálogo, disponibilidad y variantes](https://opencode.ai/v2/docs/models)
