# Plan de Implementación: Suite Open Source para Periféricos en macOS y Linux

## 1. Resumen Ejecutivo y Objetivos

El objetivo de este proyecto es construir una aplicación de escritorio multiplataforma (macOS y Linux), moderna, ligera y de código abierto que permita a los usuarios configurar hardware que carece de soporte oficial fuera de Windows.

### Dispositivos Identificados en el Sistema:
1. **Mouse con Pantalla TFT:** **AJAZZ Serie AJ159 / AJ179 APEX**
   * **Identificador USB:** `VID: 0x3151`, `PID: 0x5007` *(Yichip / Ajazz)*.
   * **Objetivo principal:** Cargar animaciones GIF e imágenes estáticas personalizadas en la pantalla de la base de carga/mouse, sincronizar la hora del sistema, consultar el nivel de batería y ajustar parámetros de rendimiento (DPI, polling rate).
2. **Teclado Mecánico RGB:** **Controlador Sinowealth / BY Tech**
   * **Identificador USB:** `VID: 0x258A`, `PID: 0x0049` *(Sinowealth Gaming Keyboard)*.
   * **Objetivo principal:** Control de modos de iluminación RGB (velocidad, brillo, colores estáticos y reactivos) sin depender de software privativo.

---

## 2. Decisiones de Arquitectura y Stack Tecnológico

Basado en las decisiones de diseño adoptadas durante la entrevista técnica, el stack seleccionado es:

| Componente | Tecnología | Justificación Técnica |
| :--- | :--- | :--- |
| **Backend / Core Engine** | **Rust** (`hidapi` / `nusb`, `image`) | Máximo rendimiento, seguridad de memoria, binario compilado nativo, manejo eficiente de procesamiento de imágenes y buffers binarios sin recolector de basura. |
| **Framework de Aplicación** | **Tauri v2** | Genera binarios ultra ligeros (< 15 MB) con un consumo de RAM mínimo (~30-50 MB frente a los 150-250 MB de Electron), integrando capacidades nativas de System Tray y ventana flotante. |
| **Frontend / UI** | **React 18 + TypeScript + Tailwind CSS** | Ecosistema rico para manejo de componentes visuales (cropper interactivo de imágenes, previsualizador de GIFs en canvas, selector de color HSV/RGB). |
| **Librería de Imágenes** | **`image` (Rust crate) + `gif`** | Decodificación rápida de fotogramas GIF, ajuste de paleta de colores (color quantization RGB565 / RGB888) y redimensionamiento con interpolación bicúbica. |
| **Distribución y CI/CD** | **GitHub Actions** | Matriz de compilación automatizada generando `.dmg` (Universal binary para macOS Apple Silicon e Intel) y `.AppImage` / `.deb` (con reglas `udev`) para Linux. |

---

## 3. Arquitectura del Sistema

```mermaid
flowchart TD
    subgraph UI ["Frontend (Tauri WebView - React + Tailwind)"]
        A[Dashboard Principal] --> B[Editor / Cropper de GIFs]
        A --> C[Configuración de DPI y Batería]
        A --> D[Selector de Iluminación RGB Teclado]
        E[System Tray / Menu Bar] -->|Lectura rápida| C
    end

    subgraph Core ["Backend Rust (Tauri Core Engine)"]
        F[Tauri IPC Commands & Events]
        G[Módulo de Procesamiento de Imágenes (RGB565 / Tiling)]
        H[Driver Manager / Dispositivo Detection]
        I[Protocolo AJAZZ Screen (VID 0x3151)]
        J[Protocolo Sinowealth RGB (VID 0x258A)]
    end

    subgraph OS ["Capa del Sistema Operativo & Hardware"]
        K["macOS (IOKit / IOHIDManager)"]
        L["Linux (/dev/hidraw + udev rules)"]
        M[Base con Pantalla TFT AJAZZ]
        N[Teclado Mecánico Sinowealth]
    end

    UI -->|Invocaciones IPC| F
    F --> G
    F --> H
    H --> I
    H --> J
    I --> K & L
    J --> K & L
    K & L --> M & N
```

---

## 4. Ingeniería Inversa: Extracción del Protocolo USB HID

