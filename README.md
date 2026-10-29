# OpenAJAZZ (APEX Edition)

> **Suite moderna, ligera y de código abierto para configurar el mouse AJAZZ AJ159 APEX / AJ179 APEX y su base de carga con pantalla TFT en macOS, Linux y Windows.**

![Licencia MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![Plataformas](https://img.shields.io/badge/plataforma-macOS%20%7C%20Linux%20%7C%20Windows-brightgreen.svg)
![Stack](https://img.shields.io/badge/stack-Rust%20%2B%20Tauri%20v2%20%2B%20React-indigo.svg)

---

## 🌟 Características Principales

1. **Estudio de Pantalla TFT (128 × 128 Píxeles):**
   * Carga de animaciones GIF e imágenes estáticas directamente a la memoria de la pantalla en la base magnética (`0x3151:0x5007`).
   * Conversión automática a matriz de 16 bits de color (**RGB565**).
   * Previsualizador interactivo a escala real con control de velocidad de fotogramas (frame delay).
   * Sincronización de la fecha y hora del sistema operativo en el reloj de la pantalla con un solo clic.

2. **Control Total de Sensibilidad y Sensor (DPI):**
   * Configuración de 1 a 8 niveles independientes de DPI (rango de 50 a 26,000 / 32,000 DPI con pasos de 50).
   * Asignación personalizada de colores RGB por cada etapa de DPI.
   * Selector de tasa de sondeo (*Polling Rate*): 125 Hz, 250 Hz, 500 Hz, 1000 Hz, 2000 Hz, 4000 Hz y 8000 Hz.
   * Ajuste de tiempo de rebote (*Debounce Time*) de 0 a 20 ms.
   * Distancia de despegue (*LOD - Lift-off Distance*) de 1 mm y 2 mm.
   * Modo de suavizado de sensor (*Smooth Mode*).

3. **Iluminación y Efectos RGB:**
   * Control de efectos: **Color Fijo (Static)**, **Respiración (Breathing)**, **Onda RGB (Wave)**, **Neón (Neon)** y **Apagado (Off)**.
   * Rueda de colores interactiva y paleta de tonos rápidos.
   * Ajuste fino de brillo (0 a 100%) y velocidad de animación.

4. **Telemetría y Estado de Batería en Tiempo Real:**
   * Indicador del porcentaje exacto de batería del mouse.
   * Detección automática del estado de carga (en base magnética o por cable).
   * Lectura de las versiones de firmware del microcontrolador y la pantalla LCD.

---

## 📂 Estructura del Repositorio

```text
openajazz/
├── .github/workflows/
│   └── release.yml                # CI/CD para compilar .dmg (Apple Silicon e Intel) y .AppImage/.deb
├── src-tauri/                     # Backend nativo en Rust
│   ├── Cargo.toml                 # Dependencias: hidapi, image, chrono, tauri v2
│   ├── tauri.conf.json            # Configuración de empaquetado para macOS y Linux
│   └── src/
│       ├── main.rs                # Entrypoint y registro de comandos IPC
│       └── protocol.rs            # Protocolo binario inverso (64 bytes HID / opcodes)
├── src/                           # Frontend React 18 + TypeScript + Tailwind
│   ├── components/
│   │   ├── ScreenStudio.tsx       # Estudio de carga y recorte de GIFs para la pantalla TFT
│   │   ├── DpiSettings.tsx        # Sliders de 8 etapas de DPI, colores y polling rate 8K
│   │   ├── LightingSettings.tsx   # Selector de modos RGB, brillo y velocidad
│   │   └── BatteryStatus.tsx      # Monitor de batería y telemetría de conexión
│   ├── App.tsx                    # Shell principal de la aplicación
│   ├── index.css                  # Estilos globales y diseño dark gamer
│   └── main.tsx                   # Punto de entrada de React
├── tools/
│   └── test_mouse.js              # Script de diagnóstico rápido en Node.js
├── udev/
│   └── 99-ajazz-mouse.rules       # Reglas de permisos para distribuciones Linux
├── PROTOCOL.md                    # Especificación exhaustiva del protocolo binario USB HID
└── README.md                      # Esta documentación
```

---

## 🚀 Instalación y Despliegue

### En macOS (Apple Silicon M1/M2/M3/M4 o Intel)
1. Descarga el instalador `.dmg` desde la sección de **Releases** en GitHub.
2. Arrastra `OpenAJAZZ.app` a tu carpeta de `/Aplicaciones`.
3. Al ser una aplicación open source independiente sin certificado de pago de Apple, si macOS muestra el aviso de seguridad de Gatekeeper, ejecuta en tu terminal:
   ```bash
   xattr -cr /Applications/OpenAJAZZ.app
   ```
4. Conecta el mouse o la base magnética por USB y abre la aplicación.

### En Linux (Ubuntu, Debian, Fedora, Arch)
1. Descarga el paquete `.AppImage` o `.deb`.
2. Para que la aplicación pueda comunicarse con el dispositivo USB sin permisos de root/sudo, instala las reglas `udev`:
   ```bash
   sudo cp udev/99-ajazz-mouse.rules /etc/udev/rules.d/
   sudo udevadm control --reload-rules && sudo udevadm trigger
   ```
3. Ejecuta la aplicación.

---

## 🛠️ Desarrollo Local

### Requisitos:
* **Node.js** (v18 o superior)
* **Rust** y **Cargo** (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)

### Comandos:
```bash
# 1. Instalar dependencias del frontend
npm install

# 2. Compilar el frontend para producción
npm run build

# 3. Ejecutar en modo desarrollo con Tauri
npm run tauri dev
```

---

## 📖 Protocolo USB HID
Para consultar la estructura de cada byte, opcodes y paquetes de reporte, consulta el documento técnico detallado:
📄 **[PROTOCOL.md](PROTOCOL.md)**.
