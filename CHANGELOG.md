# Changelog

Todas las versiones siguen [SemVer](https://semver.org/lang/es/). / All versions follow SemVer.

## [1.0.0] - 2026-10-07

Primera versión pública. / First public release.

### Anular teclas
- Silencia por completo una tecla pisada físicamente mediante un hook de bajo nivel (`WH_KEYBOARD_LL`): sin repeticiones, sin menús, sin atajos, el tiempo que haga falta.
- Motor en un proceso hijo sin ventanas: Windows deja de entregar los eventos del hook mientras la ventana de la propia aplicación tiene el foco. Medido, 0 eventos antes y 20/20 después.
- Tecla Copilot soportada: el teclado emite `LWin + LShift + F23` y se retiene `LWin` 35 ms para distinguirla, sin romper la tecla Windows real.
- Vale también para teclas que molestan: Copilot, la tecla Windows en juegos, Bloq Mayús, Insert o F1.
- Pausa de 1/5/15/60 minutos o hasta reanudar, y atajo global (`Ctrl + Alt + B` por defecto).

### Cambiar teclas
- Sustitución permanente mediante el Scancode Map de Windows: una tecla que no usas escribe la rota, sin la aplicación abierta, para cualquier usuario y en la pantalla de inicio de sesión.
- Pide administrador una vez, requiere reiniciar y se quita limpiamente. Avisa si ya existe un mapa creado por otro programa en lugar de sobrescribirlo.

### Modo avión
- Anula la tecla de modo avión del teclado desactivando la colección HID «Controles de radio inalámbrica» (`HID_DEVICE_UP:0001_U:000C`): el teclado, el Wi-Fi, el Bluetooth y el modo avión de Windows siguen funcionando.
- Solo toca dispositivos de esa clase y solo reactiva los que desactivó la propia aplicación. Detecta si una actualización de Windows lo ha vuelto a activar.

### Diagnóstico
- Comprobaciones de Windows con arreglo en un clic: teclas filtro, teclas especiales, Scancode Map ajeno, filtros de teclado de terceros, otros remapeadores en marcha, teclados desactivados y versión de BIOS.
- Prueba guiada de dos pasos con veredicto (fallo físico / sin fallo / teclas muertas) y recomendaciones ordenadas.
- Informe de diagnóstico en texto plano al Escritorio.

### Manual de teclas
- 28 fichas bilingües: qué hace cada tecla sola, qué hace con `Fn` y si conviene como tecla puente o como tecla sacrificada, con avisos de BIOS, menú de arranque y modo avión.
- Teclas recomendadas de un clic; el manual completo solo se abre si lo pides.

### Aplicación
- Asistente que empieza preguntando qué le pasa al teclado y lleva directo a la solución.
- Inicio con el resumen en frases de lo que está activo y avisos cuando falta algo (por ejemplo, el modo avión sin anular con F8 como tecla puente).
- Bandeja del sistema, inicio con Windows como usuario o como administrador (tarea programada), español e inglés, tema claro y oscuro.
- Reversibilidad total: deshacer por función, «Deshacer todos los cambios» y limpieza automática al desinstalar.
- 100 % local: sin red, sin telemetría, sin cuentas y sin actualizador.
