# Perfiles OpenAI, mixtos y locales de Claudia

Investigación y configuración del 10 de octubre de 2026. Los IDs locales se cotejaron con `/v1/models` del servidor llama.cpp y con el proveedor `llama-cpp` (`http://192.168.1.235:8084/v1`) que registra `install-claudia-all.mjs`. Antes de esta actualización, la documentación usaba `openai-compatible`, que ya no se configura. Los perfiles quedan en `profiles/`; el instalador los copia a `~/.config/opencode/profiles/` cuando no existe ya el archivo de destino.

## Perfiles y asignación

| Perfil | Claudia | Tareas ligeras | Código, sistema y web |
|---|---|---|---|
| GPT-low | GPT-6 Luna low | GPT-6 Luna low | GPT-6 Luna low |
| GPT-med | GPT-6.1 Sol medium | GPT-6 Luna low | GPT-6.1 Sol medium |
| mix-low | GPT-6 Luna low | Luna low o Haiku 5.5 | Haiku 5.5 |
| mix-med | GPT-6.1 Sol medium | Luna low o Haiku 5.5 | Sonnet 5.5 para código/sistema; Haiku 5.5 para browser |
| Local-Llama | Qwen 3.8 27B | Qwen 3.5 9B | Qwen 3.8 27B para code/system; Gemma 4 26B para browser; Qwen 3 30B A3B para reviewer |

`Local-Llama` solo referencia modelos bajo el proveedor local `llama-cpp`, que el instalador registra con los modelos que devuelve el servidor. La asignación usa Qwen 3.5 9B para exploración y cambios simples, el Qwen 3.8 27B para coordinación y operaciones con más pasos, Gemma 4 26B para el agente browser y Qwen 3 30B A3B para revisión. La agilidad y el uso de herramientas dependen también de cómo esté servido cada modelo en llama.cpp y de las capacidades anunciadas en el catálogo local.

## Precios de API publicados

USD por millón de tokens de texto, tarifa Standard sin descuentos, consultada el 10 de octubre de 2026:

| Modelo | Entrada | Entrada cacheada | Salida | Función |
|---|---:|---:|---:|---|
| GPT-6 Luna | $0.10 | $0.01 | $0.50 | Opción OpenAI económica para volumen y tareas enfocadas. |
| GPT-6.1 Sol | $2.00 | $0.10 | $10.00 | Nivel intermedio para trabajo más complejo. |
| Claude Haiku 5.5 | desde $0.10 | desde $0.01 | desde $0.50 | Tareas rápidas y subagentes; sobre 100k de prompt sube a $0.50/$2.50. |
| Claude Sonnet 5.5 | $2.00 | $0.10 | $10.00 | Implementación y tareas especializadas de nivel medio. |

El modo de razonamiento influye en el uso final de tokens. OpenAI publica para Luna los niveles `none`, `low`, `medium`, `high`, `xhigh` y `max`; Sol ofrece `low`, `medium`, `high`, `xhigh` y `max`. Los perfiles GPT fijan `low`/`medium` para orientar el coste; el catálogo de OpenCode debe exponer la variante correspondiente para el proveedor conectado.

Estas tarifas son del API de OpenAI y Anthropic, no equivalen necesariamente al consumo de una suscripción o de un gateway como OpenCode Zen. La facturación y precios pueden variar según proveedor, modalidad, caché y tamaño de prompt. Las llamadas locales no generan cargos por token del API, pero consumen recursos del equipo y el servidor llama.cpp.

## Fuentes

- [OpenAI API: catálogo de modelos](https://developers.openai.com/api/docs/models)
- [GPT-6 Luna: tarifas y niveles de razonamiento](https://developers.openai.com/api/docs/models/gpt-6-luna)
- [OpenAI API: precios](https://platform.openai.com/pricing)
- [Anthropic: catálogo, Haiku y Sonnet](https://platform.claude.com/docs/en/models/overview)
- [Anthropic: precios de Haiku 5.5](https://platform.claude.com/docs/en/models/haiku-5-5/overview)
- [Anthropic: precios de Sonnet 5.5](https://platform.claude.com/docs/en/models/sonnet-5-5/overview)
- [OpenCode: catálogo y variantes disponibles por proveedor](https://opencode.ai/v2/docs/models)
