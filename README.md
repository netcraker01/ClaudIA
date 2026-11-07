# ClaudIA para OpenCode

Configuración portable de Claudia como orquestador general para OpenCode.

Esta carpeta es la fuente portable de Claudia. Las futuras modificaciones de prompts, agentes, gestor TUI, perfiles, instalador y decisiones de arquitectura deben conservarse aquí.

Claudia recibe la petición, divide el trabajo y delega la ejecución a subagentes especializados. Los subagentes devuelven resultados compactos para evitar llenar el contexto de Claudia.

Claudia usa la configuración V2 de agentes de OpenCode (`agents` y `permissions`). Los seis subagentes reciben `* allow` para herramientas, ejecución, MCP, rutas externas, edición y acciones de sistema. Sus descripciones y prompts limitan su función, pero OpenCode no les bloquea capacidades.

## Instalación en otro equipo

Requisitos:

- OpenCode instalado.
- Engram CLI instalado y accesible en `~/.local/bin/engram` (la instalación expone cinco herramientas MCP explícitas para Claudia y sus subagentes; si falta, el instalador se detiene).
- `gpg` instalado para que Key Manager pueda cifrar credenciales. La skill y su utilidad se incluyen en el paquete; el almacén de credenciales y su clave local no.
- Un proveedor configurado para cada modelo que quieras utilizar.
- `opencode` funcionando desde la cuenta del usuario que ejecutará la instalación.

Copia esta carpeta al otro equipo y ejecuta:

```bash
node ClaudIA/install-claudia-orchestration.mjs
```

Si Claudia ya está instalada y los subagentes no ven Engram o la skill Key Manager, ejecuta la reparación acotada y reinicia OpenCode por completo:

```bash
node ClaudIA/repair-claudia-engram.mjs
```

El reparador conserva el resto de la configuración y crea una copia de seguridad fechada. Fija las cinco herramientas MCP de Engram y el permiso explícito para cargar `key-manager` en los siete agentes; instala o actualiza la skill portable con copia previa de sus archivos existentes. También aclara que los nombres cortos que usa el plugin de Engram (`mem_context`, `mem_search`) corresponden a los nombres MCP visibles en OpenCode (`engram_mem_context`, `engram_mem_search`); la ausencia del alias corto no es una caída del servidor. Engram usa `codemode: false`, así que una herramienta ausente del catálogo Code Mode no demuestra que falte del catálogo MCP directo: el hijo debe invocar directamente `engram_mem_context` y `engram_mem_search`. Añade reglas para resolver proyectos ambiguos, obtener credenciales dentro del agente consumidor y pedir autorización ante rutas o privilegios del sistema. Si falla la sonda directa del subagente, Claudia no encadena otros agentes ni continúa por su cuenta: aplica una corrección concreta si la encuentra y hace una última prueba con el mismo hijo; si vuelve a fallar, informa el bloqueo real. Después del reinicio, inicia una sesión nueva de Claudia.

Para instalar solo la autenticación Anthropic en la configuración OpenCode v2:

```bash
node ClaudIA/install-anthropic-auth.mjs
```

Este plugin se registra como `@ex-machina/opencode-anthropic-auth@next`, que es la línea v2 indicada por sus autores. El instalador crea una copia de seguridad del `opencode.json` antes de guardar y normaliza el JSON, por lo que también corrige claves `plugins` duplicadas. Tras reiniciar OpenCode, usa `/connect` y selecciona `Anthropic` → `Claude Pro/Max` para vincular la suscripción mediante OAuth. Para una API key Anthropic puedes usar la integración nativa de OpenCode.

El instalador modifica la configuración global de OpenCode en:

```text
~/.config/opencode/opencode.json
~/.config/opencode/tui.jsonc
~/.config/opencode/tui-plugins/claudia-model-manager.tsx
```

También registra el gestor en `~/.config/opencode/cli.json` y crea `~/.config/opencode/claudia-model-manager/tui.tsx` para OpenCode TUI v2. El entrypoint V2 usa `Plugin.define` y la API nativa de diálogos y comandos; no reexporta la implementación V1. Ambos cargadores exponen un único comando: `/claudia`.