### 4.1. Fuente Local de Extracción (Ventaja Técnica Inmediata)
La aplicación oficial instalada en tu equipo (`AJAZZ Driver(R)`) es una aplicación Electron no empaquetada ubicada en:
```text
C:\Users\Alejandro\AppData\Local\Programs\AJAZZ Driver(R)\resources\app
```
En esta carpeta residen los archivos JavaScript (`dist/static/js/main_*.js` y `iot_driver.exe`), lo que permite extraer directamente:
1. **Report IDs y Longitud de Paquete:** Tamaño de los paquetes de reporte USB (comúnmente 64 bytes para HID básico o paquetes extendidos para transferencias masivas).
2. **Estructura del Handshake para Pantalla:** Comandos de inicio de transferencia (`START_UPLOAD`), metadatos (ancho, alto, número de fotogramas, retardo entre frames en milisegundos) y fin de transferencia (`FINISH_UPLOAD`).
3. **Formato de Color de la Pantalla:** Las pantallas TFT de periféricos suelen utilizar matrices de píxeles en **RGB565** (16 bits por píxel: 5 bits rojo, 6 bits verde, 5 bits azul) en lugar de RGB888 estándar para reducir el ancho de banda USB.

### 4.2. Estructura Típica de un Paquete de Pantalla (AJAZZ / Yichip):
```text
[Byte 0]: Report ID (ej. 0x07 o 0x00)
[Byte 1]: Comando / Opcode (ej. 0xA1 = Cargar Frame, 0xA2 = Iniciar Stream)
[Byte 2-3]: Índice de Frame / Número de paquete (Big-Endian o Little-Endian)
[Byte 4-61]: Payload de datos de imagen (58 bytes de píxeles codificados)
[Byte 62-63]: Checksum / CRC o padding
```

---

## 5. Diseño e Implementación Técnica

### 5.1. Estructura del Proyecto
```text
ajazz-device-suite/
├── .github/
│   └── workflows/
│       └── release.yml                # CI/CD para macOS y Linux
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── icons/
│   └── src/
│       ├── main.rs                    # Entrypoint y configuración de bandejas
│       ├── device/
│       │   ├── mod.rs                 # Abstracción DeviceTrait (connect, send, read)
│       │   ├── ajazz_mouse.rs         # Protocolo específico para 0x3151:0x5007
│       │   └── sinowealth_keyboard.rs # Protocolo específico para 0x258A:0x0049
│       ├── image_engine/
│       │   ├── mod.rs                 # Conversión de GIFs a secuencias RGB565
│       │   └── quantize.rs            # Reducción de color y dithering
│       └── commands/
│           ├── screen.rs              # Comandos IPC: upload_gif, set_clock
│           ├── keyboard.rs            # Comandos IPC: set_rgb_mode, set_color
│           └── telemetry.rs           # Comandos IPC: get_battery, get_dpi
├── src/                               # Frontend React + Tailwind
│   ├── components/
│   │   ├── GifUploader.tsx            # Dropzone interactivo para GIFs/Imágenes
│   │   ├── GifCanvasCropper.tsx       # Previsualizador con resolución nativa
│   │   ├── ColorPicker.tsx            # Paleta de colores para el teclado
│   │   ├── DpiSlider.tsx              # Control de sensibilidad y perfiles
│   │   └── BatteryIndicator.tsx       # Widget de batería en tiempo real
│   ├── App.tsx
│   ├── index.css
│   └── main.tsx
└── udev/
    └── 99-ajazz-peripherals.rules     # Reglas para Linux
```

### 5.2. Reglas de Permisos en Linux (`udev`)
Para permitir que usuarios no-root interactúen con el dispositivo en distribuciones Linux (Ubuntu, Fedora, Arch, etc.), se debe proveer el archivo `99-ajazz-peripherals.rules`:
```udev
# AJAZZ AJ159/AJ179 Mouse & Charging Dock
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="3151", ATTRS{idProduct}=="5007", MODE="0666", TAG+="uaccess"
SUBSYSTEM=="usb", ATTRS{idVendor}=="3151", ATTRS{idProduct}=="5007", MODE="0666", TAG+="uaccess"

# Teclado Mecánico Sinowealth / BY Tech
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="258a", ATTRS{idProduct}=="0049", MODE="0666", TAG+="uaccess"
SUBSYSTEM=="usb", ATTRS{idVendor}=="258a", ATTRS{idProduct}=="0049", MODE="0666", TAG+="uaccess"
```

