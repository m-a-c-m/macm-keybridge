# Privacidad / Privacy

**MACM KeyBridge funciona entero en tu equipo. No envía nada a ningún sitio.**

## Qué NO hace

- No se conecta a internet. No tiene analítica, informes de errores, identificadores, cuentas ni actualizador automático.
- La interfaz **no puede** hacer peticiones de red: su CSP solo permite `ipc:` (ver `src-tauri/tauri.conf.json`).
- No guarda lo que escribes. No existe ningún registro de pulsaciones en disco.

## Qué hace con tus pulsaciones

KeyBridge instala un *hook* de teclado de bajo nivel porque esa es la única forma de que Windows no reciba la tecla que tienes pisada. Con esas pulsaciones:

- **Cuenta** cuántas ha anulado (un número, nada más).
- Mantiene en memoria un **búfer circular pequeño** con los últimos eventos (código de tecla y si fue anulada) para dibujar el teclado de «Probar teclado», detectar la tecla que eliges y hacer la prueba guiada. Se descarta al salir de esa pantalla y nunca se escribe en disco.
- El **informe de diagnóstico** que tú pides se guarda como texto en tu Escritorio e incluye las teclas que pulsaste durante la prueba guiada. Es un archivo tuyo: ábrelo, léelo y bórralo cuando quieras.

Mientras no estés en «Probar teclado», en la captura de tecla o en la prueba guiada, la interfaz ni siquiera pide esos eventos al motor.

## Qué guarda en tu equipo

- `%APPDATA%\es.miguelacm.keybridge\config.json` — tus ajustes, en JSON legible. Bórralo y vuelve a empezar.
- Nada más. Sin registros, sin caché, sin telemetría.

## Qué cambia en Windows (y cómo se deshace)

| Cambio | Dónde | Lo deshace |
|---|---|---|
| Teclas cambiadas | `HKLM\SYSTEM\CurrentControlSet\Control\Keyboard Layout\Scancode Map` | El botón «Quitar», «Deshacer todos los cambios» o el desinstalador (requiere reiniciar) |
| Tecla de modo avión anulada | El dispositivo HID «Controles de radio inalámbrica» se desactiva, como en el Administrador de dispositivos | «Restaurar», «Deshacer todos los cambios» o el desinstalador |
| Inicio con Windows | `HKCU\...\Run` o una tarea programada | El selector de Ajustes, «Deshacer todos los cambios» o el desinstalador |

Nada de esto ocurre sin que lo pulses tú, y los cambios que requieren administrador avisan antes de que Windows pida permiso.

## Cómo comprobarlo tú mismo

- El código está aquí: `src-tauri/src/hook.rs` (hook), `engine.rs` (motor), `radio.rs` (modo avión), `remap.rs` (teclas cambiadas), `checks.rs` (diagnóstico).
- Observa el proceso con el Monitor de recursos o con Wireshark: no abre ninguna conexión.
- Las dependencias están en `package.json` y `src-tauri/Cargo.toml`; no hay ninguna de red.

---

**English summary.** MACM KeyBridge runs entirely on your machine and sends nothing anywhere: no analytics, no crash reports, no accounts, no updater, and a CSP that forbids network requests from the UI. The low-level keyboard hook exists to *block* keys: presses are counted, kept briefly in an in-memory ring buffer for the tester, the key-capture dialog and the guided test, and never written to disk. The only file it stores is `config.json` in `%APPDATA%\es.miguelacm.keybridge\`. The diagnostic report is plain text saved to your own Desktop, only when you ask for it. Every system change (Scancode Map, airplane-mode HID collection, autostart) is listed above with the exact way to undo it; uninstalling undoes them all.