También instala `terminal-browser` y prepara Key Manager en `~/.config/opencode/skills/`. Claudia y `claudia-browser` reutilizan siempre una ventana Terminal Browser ya abierta; no abren otra ventana ni panel. El límite es de cinco pestañas en total, operadas con IDs explícitos. Si no hay ventana abierta, piden al usuario que la inicie. La guía está en [skills/terminal-browser/SKILL.md](skills/terminal-browser/SKILL.md); Key Manager y su utilidad portable están en [skills/key-manager](skills/key-manager). El instalador conserva una skill Key Manager ya existente y copia la del paquete si falta. Cada equipo debe inicializar su propio almacén; nunca se copia `~/.local/share/key-manager` ni `.local-key`.

Antes de escribir crea una copia de seguridad fechada de `opencode.json`.

Engram es la única memoria persistente de Claudia y sus subagentes. El instalador configura el MCP con un catálogo directo y acotado a cinco herramientas (`mem_context`, `mem_search`, `mem_get_observation`, `mem_save`, `mem_session_summary`) y concede permisos explícitos a cada herramienta en los siete agentes. Los agentes llaman `engram_mem_context`, `engram_mem_search` y `engram_mem_get_observation`, nunca como comandos Bash. Si Engram devuelve varios proyectos posibles, Claudia pide elegir uno mediante el menú interactivo y repite la consulta; esto es una ambigüedad de contexto, no una caída del MCP. Solo los errores reales de conexión/herramienta requieren reparación. Los permisos de OpenCode no suprimen las restricciones que Linux, sudo o el host remoto apliquen por su cuenta. Los archivos históricos incluidos en esta carpeta son documentación del paquete y no se usan para recordar tareas anteriores.

Después de instalar, reinicia OpenCode y ejecuta en el TUI:

```text
/claudia
```

Para operaciones SSH y Docker con varios pasos, asigna `llama-cpp-proxy/qwen3.8-27b-ud-q4-k-m` o un modelo superior a `claudia-system` desde `/claudia`. El perfil `Medium` incluido ya usa Qwen 3.8 para ese agente. Qwen 3.5 9B puede servir para tareas simples, pero necesita un flujo muy cerrado en transferencias remotas.

Se incluyen los perfiles `Claude-low` (Haiku 5.5 para todos) y `Claude-med` (Sonnet 5.5 para Claudia, code, system y browser; Haiku 5.5 para simple, explorer y reviewer). La investigación de precios y la justificación están en [MODEL-PROFILES-ANTHROPIC.md](MODEL-PROFILES-ANTHROPIC.md). El instalador copia los perfiles incluidos que aún no existan.

También se incluyen `GPT-low`, `GPT-med`, `mix-low`, `mix-med` y `Local-Llama`. La asignación de OpenAI/local, el criterio de cada rol, los precios API consultados y las fuentes están en [MODEL-PROFILES-OPENAI-LOCAL.md](MODEL-PROFILES-OPENAI-LOCAL.md). `Local-Llama` usa los IDs actuales bajo `openai-compatible`.

## Claudia Light

`install-claudia-light.mjs` instala `claudia-light`, una variante del agente para equipos con runtime local que solo tiene un modelo cargado a la vez, donde los subagentes no aportan: es un agente único en modo `primary` que prohíbe delegar (permiso `subagent: deny` total) y ejecuta cada tarea donde se le pide.

Espera el mismo comportamiento, las mismas órdenes y harnesses que Claudia, adaptados a modelos con contexto corto:

- **Bucle de memoria de trabajo con Engram**: al empezar busca contexto (`engram_mem_search` acotado, `limit 5`; `engram_mem_context` solo si la búsqueda no devuelve nada); guarda un plan numerado corto con `topic_key` `plan/<slug>` para que sobreviva a la compactación; tras cada paso guarda un checkpoint de máximo 4 líneas (paso hecho, evidencia, siguiente paso) reutilizando el mismo `topic_key`.
- **Presupuesto de contexto**: localizar antes de leer (grep/glob), lectura de ~50 líneas máximo por llamada, salida de comandos limitada, extraer 1-5 líneas relevantes en lugar de volcar ficheros o contenido web al contexto, y checkpoint proactivo inmediato tras cualquier lectura grande (marca «resume at» para reanudar en la acción exacta).
- **Frecuencia de parada controlada**: el bucle es mecánico y se sigue hasta el final: paso → verificar → checkpoint → siguiente paso, sin detenerse silenciosamente entre pasos; solo termina con informe final o bloqueo real, y con autonomía concedida no pregunta «continúo».
- **Recuperación sin fricción**: si se compacta o pierde contexto, no pide repetir nada; recarga desde Engram el plan y el último checkpoint y continúa en el primer paso pendiente. Antes de terminar hace `engram_mem_session_summary` obligatorio.
- **Seguridad igual que Claudia**: pide autorización por menú interactivo antes de cualquier sudo o acción de sistema denegada por el SO, usa key-manager para credenciales reutilizables sin exponer secretos, y reutiliza ventanas Terminal Browser con máximo cinco pestañas.

