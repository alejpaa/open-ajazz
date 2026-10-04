# AJAZZ AJ159 / AJ179 APEX - Protocolo USB HID Reverso

Este documento especifica la estructura binaria del protocolo de comunicación USB HID para el mouse **AJAZZ AJ159 APEX / AJ179 APEX** y su base de carga magnética con pantalla TFT (`dangle_3950b`).

---

## 1. Identificación del Dispositivo

* **Vendor ID (VID):** `0x3151` (`12625` decimal) - *Yichip Microelectronics*
* **Product ID (PID):** `0x5007` (`20487` decimal) - *AJAZZ APEX Mouse & Dock*
* **Interfaz:** Interface 1 (Vendor Defined / Raw HID)
* **Usage Page:** `0xFFFF` (`65535`)
* **Usage:** `0x0001` o `0x0002`
* **Longitud del Reporte Feature:** 64 bytes de payload útil (+1 byte para el Report ID en sistemas Windows = 65 bytes totales).

---

## 2. Pantalla TFT a Color (128x128 Píxeles)

La base magnética cuenta con una pantalla TFT de 128x128 píxeles con soporte para gráficos a 16 bits de color (**RGB565**).

### 2.1. Opcodes de Control de Pantalla

| Comando | Valor Hex | Valor Dec | Descripción |
| :--- | :--- | :--- | :--- |
| `FEA_CMD_SET_OLEDCLOCK` | `0x28` | `40` | Sincroniza la fecha y la hora del sistema en la pantalla. |
| `FEA_CMD_SET_OLEDGIFDATA` | `0x24` | `36` | Envía bloques de datos de un fotograma GIF o imagen. |
| `FEA_CMD_GETTFTLCDDATA` | `0x25` | `37` | Handshake de preparación para datos de pantalla (16-bit RGB565). |
| `FEA_CMD_SETTFTLCDDATA` | `0x25` | `37` | Envío de paquetes de datos RGB565. |
| `FEA_CMD_SET_FLASHCHIPERASSE`| `0xAC` | `172` | Borra la memoria flash de la pantalla antes de escribir una animación nueva. |
| `FEA_CMD_GETOLED_VERSION` | `0xAD` | `173` | Lee la versión del controlador de pantalla y la memoria flash. |

---

### 2.2. Sincronización de Reloj (`FEA_CMD_SET_OLEDCLOCK = 0x28`)

Se envía un buffer de 64 bytes:
```text
Byte 0:  0x28 (Opcode)
Byte 1..7: 0x00 (Relleno)
Byte 8:  Año (Byte alto: year >> 8)
Byte 9:  Año (Byte bajo: year & 0xFF)
Byte 10: Mes (1..12)
Byte 11: Día (1..31)
Byte 12: Hora (0..23)
Byte 13: Minuto (0..59)
Byte 14: Segundo (0..59)
Byte 15..63: 0x00 (Relleno)
```

---

### 2.3. Carga de Imágenes y Animaciones GIF

#### Paso 1: Handshake de Inicialización (`0x25`)
Antes de transferir fotogramas, se envía un paquete descriptor con las dimensiones y metadatos:
```text
Byte 0:  0x25
Byte 1:  Índice de frame actual (currentFrame)
Byte 2:  Cantidad total de frames (totalFrames)
Byte 3:  Retardo entre frames en ms (frameDelay)
Byte 4..7: Tamaño total de datos en bytes (UInt32 Little-Endian: width * height * 2)
Byte 8:  Left & 0xFF (0 para pantalla completa de 128x128)
Byte 9:  Top & 0xFF (0)
Byte 10: Right & 0xFF (127 & 0xFF = 127)
Byte 11: Bottom & 0xFF (127 & 0xFF = 127)
Byte 12..15: Coordenadas extendidas (High bytes: left >> 8, top >> 8, etc.)
```

#### Paso 2: Fragmentación de Fotogramas en Paquetes USB
Cada fotograma se redimensiona a 128x128 píxeles y se convierte a formato **RGB565** (2 bytes por píxel = 32,768 bytes por frame).
Los datos se dividen en fragmentos de **56 bytes**:
* Paquetes por frame = $\lceil 32768 / 56 \rceil = 586$ paquetes.

Estructura de cada paquete de 64 bytes:
```text
Byte 0: 0x24 (o 0x25)
Byte 1: Si es GIF: (totalFrames - 1), si es estático: 0
Byte 2: Número de paquete / índice de bloque (y)
Byte 3: Frame actual (currentFrame)
Byte 4: Retardo de frame (frameDelay)
Byte 5: Capa de pantalla (layer, por defecto 1)
Byte 6..7: UInt16LE con el número de paquete (y)
Byte 8..63: 56 bytes de datos de píxeles (RGB565)
```

