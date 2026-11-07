# Formato de perfiles de Claudia

Los perfiles se guardan en `~/.config/opencode/profiles/` con nombres que empiezan por `claudia-` y terminan en `.json`.

```json
{
  "name": "nombre-del-perfil",
  "description": "Descripción del uso previsto",
  "primary": {
    "model": "provider/model-id",
    "variant": "medium"
  },
  "agents": {
    "claudia-simple": {
      "model": "provider/model-id",
      "variant": "low"
    }
  }
}
```

`variant` es opcional. Si el proveedor no publica variantes para un modelo, el selector solo permite usar la variante predeterminada.

El gestor TUI también lee el formato antiguo donde `primary` o los agentes eran cadenas con el identificador del modelo.