El instalador configura el mismo MCP de Engram de cinco herramientas con `codemode: false`, crea copia de seguridad fechada de `opencode.json` y **no cambia** `default_agent` salvo que no exista ninguno: está pensado para convivir con una Claudia completa o para la máquina local limpia. El modelo del agente se conserva si ya estaba asignado; si no, OpenCode usa el modelo del proveedor configurado.

Desde la carpeta que contiene el paquete (por ejemplo `~/Projects/ClaudIA/`) ejecuta:

```bash
node install-claudia-light.mjs
```

Si lo llamas desde el directorio padre, la ruta equivalente es `node ClaudIA/install-claudia-light.mjs`.

Y en el TUI, con `/models` o el selector de agente, elige la sesión `claudia-light`.

## Agentes

| Agente | Utilidad | Modelo inicial |
|---|---|---|
| `claudia` | Orquesta y delega ejecución; usa herramientas propias para memoria, coordinación, recuperación y cambios mecánicos pequeños. | `openai/gpt-6-luna` |
| `claudia-simple` | Correcciones mecánicas pequeñas en un único archivo. | `llama-cpp-proxy/qwen3.5-9b-q5-k-m` |
| `claudia-explorer` | Exploración acotada, localización de archivos y entrega de contexto resumido. No edita. | `llama-cpp-proxy/qwen3.5-9b-q5-k-m` |
| `claudia-code` | Python, n8n, Docker, Compose y scripts. | `llama-cpp-proxy/qwen3.8-27b-ud-q4-k-m` |
| `claudia-system` | Linux, paquetes, servicios, logs, configuración y operaciones del sistema. | `llama-cpp-proxy/qwen3.8-27b-ud-q4-k-m` |
| `claudia-browser` | Navegación web completa mediante terminal-browser: búsquedas, formularios, descargas y cargas. | `llama-cpp-proxy/gemma-4-26b-a4b-it-qat-ud-q4-k-xl` |
| `claudia-reviewer` | Verificación compacta de cambios y resultados. No edita. | `llama-cpp-proxy/gemma-4-12b-it-qat-ud-q4-k-xl` |

Los prompts compactos indican a los subagentes que no creen subdelegaciones. Sus herramientas se permiten con `* allow`; las rutas externas se someten a una pregunta de autorización para que un permiso de archivos no se convierta en un bloqueo opaco.

Al inicio Claudia pregunta el nivel de autonomía y, en la misma interacción, si puede ejecutar en paralelo tareas independientes. Solo paraleliza con autorización, con ámbitos de escritura separados y hasta tres agentes simultáneos. Dependencias, recursos compartidos y llamadas al mismo runtime local se procesan secuencialmente.

Cuando el usuario elige autonomía hasta completar, Claudia continúa después de cada hallazgo, verificación o respuesta de subagente mientras quede un paso seguro y autorizado. No cierra el turno con `EN CURSO` ni pide «continúa» si puede ejecutar el siguiente paso. Solo pausa por un bloqueo real, una aprobación pendiente o información que solo el usuario pueda aportar. Para aplicar cambios de estos prompts en una instalación existente, vuelve a ejecutar el instalador y reinicia OpenCode por completo.

## Progreso visible (todowrite)

El instalador activa `experimental.todo: true`, la herramienta `todowrite` de OpenCode, que el TUI muestra como lista de tareas en tiempo real. El orquestador está obligado (regla `VISIBLE_PROGRESS_MANDATORY_V1`, inyectada por el instalador y por `repair-claudia-engram.mjs`) a crear la lista completa al recibir una tarea de varios pasos: un ítem por paso del plan, un ítem por delegación a cada subagente y un ítem de verificación final. Mantiene exactamente un ítem `in_progress`, marca `completed` solo con evidencia de verificación y actualiza la lista tras cada resultado de subagente. Los subagentes no llaman `todowrite` (tienen sesiones separadas): su handoff declara qué ítem queda hecho, bloqueado o pendiente, y Claudia actualiza la lista. En `claudia-light` se aplica el mismo protocolo con un párrafo compacto.

