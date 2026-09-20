# MACM KeyBridge — Documentación del proyecto

> Estado: **v0.2.0 compilada en local** (20/09/2026). Sin publicar en GitHub.
> Autor: Miguel Ángel Colorado Marin (MACM) · [miguelacm.es](https://miguelacm.es)

Índice:
1. [El problema real](#1-el-problema-real)
2. [Mediciones hechas](#2-mediciones-hechas)
3. [Qué puede y qué no puede hacer el software](#3-qué-puede-y-qué-no-puede-hacer-el-software)
4. [Arquitectura](#4-arquitectura)
5. [Decisiones y por qué](#5-decisiones-y-por-qué)
6. [Tecla de modo avión](#6-tecla-de-modo-avión)
7. [Reversibilidad](#7-reversibilidad)
8. [Errores encontrados durante el desarrollo](#8-errores-encontrados-durante-el-desarrollo)
9. [Roadmap](#9-roadmap)

---

## 1. El problema real

Portátil Lenovo LOQ (teclado interno ITE `VID_048D&PID_C976`). Las teclas **3, E, D y C** —una
columna completa de la matriz— no responden. Pero **funcionan mientras haya cualquier otra tecla
pulsada**: F8, Ctrl, espacio, la que sea.

Explicación más probable (coincide con los casos documentados en foros de Lenovo, HP y Asus): una
pista del circuito del teclado está agrietada. Con el teclado en reposo, el controlador espera un
"despertar" que esa pista dañada no provoca. Con cualquier tecla pulsada el controlador pasa a
escaneo continuo y entonces sí consigue leer la columna dañada.

Lo importante: **ese cambio de estado ocurre dentro del chip del teclado**, antes de que Windows
reciba nada.

## 2. Mediciones hechas

En el portátil de Miguel (mismo modelo de chip), con hook de bajo nivel + Raw Input de todas las
colecciones HID:

| Medición | Resultado |
|---|---|
| F8 pulsada | `vk=0x77 scan=0x42`, por `VID_048D&PID_C976&Col02` (teclado HID) |
| Repetición de F8 mantenida | ~31 ms |
| Fn sola | No genera ningún evento (lo gestiona el firmware) |
| Fn con F8 mantenida | El teclado manda **F8 UP**; al soltar Fn, F8 DOWN otra vez |
| Modo avión (Fn+F8) | No pasa por el teclado: va por `Col04`, colección HID *Wireless Radio Controls* (página 0x01, uso 0x0C) |
| Desactivando `Col04` | Fn+F8 deja de hacer nada; el teclado y el modo avión de Windows siguen bien |
| Estado del modo avión | `HKLM\SYSTEM\CurrentControlSet\Control\RadioManagement\SystemRadioState` (0/1) |

## 3. Qué puede y qué no puede hacer el software

**No puede:**
- Cerrar un circuito roto ni simular una tecla pulsada a nivel eléctrico. `SendInput` entra en
  Windows, no en la matriz del teclado.
- Poner el controlador del teclado en modo escaneo continuo. No hay interfaz pública para eso.
- Reparar la pista, ni ver las teclas antes de que el chip las lea.
- Actuar en la pantalla de inicio de sesión, en el escritorio seguro de UAC ni durante el arranque.
- Sin permisos de administrador, actuar cuando la ventana activa es de administrador.

**Sí puede:**
- Silenciar por completo una tecla que esté pisada físicamente (lo que hace KeyBridge).
- Anular la tecla de modo avión del teclado desactivando su colección HID.
- Detectar causas de software (teclas filtro, remapeos residuales, filtros de teclado, drivers).
- Sustituir teclas: que combinaciones de teclas que sí funcionan escriban 3/E/D/C (pendiente).
- Diagnosticar y explicar, que es lo que evita que el usuario pierda horas.

## 4. Arquitectura

```
macm-keybridge.exe                     proceso de interfaz (Tauri v2 + React)
 └── macm-keybridge.exe --engine       proceso motor, sin ventanas, ~4 MB
      └── hook WH_KEYBOARD_LL en hilo propio con bucle de mensajes
 └── macm-keybridge.exe --radio ...    ayudante elevado: activa/desactiva la colección HID de radio
 └── macm-keybridge.exe --cleanup      deshace todo (lo llama el desinstalador NSIS)
```

- Interfaz y motor hablan por stdin/stdout con JSON por líneas (`Request` / `Message`).
- El motor manda estadísticas cada 400 ms y los eventos de teclado cuando el inspector está activo.
- Si el motor muere, la interfaz lo relanza en 1 s y le reenvía reglas, estado y modo inspector.
- Al cerrar la interfaz se destruye la ventana (WebView fuera de memoria): ~9 MB + 4 MB en reposo.

Ficheros clave: `src-tauri/src/bridge.rs` (lógica pura + 11 tests), `hook.rs` (Win32),
`engine.rs` (proceso motor e IPC), `radio.rs` (SetupAPI), `system.rs` (elevación, autoarranque,
registro), `diagnostics.rs` (informe).

## 5. Decisiones y por qué

- **Motor en proceso aparte.** Windows dejaba de entregar los callbacks del hook mientras la ventana
  WebView de la propia app tenía el foco. Medido: 10 pulsaciones simuladas con la ventana delante =
  0 eventos; con el motor separado = 20/20. Era el fallo de "el test de teclado no va".
- **Lectura por sondeo, no por eventos.** La interfaz pide los eventos cada 30 ms
  (`take_events`) en vez de depender de eventos emitidos hacia el WebView.
- **Desactivar la colección HID** en vez de revertir el modo avión a posteriori: actúa antes y no
  deja a la usuaria sin Wi-Fi ni un segundo.
- **Reinstalar el hook cada 60 s** instalando el nuevo antes de quitar el viejo: Windows elimina los
  hooks lentos sin avisar y así no queda ni un hueco sin protección.
- **Buffer de la tecla Windows** para la tecla Copilot, que emite LWin + LShift + F23: se retiene
  LWin unos 35 ms para saber si viene la secuencia completa; si no viene, se reinyecta en orden.

## 6. Tecla de modo avión

Se busca por el identificador genérico de hardware `HID_DEVICE_UP:0001_U:000C` (controles de radio
inalámbrica), así que funciona en cualquier marca. Se desactiva con SetupAPI
(`DIF_PROPERTYCHANGE` + `DICS_DISABLE`, ámbito global), igual que "Deshabilitar dispositivo" en el
Administrador de dispositivos. El ayudante **solo** acepta dispositivos de esa clase: probado
pasándole el teclado y se niega.

Guardamos en la configuración los ids que hemos desactivado nosotros, para no tocar nunca lo que
haya desactivado el usuario por su cuenta.

## 7. Reversibilidad

- Botón "Restaurar" en la propia sección.
- Ajustes > "Deshacer todos los cambios del sistema": reactiva la radio y quita el autoarranque.
- Al desinstalar, el gancho NSIS `PREUNINSTALL` ejecuta `--cleanup` (se salta si es actualización,
  comprobando `$UpdateMode`).
- El autoarranque como administrador es una tarea programada con XML propio (funciona con batería,
  sin límite de tiempo de ejecución); el normal es una entrada en `HKCU\...\Run`.

## 8. Errores encontrados durante el desarrollo

1. Hook sin eventos con la ventana propia en primer plano → motor en proceso aparte.
2. El mapa del teclado se salía del recuadro → filas con `flex` proporcional.
3. `Status` necesitaba `Clone` para `emit`.
4. Rutas del registro con `\` sin raw string en `w!()`.
5. Al capturar una tecla ya mantenida, el temporizador se reiniciaba con cada repetición y nunca
   terminaba → el temporizador arranca solo con la primera pulsación.

## 9. Sustitución permanente (Scancode Map)

Para teclas que no responden nunca: una tecla que el usuario no usa pasa a escribir la rota. Se
guarda en `HKLMSYSTEMCurrentControlSetControlKeyboard LayoutScancode Map` con el formato
documentado por Microsoft: 8 bytes a cero, número de entradas (mapeos + 1), un DWORD por mapeo con
el código nuevo en la palabra alta y el viejo en la baja, y un DWORD a cero de cierre. Las teclas
extendidas llevan el prefijo `0xE0`.

Ventajas: funciona sin programas abiertos, para cualquier usuario y en la pantalla de inicio de
sesión. Requiere administrador una vez y reiniciar. Verificado en el equipo de Miguel escribiendo
y borrando el valor con el ayudante `--remap` (bytes exactos `00×8 · 02 00 00 00 · 64 00 12 00 ·
00 00 00 00`). Se deshace desde la propia pantalla, desde «Deshacer todos los cambios» y al
desinstalar.

## 10. Roadmap

1. Asistente que prueba teclas candidatas y recomienda la mejor tecla puente.
2. Modo capa (mantener una tecla y pulsar otra) como alternativa sin reiniciar.
3. Pausa automática al conectar un teclado externo y aviso sobre la pantalla de inicio de sesión.
3. README con la estructura estándar, workflow de release e icono, y publicación en GitHub.
4. Ficha descargable en miguelacm.es/tools.
