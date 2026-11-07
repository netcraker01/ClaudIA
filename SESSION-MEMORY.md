# Archivo histórico de implementación de ClaudIA

> Este archivo documenta decisiones históricas del paquete, pero no es memoria operativa. Claudia y sus subagentes no deben consultarlo para reconstruir tareas anteriores ni preferencias. Engram es la única fuente de memoria persistente.

La carpeta `/home/dev/Projects/ClaudIA` es la fuente de verdad portable para scripts, configuración y documentación de instalación. El historial operativo vive exclusivamente en Engram.

## Objetivo

Convertir el agente `claudia` de OpenCode en un orquestador general para tareas pequeñas de Python, n8n, Docker, Linux y navegador web. Claudia debe delegar el trabajo real y recibir resultados compactos para conservar un contexto pequeño.

## Estado

- Agente principal: `claudia`.
- Modelo coordinador previsto: `openai/gpt-6-luna`.
- Agentes de Gentle AI conservados aparte y sin incluir en los perfiles de Claudia.
- Profundidad de subagentes: `1`; los subagentes no pueden lanzar otros subagentes.
- Browser MCP completo para `claudia-browser`: navegación, lectura, búsqueda, formularios, envíos, descargas y demás acciones solicitadas.
- Selector de modelos: `@idrisgit/opencode-subagent-model-selector@0.1.2`.
- Gestor TUI: comando `/claudia-models`.

## Subagentes

- `claudia-simple`: correcciones mecánicas pequeñas y localizadas.
- `claudia-explorer`: exploración acotada sin edición.
- `claudia-code`: Python, n8n, Docker, Compose y scripts.
- `claudia-system`: Linux, servicios, paquetes, logs y configuración.
- `claudia-browser`: operación completa del navegador.
- `claudia-reviewer`: verificación compacta sin edición.

## Gestor de perfiles

El gestor debe permitir crear tantos perfiles como se necesiten, aplicar, editar modelos y variantes, clonar, renombrar y borrar perfiles. Los perfiles son exclusivos de Claudia y viven en `~/.config/opencode/profiles/claudia-*.json`.

Cada asignación puede guardar:

```json
{
  "model": "provider/model-id",
  "variant": "low|default|medium|high"
}
```

El gestor detecta las variantes publicadas por cada proveedor y ofrece solo las disponibles.

## Instalación portable

La carpeta contiene:

- `install-claudia-orchestration.mjs`
- `claudia-model-manager.tsx`
- `README.md`
- `AGENTS.md`
- `profiles/PROFILE-FORMAT.md`

Instalación:

```bash
node ClaudIA/install-claudia-orchestration.mjs
```

Después hay que reiniciar OpenCode. Si el menú antiguo sigue apareciendo, cerrar completamente OpenCode, ejecutar de nuevo el instalador y volver a abrirlo; el archivo instalado se copia a `~/.config/opencode/tui-plugins/claudia-model-manager.tsx`.

## Incidencia conocida

El usuario probó una versión antigua del gestor antes de copiar la versión nueva. La configuración ya contiene la ruta del plugin, pero el archivo instalado tenía una marca de tiempo anterior al archivo actualizado del paquete portable. La solución es volver a ejecutar el instalador y reiniciar OpenCode.

## Flujo del menú

El gestor TUI mantiene abierto el flujo después de cada operación. Al cambiar una asignación vuelve a la selección de agentes; al crear, aplicar, clonar, renombrar o borrar un perfil vuelve al menú de perfiles. La versión portable actual contiene esta corrección.

El TUI también muestra en amarillo `ClaudIA · Perfil: <nombre>` en el pie. Si la configuración no coincide con un perfil guardado, muestra `Personalizado`.

## Comunicación de Claudia

El prompt de Claudia exige comunicación proactiva durante tareas de varios pasos y una respuesta final con estado explícito, objetivo entendido, trabajo realizado, cambios o acciones externas, verificación, pendientes y siguiente paso. No debe afirmar que terminó mientras falten criterios de aceptación o verificaciones.

