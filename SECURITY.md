# Seguridad / Security

## Versiones con soporte

| Versión | Soporte |
|---|---|
| 1.x | Sí / Yes |

## Informar de una vulnerabilidad

Si encuentras un problema de seguridad, **no abras un issue público**. Usa el formulario de *Report a vulnerability* de la pestaña **Security** del repositorio (GitHub Private Vulnerability Reporting) o el contacto de [miguelacm.es](https://miguelacm.es).

Incluye, si puedes: versión, sistema operativo, pasos para reproducir e impacto. Responderé lo antes posible y coordinaremos la publicación del arreglo.

## Modelo de seguridad

- **Sin red**: la interfaz no puede hacer peticiones HTTP (CSP `connect-src ipc:`) y la aplicación no tiene actualizador ni telemetría. Los enlaces externos solo pueden abrir `miguelacm.es` y `github.com/m-a-c-m`.
- **Permisos mínimos de Tauri**: sin `shell`, sin `http`, sin acceso general al sistema de archivos.
- **Elevación acotada**: los cambios que requieren administrador se hacen en procesos ayudantes efímeros (`--radio`, `--remap`, `--cleanup`) que terminan al acabar. La interfaz corre sin privilegios salvo que el usuario elija lo contrario.
- **El ayudante de radio solo acepta dispositivos de radio**: comprueba que los identificadores de hardware contengan `HID_DEVICE_UP:0001_U:000C` antes de desactivar nada. Probado pasándole el teclado: se niega.
- **El remapeo valida antes de escribir**: máximo 16 sustituciones, códigos de escaneo en rango, y el valor se construye con el formato documentado por Microsoft. Si ya existe un mapa de otro programa, se avisa en lugar de sobrescribirlo en silencio.
- **Validación en los límites**: la configuración se valida en Rust al cargarla y al guardarla (número de reglas, códigos de tecla, modificadores permitidos, longitudes de texto, identificadores restringidos). Un archivo inválido se descarta y se usa la configuración por defecto.
- **Escritura atómica** de la configuración (archivo temporal + rename).
- **El hook nunca inyecta por su cuenta**: solo reinyecta eventos que él mismo retuvo (secuencia de la tecla Copilot), marcados con `dwExtraInfo` propio para no procesarlos dos veces, y libera cualquier tecla que quedara retenida al pausar, desactivar o cerrar.
- **UIPI**: Windows no entrega eventos de hook a procesos con menos privilegios que la ventana activa. KeyBridge no intenta saltarse esa protección; lo dice en la interfaz y ofrece arrancar como administrador si lo quieres.
- **Reversibilidad**: todo cambio de sistema tiene su deshacer, y el desinstalador ejecuta `--cleanup` (se salta durante una actualización).

## Uso responsable

MACM KeyBridge es una herramienta de accesibilidad y reparación: hace utilizable un teclado dañado y anula teclas que molestan. No incluye ni aceptará contribuciones de registro de pulsaciones, envío de lo escrito, ocultación del proceso ni captura encubierta de entrada.

---

**English:** Please report vulnerabilities privately through GitHub's *Report a vulnerability* (Security tab) or via miguelacm.es. The app has no network access, no updater and no telemetry; privileged work happens in short-lived helper processes; the radio helper only accepts devices whose hardware IDs contain `HID_DEVICE_UP:0001_U:000C`; the Scancode Map is validated and never silently overwrites another program's map; configuration is validated in Rust and written atomically; the hook only re-injects events it held back itself and releases stuck keys on pause, stop and exit. Keylogging, exfiltration and covert capture are out of scope and will not be accepted.