---

## 3. Configuración del Mouse (DPI, Colores y Rendimiento)

### 3.1. Niveles de DPI y Colores por Etapa (`FEA_CMD_MOUSE_SET_OPTIONPARAM1 = 0x54`)

Permite configurar de 1 a 8 niveles de DPI y el color RGB asignado al indicador de cada nivel.

```text
Byte 0:  0x54 (Opcode: FEA_CMD_MOUSE_SET_OPTIONPARAM1)
Byte 1:  Perfil activo (0..2)
Byte 2:  Etapa de DPI seleccionada actualmente (0..7)
Byte 3:  Cantidad total de etapas habilitadas (ej. 4, 6 u 8)
Byte 4..7: 0x00

-- Valores de DPI (UInt16 Little-Endian por etapa):
Byte 8..9:   DPI Etapa 1 (ej. 400 = 0x90, 0x01)
Byte 10..11: DPI Etapa 2 (ej. 800 = 0x20, 0x03)
Byte 12..13: DPI Etapa 3 (ej. 1600 = 0x40, 0x06)
Byte 14..15: DPI Etapa 4 (ej. 3200 = 0x80, 0x0C)
Byte 16..17: DPI Etapa 5 (ej. 6400 = 0x00, 0x19)
Byte 18..19: DPI Etapa 6 (ej. 10000 = 0x10, 0x27)
Byte 20..21: DPI Etapa 7 (ej. 16000 = 0x80, 0x3E)
Byte 22..23: DPI Etapa 8 (ej. 26000 = 0x90, 0x65)
Byte 24..39: Relleno / Opciones adicionales

-- Colores RGB asignados a cada nivel de DPI (3 bytes por color):
Byte 40..42: RGB Etapa 1 [R, G, B] (ej. Rojo: 255, 0, 0)
Byte 43..45: RGB Etapa 2 [R, G, B] (ej. Azul: 0, 0, 255)
Byte 46..48: RGB Etapa 3 [R, G, B] (ej. Verde: 0, 255, 0)
Byte 49..51: RGB Etapa 4 [R, G, B] (ej. Amarillo: 255, 255, 0)
Byte 52..54: RGB Etapa 5 [R, G, B] (ej. Cian: 0, 255, 255)
Byte 55..57: RGB Etapa 6 [R, G, B] (ej. Violeta: 255, 0, 255)
Byte 58..60: RGB Etapa 7 [R, G, B] (ej. Blanco: 255, 255, 255)
Byte 61..63: RGB Etapa 8 [R, G, B]
```

---

### 3.2. Polling Rate, LOD, Debounce y Energía (`FEA_CMD_MOUSE_SET_OPTIONPARAM0 = 0x53`)

```text
Byte 0:  0x53 (Opcode: FEA_CMD_MOUSE_SET_OPTIONPARAM0)
Byte 1..7: 0x00
Byte 8:  Perfil (0..2)
Byte 9:  Tasa de sondeo / Polling Rate:
         0 = 125 Hz
         1 = 250 Hz
         2 = 500 Hz
         3 = 1000 Hz
         4 = 2000 Hz
         5 = 4000 Hz
         6 = 8000 Hz
Byte 10: Etapa DPI activa (1..8)
Byte 11: 0x00
Byte 12..13: UInt16LE Bitflags:
             Bit 0: Apagar luces (lightOff)
             Bit 1: Apagar luz rueda (wheelLightOff)
             Bit 2: Modo suavizado de sensor (smooth)
             Bit 3: Selección de LED (ledSelect)
             Bit 4: Modo ahorro de batería (powerSaveMode)
Byte 14: buttonChange (inversión de botones)
Byte 15: Sensibilidad scroll
Byte 16: Debounce time en ms (ej. 2..20 ms)
Byte 24..31: Parámetros de efectos RGB
Byte 40..47: Tiempos de suspensión (sleep_24, sleep_bt en segundos)
Byte 50: Sensibilidad eje X (por defecto 100)
Byte 51: Sensibilidad eje Y (por defecto 100)
```

---

### 3.3. Lectura de Nivel de Batería (`FEA_CMD_GET_BATTERY = 0x83`)

* **Solicitud:** Enviar buffer con Byte `0 = 0x83` (`131`).
* **Respuesta:**
  * Byte 0: `0x83`
  * Byte 1: Estado de carga (`0` = Descargando en batería, `1` = Cargando en base magnética o cable USB).
  * Byte 2: Nivel de porcentaje de batería (`0` a `100`%).