## Política operativa de Engram

Engram es la única memoria persistente. Antes de autonomía, aclaraciones, planificación o delegación, Claudia debe ejecutar `mem_context` y `mem_search` para recuperar el historial pertinente; usa `mem_get_observation` en los resultados relevantes. Al cerrar guarda `mem_save` con What, Why, Where y Learned y llama `mem_session_summary` si está disponible. Si una lectura obligatoria falla, la tarea se bloquea antes de planificar/ejecutar.

Todos los subagentes reciben la misma obligación mediante permisos `engram_*` y un protocolo común; cada uno consulta Engram independientemente antes de cualquier otra herramienta. No se usan archivos markdown ni otros almacenes como memoria alternativa.

Las credenciales proporcionadas por el usuario se consideran entradas autorizadas de la tarea. Nunca se guardan valores secretos en Engram ni en la memoria portable; solo se puede registrar que se utilizó una credencial y dónde se configuró.

`claudia-system` fue reforzado como operador de terminal e infraestructura local y remota, incluyendo SSH, sshpass, scp, rsync, Docker y Compose. Tiene permiso para consultar `context7_*` y debe usar Context7 cuando no conozca una herramienta o una opción.

## Diagnóstico del flujo SSH y Docker

En una prueba con el perfil activo, `claudia-system` estaba usando `llama-cpp-proxy/qwen3.5-9b-q5-k-m`. Los registros mostraron que el agente sí establecía conexiones SSH, pero después ejecutaba exploraciones y reintentos no relacionados con el encargo de localizar un archivo en un contenedor, descargarlo, esperar la modificación de otro agente y volver a subirlo. La causa probable es la combinación de un modelo pequeño con un procedimiento demasiado abierto; la conexión SSH no era el punto de bloqueo inicial.

El prompt de `claudia-system` incluye ahora un runbook cerrado para este caso: una prueba SSH con timeout, inventario breve de contenedores, búsqueda solo dentro del contenedor, transferencia mediante temporal remoto y `scp`, verificación de existencia/tamaño/checksum, devolución al agente modificador, subida con `scp` y `docker cp`, limpieza y reporte de fase. Se prohíben exploraciones ajenas y se permite como máximo un reintento con hipótesis explícita. Para este tipo de trabajo se recomienda `llama-cpp-proxy/qwen3.8-27b-ud-q4-k-m` o un modelo superior; el perfil `Medium` ya lo asigna a `claudia-system`, por lo que hay que reaplicar el perfil desde `/claudia-models` si la configuración actual conserva Qwen 3.5.

## Menús interactivos

La configuración activa conserva `question: allow` para Claudia y los registros recientes muestran que la herramienta funcionaba hasta las 22:06. En una sesión posterior el modelo activo aparece como `openai/gpt-5.6-luna` y ya no se registran llamadas `asking`; esto apunta a que el modelo está escribiendo preguntas en texto en vez de emitir la llamada nativa, o a que se cambió el modelo mediante perfiles. El prompt se reforzó para exigir la herramienta nativa `question`, prohibir opciones en texto y detenerse si la herramienta no está disponible.

La aprobación de planes requiere ahora dos mensajes separados y ordenados: primero se muestra la tabla completa del plan en un mensaje normal; después se llama a `question` con Aprobar plan, Ajustar plan o Cancelar tarea. No se debe solicitar aprobación antes de mostrar la tabla ni esconder el plan dentro de la pregunta.

## Permisos de sistema

Los permisos de los subagentes se ajustaron para permitir operaciones normales dentro del proyecto y solicitar aprobación con `external_directory: ask` cuando una herramienta acceda fuera del proyecto. `claudia-system` solicita además aprobación para `sudo`, `su`, `doas`, `ssh`, `scp` y `rsync`. El prompt le exige distinguir un bloqueo de OpenCode de un `Permission denied` del sistema y pedir la autorización concreta. La aprobación de OpenCode no sustituye los privilegios Linux ni la autenticación de sudo.

