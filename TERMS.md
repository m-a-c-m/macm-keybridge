# Terms of use · Términos de uso

MACM KeyBridge — Copyright (c) 2026 Miguel Ángel Colorado Marin ([miguelacm.es](https://miguelacm.es)).
Free software under the [MIT License](LICENSE).

## English

By installing or using MACM KeyBridge you accept the following.

1. **Licence.** MACM KeyBridge is free software under the MIT License. You may use, study, modify and share it, keeping the copyright notice.
2. **No warranty.** The program is provided "as is", without warranty of any kind, to the extent permitted by law.
3. **It does not repair hardware.** If a key only responds while another key is held, the fault is in the keyboard itself. KeyBridge makes the keyboard usable; it cannot close a broken circuit or press a key for you.
4. **System changes are yours to approve.** Swapping keys writes the Windows Scancode Map, blocking the airplane-mode key disables one HID device, and autostart adds a registry entry or a scheduled task. Each one is listed in the app, happens only when you ask for it, and can be undone from the app or by uninstalling.
5. **Swapped keys affect the whole computer.** The Scancode Map applies to every user, every keyboard connected to the machine and the sign-in screen, and needs a restart both to apply and to undo. Do not sacrifice a key you may need to type your password.
6. **Windows behaviour.** Windows does not deliver keyboard-hook events to a process with fewer privileges than the window in front (UIPI). Silenced keys therefore come back while an elevated window is focused unless you run KeyBridge as administrator.
7. **Privacy.** Everything runs locally and the program sends no data anywhere. See [PRIVACY.md](PRIVACY.md).
8. **Data.** Your settings live in `%APPDATA%\es.miguelacm.keybridge\`. You can delete them at any time.

## Español

Al instalar o usar MACM KeyBridge aceptas lo siguiente.

1. **Licencia.** MACM KeyBridge es software libre bajo la licencia MIT. Puedes usarlo, estudiarlo, modificarlo y compartirlo, manteniendo el aviso de copyright.
2. **Sin garantías.** El programa se ofrece «tal cual», sin garantía de ningún tipo en la medida que permita la ley.
3. **No repara el hardware.** Si una tecla solo responde mientras mantienes otra pulsada, el fallo está en el propio teclado. KeyBridge lo hace utilizable; no puede cerrar un circuito roto ni pulsar la tecla por ti.
4. **Los cambios en el sistema los apruebas tú.** Cambiar teclas escribe el Scancode Map de Windows, anular la tecla de modo avión desactiva un dispositivo HID, y el inicio automático añade una entrada del registro o una tarea programada. Cada uno aparece listado en la aplicación, ocurre solo si lo pides y se deshace desde la propia aplicación o al desinstalar.
5. **Las teclas cambiadas afectan a todo el equipo.** El Scancode Map se aplica a todos los usuarios, a cualquier teclado conectado y a la pantalla de inicio de sesión, y necesita reiniciar tanto para aplicarse como para deshacerse. No sacrifiques una tecla que puedas necesitar para escribir tu contraseña.
6. **Comportamiento de Windows.** Windows no entrega los eventos del hook de teclado a un proceso con menos privilegios que la ventana que está delante (UIPI). Por eso las teclas anuladas vuelven a funcionar mientras tengas delante una ventana de administrador, salvo que ejecutes KeyBridge como administrador.
7. **Privacidad.** Todo funciona en local y el programa no envía datos a ningún sitio. Consulta [PRIVACY.md](PRIVACY.md).
8. **Datos.** Tus ajustes están en `%APPDATA%\es.miguelacm.keybridge\`. Puedes borrarlos cuando quieras.