## Gestor de modelos y perfiles

Abre `/claudia` para:

- Asignar un modelo a Claudia o a cualquier subagente.
- Elegir la variante disponible del modelo (`low`, `default`, `medium`, `high`, etc.).
- Crear perfiles desde la configuración actual.
- Aplicar perfiles.
- Editar modelos y variantes dentro de un perfil.
- Clonar perfiles.
- Renombrar perfiles.
- Borrar perfiles.

Los menús muestran el modelo y variante actuales junto a cada agente y el contenido de cada perfil. Tras cambiar una asignación, el selector vuelve a la lista de agentes; al editar un perfil, permanece en su editor para cambiar varios modelos seguidos.

El guardado actualiza el archivo global con copia de seguridad. OpenCode vigila los archivos de configuración y recarga sus cambios; el gestor no llama a la API de parche de configuración, que en algunas versiones falla al validar el campo `shell`.

La barra lateral presenta el perfil activo como indicador destacado y agrupa cada subagente con su modelo y variante actuales. Cuando una sesión hija está trabajando, el agente aparece en azul con un escáner rojo de ida y vuelta; si hay varias tareas simultáneas, muestra el total y señala cada agente activo. Se actualiza al aplicar o editar perfiles, cuando OpenCode cambia la configuración y con los eventos de sesión. El pie de la interfaz también muestra en amarillo el perfil activo, por ejemplo `ClaudIA · Perfil: Medium`; si las asignaciones actuales no coinciden con ningún perfil guardado, muestra `Personalizado`.

Los perfiles son ilimitados y se almacenan en:

```text
~/.config/opencode/profiles/claudia-*.json
```

Cada perfil puede contener un modelo y una variante para Claudia y para cada subagente. Ejemplo:

```json
{
  "name": "local-coding",
  "description": "Perfil local para desarrollo",
  "primary": {
    "model": "ollama-local/gemma4-coder:latest",
    "variant": "default"
  },
  "agents": {
    "claudia-simple": {
      "model": "llama-cpp-proxy/qwen3.5-9b-q5-k-m",
      "variant": "low"
    },
    "claudia-code": {
      "model": "llama-cpp-proxy/qwen3.8-27b-ud-q4-k-m",
      "variant": "medium"
    }
  }
}
```

## Modelos

Los identificadores incluidos son los disponibles en el equipo original. En otro ordenador puedes cambiarlos desde `/claudia` según los proveedores configurados allí.

Los perfiles escriben el modelo directamente en cada definición de agente, sin un plugin de enrutamiento. Las variantes se serializan en el formato de OpenCode `provider/model#variant`; el fichero del perfil conserva `model` y `variant` por separado para que sea legible. El instalador elimina la entrada incompatible de `opencode-subagent-model-selector` de la configuración del servidor y de los plugins TUI. `gentle-orchestrator` y sus agentes no se modifican.

## Archivos

- `install-claudia-orchestration.mjs`: instala o actualiza Claudia, sus subagentes y plugins.
- `install-claudia-light.mjs`: instala un agente único `claudia-light` para modelos locales de contexto corto, sin subagentes, con la misma disciplina de Engram.
- `repair-claudia-engram.mjs`: corrige permisos y protocolos de Engram/Key Manager de una instalación existente.
- `claudia-model-manager.tsx`: gestor TUI de asignaciones, perfiles y variantes.
- `AGENTS.md`: invariantes de desarrollo y fuentes canónicas del paquete.
- `skills/key-manager`: skill y utilidad portable; no contiene credenciales del equipo.
- `profiles/PROFILE-FORMAT.md`: formato portable de perfiles.

## Seguridad operativa

El instalador no copia `auth.json`, claves API, cookies, memoria Engram ni la configuración completa del equipo original. Cada ordenador debe configurar sus propios proveedores y credenciales.

## Licencia

Repositorio privado y propietario. Sin licencia pública; el uso está limitado a quien tenga acceso al repositorio.