## Key Manager

La skill `key-manager` está instalada en `/home/dev/.config/opencode/skills/key-manager` y habilitada para Claudia y todos los subagentes. Para credenciales reutilizables deben cargarla, consultar `list`, reutilizar una entrada con `get` solo en el consumidor confiable y nunca exponer el valor. Si falta una credencial, deben pedir confirmación para crearla y dirigir al usuario al flujo local `--secret-stdin`; no deben pedir ni aceptar el secreto por el chat ni guardarlo automáticamente.

## Compatibilidad tras actualización de OpenCode

Una actualización activó el cargador TUI v2: `cli.json` pasó a ser la fuente de plugins TUI, mientras `tui.jsonc` conserva el formato v1. Los archivos de Claudia y los perfiles seguían presentes, pero el menú dejó de aparecer porque solo estaba registrado en el formato v1. El instalador ahora registra ambos formatos y copia un entrypoint v2 en `~/.config/opencode/claudia-model-manager/tui.tsx`, compartiendo la implementación existente. Tras instalar hay que reiniciar OpenCode.

El primer entrypoint V2 reexportaba el módulo V1 `{ id, tui }`; OpenCode respondió `Invalid V2 TUI plugin module`. V2 requiere `Plugin.define({ id, setup })` y su API de comandos y diálogos propia. `claudia-model-manager-v2/tui.tsx` ya es una implementación nativa V2 con menú de perfiles, asignación de modelo y variante, aplicación/creación/edición/clonado/renombrado/eliminación, indicador de perfil y comando `/claudia-models`. El instalador copia ese archivo al entrypoint global. Verificar la sintaxis del instalador y recordar reiniciar OpenCode tras volver a ejecutarlo.

## Recuperación ante bloqueos y bucles

Claudia y `claudia-system` deben tratar las acciones externas como intentos acotados. No pueden repetir el mismo comando, host, puerto, credencial o hipótesis. Ante un fallo SSH deben clasificarlo como credencial ausente, credencial incorrecta, usuario, host/puerto, política del servidor o red; consultar `key-manager`, probar como máximo una alternativa con una variable distinta y pedir una decisión no sensible si falta información. Se añadió `doom_loop: ask` para que OpenCode solicite intervención cuando detecte repetición de una acción.

## Autonomía

Al comienzo de cada tarea Claudia debe usar el menú interactivo de preguntas para elegir entre confirmar todo, confirmar solo lo importante o trabajar de forma autónoma hasta completar. La elección se pasa a los subagentes y se informa al final.

## Presentación

Claudia debe presentar comparaciones, cambios y verificaciones con tablas cuando ayuden; usar barras ASCII para métricas reales y Mermaid o ASCII para flujos complejos cuando la TUI lo permita.

El formato preferido de comunicación es una tabla compacta después del estado, con checks `✅`, `⏳`, `⚠️` y `⬜` para Entendí, Hecho, Verificado, Pendiente y Siguiente paso. Los bloqueos deben aparecer directamente en la tabla.

Antes de cada delegación Claudia debe anunciar agente, encargo, alcance y resultado esperado. Después debe resumir la respuesta recibida, comprobarla y continuar el plan o delegar una corrección si falta algo.

Las tareas complejas requieren una puerta de planificación: Claudia muestra una tabla con pasos, agentes, dependencias, verificación, riesgos y condición de finalización, y espera mediante el menú interactivo a `Aprobar plan`, `Ajustar plan` o `Cancelar tarea` antes de ejecutar. Esto se aplica aunque el nivel de autonomía sea completo.

## Perfil Medium

Se añadió `profiles/claudia-medium.json`. Usa `openai/gpt-5.4-mini` para Claudia, exploración y navegador; Qwen 3.5 local para cambios simples; Qwen 3.8 local para código, n8n, Docker y sistema; y Gemma 4 local para revisión. No fija variantes, para que el gestor pueda seleccionar la variante predeterminada o una disponible.
