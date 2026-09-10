# 🛒 SuperList - Lista de Compras de Supermercado

[![CI](https://github.com/miguet22/TPI1_DEVOPS/actions/workflows/ci.yml/badge.svg?branch=actions)](https://github.com/miguet22/TPI1_DEVOPS/actions/workflows/ci.yml?query=branch%3Aactions)
[![Valoración SAST Python](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fmiguet22%2FTPI1_DEVOPS%2Fci-badges%2Factions.json)](https://github.com/miguet22/TPI1_DEVOPS/actions/workflows/ci.yml?query=branch%3Aactions)

> **Trabajo Práctico N° 1 - DevOps**  
> Aplicación web interactiva que consume una API REST en Python (FastAPI) con persistencia y caché en **Redis**.

---

## 📌 Descripción del Proyecto

SuperList es una solución para planificar y gestionar las compras del supermercado. Cumple con la arquitectura de un **ToDo List avanzado**, permitiendo:
- ➕ **Agregar** productos con categoría, cantidad y notas personalizadas mediante un modal interactivo.
- ✅ **Marcar como comprado / pendiente** con actualización de estadísticas y progreso visual.
- 🗑️ **Eliminar** productos individuales o limpiar todos los comprados.
- ⚡ **Persistencia en Redis** mediante operaciones en el Hash `superlist:items`.
- 📋 **Copiar lista formateada** lista para compartir por WhatsApp o notas.

---

## 🏗️ Arquitectura del Proyecto

```text
TP1_devops/
├── backend/
│   ├── main.py              # API FastAPI, endpoints CRUD y conexión a Redis
│   └── requirements.txt     # Dependencias de Python (fastapi, uvicorn, redis, fakeredis, pydantic)
├── css/
│   └── styles.css           # Estilos visuales, diseño responsive, glassmorphism y tema oscuro
├── js/
│   └── app.js               # Lógica del cliente, fetch a la API y fallback offline
├── index.html               # Interfaz web principal y modal
├── .gitignore               # Archivos ignorados por Git
└── README.md                # Guía de instalación y uso
```

---

## 🚀 Guía de Ejecución en Local (Paso a Paso)

### 1. Requisitos Previos
- **Python 3.10 o superior** instalado en el sistema.
- **Git** (opcional, para clonar el repositorio).

---

### 2. Instalar las dependencias del Backend

Abre una terminal en la raíz del proyecto y ejecuta:

```powershell
pip install -r backend/requirements.txt
```

---

### 3. Iniciar el Backend (API en Python)

En la terminal, ingresa a la carpeta `backend` y ejecuta el servidor:

```powershell
cd backend
python main.py
```

> 💡 **Nota sobre Redis**:  
> El backend cuenta con detección inteligente:
> - Si tienes un servidor Redis corriendo en `localhost:6379`, se conectará automáticamente a él.
> - Si **no** tienes Redis instalado o no usas Docker, el backend levantará un **motor Redis en memoria (`fakeredis`)** de forma transparente, permitiendo que todas las funciones (`HSET`, `HGETALL`, `HDEL`) operen al 100% sin configuraciones adicionales.

---

### 4. Iniciar la Aplicación Web (Frontend)

Tienes dos opciones para abrir la web:

- **Opción A (Recomendada con servidor local)**:
  Abre una **segunda terminal** en la carpeta raíz del proyecto y ejecuta:
  ```powershell
  python -m http.server 8080
  ```
  Luego abre en tu navegador: [http://localhost:8080/index.html](http://localhost:8080/index.html)

- **Opción B (Directa)**:  
  Haz doble clic en el archivo `index.html` para abrirlo directamente en tu navegador favorito.

---

## 🔌 Endpoints de la API Backend (`http://localhost:8000`)

| Método | Endpoint | Descripción | Operación en Redis |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Estado de la API y verificación de conexión a Redis | `redis.ping()` |
| `GET` | `/api/items` | Obtiene la lista completa de compras | `HGETALL superlist:items` |
| `POST` | `/api/items` | Agrega un nuevo producto a la lista | `HSET superlist:items {id} {json}` |
| `PUT` | `/api/items/{id}` | Actualiza un producto (marcar completado, cantidad, etc.) | `HSET superlist:items {id} {json}` |
| `DELETE` | `/api/items/{id}` | Elimina un producto individual de la lista | `HDEL superlist:items {id}` |
| `DELETE` | `/api/items/completed/clear` | Elimina todos los productos comprados | `HDEL` masivo |

### 📖 Documentación Interactiva (Swagger UI)
Con el backend en ejecución, puedes explorar, probar y ejecutar todas las llamadas a la API interactivamente ingresando a:
👉 **[http://localhost:8000/docs](http://localhost:8000/docs)**

---

## 🐳 (Opcional) Ejecutar Redis con Docker

Si deseas probar el backend conectado a un contenedor real de Redis en lugar del motor en memoria:

```powershell
docker run -d --name local-redis -p 6379:6379 redis:alpine
```
Al reiniciar el backend, este detectará automáticamente el servidor en el puerto `6379`.

## Integración continua: tests y SAST

El workflow `.github/workflows/ci.yml` ejecuta los tests con Python 3.12 y el análisis
estático en cada push (excepto `ci-badges`), pull request y ejecución manual.
Los tests unitarios usan `fakeredis` aislado por caso; también se comprueban los
contratos HTTP con `TestClient`. No necesitan Redis externo ni Docker.

El SAST usa [Bandit](https://bandit.readthedocs.io/en/latest/start.html) sobre todo
el directorio `backend`. Su alcance es Python: no analiza el JavaScript del frontend,
las imágenes Docker ni vulnerabilidades de dependencias.
La valoración es una escala propia del proyecto calculada desde el informe real:

| Valoración | Hallazgos de mayor severidad | Resultado SAST |
| --- | --- | --- |
| A | Sin hallazgos | Aprobado |
| B | Bajos | Aprobado con observaciones |
| C | Medios | Fallido |
| D | Altos | Fallido |
| error | Informe ausente, inválido o análisis incompleto | Fallido |

El badge muestra además las cantidades H (altos), M (medios) y L (bajos).
`--exit-zero` permite guardar todos los hallazgos; el paso siguiente aplica el umbral
y falla ante severidades medias o altas. Un error del analizador también falla el CI.
El arranque local con `python backend/main.py` escucha en `127.0.0.1` para evitar
exponer el servidor de desarrollo a la red. El contenedor conserva su comando Uvicorn.
Los informes `test-results` (JUnit) y `sast-results` (JSON) se descargan desde la ejecución
en la pestaña **Actions**, incluso cuando los tests o el umbral SAST fallan.

El primer badge muestra el estado completo del CI en `actions`. El segundo muestra
el último análisis publicado de esa misma rama. Los pushes a `actions` y `main`
actualizan sus respectivos archivos en la rama automática `ci-badges`, usando
únicamente `GITHUB_TOKEN` con `contents: write` en el job de publicación. Los pull
requests ejecutan tests y SAST con permisos de lectura y no publican badges.
No se requiere una cuenta externa ni configurar secretos adicionales.

Los badges estarán disponibles después de subir la rama y finalizar la primera
ejecución. El repositorio debe ser público para que Shields.io pueda leer el JSON;
las políticas del repositorio deben permitir al workflow escribir en `ci-badges`.
La valoración representa el último análisis publicado, por lo que debe consultarse
junto al badge CI si una ejecución fue cancelada o falló la publicación.
Al integrar en `main`, cambiar `branch=actions`, `branch%3Aactions` y `actions.json`
en los enlaces superiores por sus equivalentes de `main`.

Para repetir las comprobaciones desde la raíz del repositorio:

```powershell
python -m pip install -r requirements-dev.txt
python -m pytest -q --junitxml=reports/tests.xml
New-Item -ItemType Directory -Force reports | Out-Null
python -m bandit -r backend -f json -o reports/bandit.json --exit-zero
python scripts/sast_rating.py reports/bandit.json reports/sast.json
```
