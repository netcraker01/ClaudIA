# Instrucciones del paquete ClaudIA

## Fuentes canónicas

- `install-claudia-orchestration.mjs` define los agentes, prompts, permisos V2 y la instalación/actualización de skills. Cambia ahí las reglas de runtime; no mantengas copias largas de esos prompts en otros documentos.
- `install-claudia-light.mjs` define el agente único `claudia-light` para modelos locales de contexto corto: sin subagentes, mismo MCP de Engram de cinco herramientas, y no cambia `default_agent` salvo que falte. Sus cambios de prompt y permisos van ahí.
- `repair-claudia-engram.mjs` aplica reparaciones idempotentes a instalaciones existentes. Conserva los cambios fuera de su alcance y crea backup antes de escribir.
- `README.md` explica instalación y uso. `profiles/` contiene perfiles portables; `claudia-model-manager-v2/tui.tsx` es el entrypoint V2. No reintroducir campos V1 como `agent`, `permission`, `tools`, `prompt` o `maxSteps`.
- Mantén los cambios portables bajo `ClaudIA/`. Nunca copies configuración personal, `auth.json`, cookies ni valores secretos.

## Invariantes de Claudia

Claudia es el orquestador primario y mantiene compacto su contexto. Los seis subagentes tienen una especialidad acotada y no lanzan otros agentes. Claudia delega ejecución, anuncia encargo y alcance, evalúa el resultado y continúa los pasos dependientes. Paraleliza solo con autorización, tareas independientes y ámbitos separados; el máximo es tres y un mismo runtime local se usa en serie.

Al comenzar, Claudia y cada hijo consultan Engram con `mem_context` y `mem_search`, y leen observaciones relevantes con `mem_get_observation`. Engram es la única memoria persistente. Una lista de varios proyectos es una ambigüedad, no una caída: elegir mediante pregunta interactiva y repetir la consulta. Ante un reporte de herramienta ausente, probar una vez con el mismo subagente; si falla, inspeccionar y corregir solo una causa concreta y hacer una última sonda. Si vuelve a fallar o no hay causa corregible, marcar BLOQUEADA; no probar otros subagentes ni seguir desde Claudia. No se sustituye Engram por historial, shell o notas locales. Al cerrar, guardar resultados útiles en Engram sin secretos.

Al inicio Claudia pregunta autonomía y paralelismo mediante el menú interactivo, salvo preferencia activa o respuesta en la petición actual. Las tareas sencillas no requieren aprobación de plan. Las complejas muestran el plan completo y luego solicitan aprobación en una llamada separada.

Si el usuario elige o pide autonomía hasta completar, Claudia no termina el turno con un estado EN CURSO ni pide «continúa» cuando hay un paso seguro y autorizado disponible. Tras cada resultado de agente, verificación o hallazgo intermedio, ejecuta el siguiente paso. Solo pausa por un bloqueo real, una aprobación todavía necesaria o un dato que únicamente el usuario pueda aportar; indica exactamente qué falta.

Para credenciales reutilizables, todos cargan `key-manager`; el consumidor consulta metadata y obtiene la credencial en su propio flujo. Entre agentes solo circula la referencia, nunca el secreto resuelto. Credenciales explícitas dadas para la tarea se pueden usar sin advertencias genéricas, sin repetirlas ni guardarlas en Engram. No pedir secretos por chat. Si falta acceso del sistema operativo, devolver la ruta/error y la acción mínima; Claudia pregunta al usuario antes de usar sudo. Los permisos OpenCode no conceden privilegios Linux o remotos.

Toda navegación usa la skill y CLI `terminal-browser`; no usar Browser MCP ni otra automatización. Reutilizar siempre una ventana Terminal Browser ya abierta; inspeccionar con `terminal-browser ls --all --json` y no lanzar otra ventana, `terminal-browser open` ni panel TUI. Si no hay ninguna ventana abierta, pedir al usuario que la abra. Mantener como máximo cinco pestañas abiertas en total: reutilizar una existente primero; nunca abrir una sexta ni cerrar una pestaña que pueda estar usando el usuario. Si el hijo no puede acceder a la ventana compartida, devolver el control a Claudia.

## Roles

- `claudia-simple`: arreglo mecánico de un archivo; fuera de alcance, devolver el agente recomendado.
- `claudia-explorer`: descubrimiento acotado, solo lectura.
- `claudia-code`: Python, n8n, Docker, Compose y scripts.
- `claudia-system`: Linux, SSH/SCP, servicios y operaciones de contenedores.
- `claudia-browser`: navegación, formularios y transferencias web.
- `claudia-reviewer`: comprobación independiente, sin editar.

Cada asignación incluye objetivo, alcance, rutas/recurso, restricciones, criterio de término y verificación. La respuesta final de Claudia usa estado claro y una tabla compacta con hecho, verificado, pendiente y siguiente paso.

## Cambios y verificación

Al cambiar configuración, compara las instrucciones entre prompt primario, protocolo común y rol específico para quitar contradicciones y repeticiones. Mantén permisos MCP/skill explícitos; conserva `external_directory` como solicitud para que el usuario pueda autorizarlo. No conviertas errores reales de Engram o Key Manager en falsas respuestas de éxito. Verifica JSON/JavaScript/TypeScript con comprobaciones estáticas focalizadas y documenta qué debe reiniciarse para aplicar cambios globales.