### 5.3. Permisos y Compatibilidad en macOS
* macOS no requiere drivers en modo kernel (`kexts`).
* Mediante el backend `hidapi` en Rust, la aplicación utiliza la API estándar de usuario `IOKit` / `IOHIDManager`.
* **Gatekeeper:** Para binarios no firmados mediante certificado de pago de Apple Developer ($99/año), el instalador `.dmg` incluirá un mensaje claro con el comando para desbloquear el atributo de cuarentena:
  ```bash
  xattr -cr /Applications/AjazzSuite.app
  ```

---

## 6. Pipeline de Despliegue Automatizado (GitHub Actions)

Flujo de trabajo para generar instaladores con cada tag de versión (`v*`):

```yaml
name: Release Multiplataforma

on:
  push:
    tags:
      - 'v*'

jobs:
  build-tauri:
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: 'macos-latest'      # Apple Silicon (M1/M2/M3/M4)
            args: '--target aarch64-apple-darwin'
          - platform: 'macos-13'          # Intel Mac
            args: '--target x86_64-apple-darwin'
          - platform: 'ubuntu-22.04'      # Linux x86_64 (.AppImage & .deb)
            args: ''

    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Instalar Dependencias del Sistema (Linux)
        if: matrix.platform == 'ubuntu-22.04'
        run: |
          sudo apt-get update
          sudo apt-get install -y libgtk-3-dev libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libudev-dev

      - name: Instalar Toolchain de Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.platform == 'macos-latest' && 'aarch64-apple-darwin' || matrix.platform == 'macos-13' && 'x86_64-apple-darwin' || '' }}

      - name: Instalar Dependencias Frontend
        run: npm install

      - name: Compilar y Empaquetar con Tauri
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: 'Ajazz Suite ${{ github.ref_name }}'
          releaseBody: 'Ver el changelog para detalles de la versión.'
          releaseDraft: false
          prerelease: false
          args: ${{ matrix.args }}
```

---

## 7. Hoja de Ruta de Ejecución por Fases

### Fase 0: Extracción y Validación del Protocolo (PoC en Terminal)
- [ ] Inspeccionar el archivo JS de Ajazz en Windows para aislar la rutina exacta de subida de imágenes y lectura de batería.
- [ ] Crear un script prototipo en Rust o Python usando `hidapi` para:
  1. Abrir el dispositivo `3151:5007`.
  2. Enviar un frame de prueba cuadrado (ej. 128x128 píxeles de color rojo) a la pantalla del dock.
  3. Confirmar la visualización física en la pantalla.

### Fase 1: MVP del Mouse en Tauri (Carga de GIFs y Telemetría)
- [ ] Inicializar el proyecto con Tauri v2 + React + TypeScript + Tailwind.
- [ ] Implementar el motor de procesamiento de GIFs en Rust (decodificación, redimensionado a las dimensiones nativas de la pantalla y empaquetado de bloques USB).
- [ ] Desarrollar la interfaz gráfica:
  - Drag and drop de imágenes/GIFs con previsualización en tiempo real.
  - Barra de progreso de transferencia USB.
  - Visualización del porcentaje de batería y selector de DPI.
- [ ] Añadir soporte para el icono en la barra de menús (System Tray).

### Fase 2: Soporte para Teclado Sinowealth (RGB & Macros)
- [ ] Conectar el protocolo de control de iluminación para `258A:0049` aprovechando la base documentada de `sinowealth-kb-tool` y `OpenRGB`.
- [ ] Añadir panel selector de efectos (Onda, Respiración, Color Fijo, Reactivo) y rueda de colores RGB.

### Fase 3: CI/CD y Empaquetado Público
- [ ] Configurar el repositorio en GitHub con el workflow de GitHub Actions.
- [ ] Publicar la primera versión beta (`v0.1.0`) con descargas listas para macOS (`.dmg`) y Linux (`.AppImage` + `.deb` + reglas `udev`).
- [ ] Redactar el archivo `README.md` con instrucciones de instalación y guía de solución de problemas para la comunidad.
