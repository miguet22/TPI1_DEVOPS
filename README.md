# 🛒 SuperList - Lista de Compras de Supermercado

[![CI](https://github.com/miguet22/TPI1_DEVOPS/actions/workflows/ci.yml/badge.svg?branch=actions)](https://github.com/miguet22/TPI1_DEVOPS/actions/workflows/ci.yml?query=branch%3Aactions)
[![Valoración SAST Python](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fmiguet22%2FTPI1_DEVOPS%2Fci-badges%2Factions.json)](https://github.com/miguet22/TPI1_DEVOPS/actions/workflows/ci.yml?query=branch%3Aactions)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=miguet22_TPI1_DEVOPS&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=miguet22_TPI1_DEVOPS)

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

## Ejecutar en local con proxy y replicas

Requisito: Docker con Docker Compose y el motor iniciado.
Desde la raiz del proyecto:

```powershell
docker compose build frontend backend
docker compose up -d --no-build --wait
```

Abrir [la web](http://localhost:8080) o [Swagger](http://localhost:8080/docs).
Se construye una imagen para la web y otra para la API; cada imagen se usa
para tres contenedores. Solo el proxy publica un puerto en el host.

```text
Navegador -> proxy :8080
              |-- /                 -> frontend, frontend2, frontend3
              |-- /api/, /docs,
                  /openapi.json     -> backend, backend2, backend3 -> Redis
```

Nginx reparte las solicitudes por round robin y aparta temporalmente un nodo
cuando falla una conexion. Reintenta con otro nodo hasta tres intentos,
con un segundo de timeout de conexion. Redis permanece en una red interna
accesible solo por las API, con el volumen persistente existente.

### Demostrar balanceo, caida y recuperacion (punto 6)

Con todos los contenedores levantados, ejecutar desde PowerShell:

```powershell
.\scripts\demo-failover.ps1
```

El script verifica tres identificadores distintos de web y API, crea un producto
temporal y comprueba que las replicas compartan sus cambios. Luego detiene
`frontend` y `backend`, verifica que las otras dos replicas de cada servicio
respondan y repite las operaciones de crear, completar, consultar y eliminar.
Finalmente restaura los contenedores, incluso si falla la prueba, y verifica
que vuelvan a responder tres nodos. Solo elimina el producto temporal de prueba.

Para una demostracion manual:

```powershell
docker compose ps
docker compose stop frontend backend
# Usar la web y comprobar que todavia permite operar.
docker compose start --wait frontend backend
```

En las herramientas del navegador, pestana Network, las cabeceras de respuesta
`X-Web-Node` y `X-API-Node` identifican el contenedor que atendio la solicitud.
`X-Upstream-Addr` muestra las direcciones que intento contactar el proxy.
Tambien se pueden consultar desde PowerShell:

```powershell
1..9 | ForEach-Object {
    (Invoke-WebRequest -UseBasicParsing http://localhost:8080/).Headers['X-Web-Node']
    (Invoke-WebRequest -UseBasicParsing http://localhost:8080/api/health).Headers['X-API-Node']
}
```

La tolerancia cubre la caida de replicas de web/API; el proxy y Redis siguen
siendo instancias unicas. Una peticion que ya estaba en curso durante la caida
puede fallar. No se fuerzan reintentos de POST que ya fueron enviados, para
no duplicar productos. Los nodos recuperados se reincorporan tras el intervalo
de deteccion (unos segundos). El proxy actualiza las IP usando el DNS de Docker
si se recrean los contenedores.

Referencias: [balanceo Nginx](https://nginx.org/en/docs/http/load_balancing.html)
y [reintentos del proxy](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_next_upstream).

Para detener el conjunto conservando los datos: `docker compose down`.
No agregar `-v` si se desea conservar el volumen de Redis.

---
## 🔌 Endpoints de la API Backend (`http://localhost:8080`)

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
👉 **[http://localhost:8080/docs](http://localhost:8080/docs)**

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

### Análisis de código con SonarCloud

Además de Bandit, el workflow corre un job `sonarcloud` que envía cobertura de
tests y análisis estático (bugs, code smells, vulnerabilidades, duplicación)
a [SonarCloud](https://sonarcloud.io), gratuito para repos públicos. Cubre
tanto `backend` (Python) como `js` (JavaScript del frontend).

Para activarlo, alguien del grupo con acceso admin al repo debe:

1. Entrar a [sonarcloud.io](https://sonarcloud.io) e iniciar sesión con la
   cuenta de GitHub del repositorio (u organización).
2. Importar el repositorio `miguet22/TPI1_DEVOPS` como nuevo proyecto.
3. Verificar que el "Organization Key" y el "Project Key" coincidan con los
   configurados en [`sonar-project.properties`](sonar-project.properties)
   (`sonar.organization` y `sonar.projectKey`); si SonarCloud asigna otros
   valores, actualizar ese archivo para que coincidan.
4. En SonarCloud: **My Account → Security** (o en el proyecto, **Administration
   → Analysis Method**), generar un token.
5. En GitHub: **Settings → Secrets and variables → Actions → New repository
   secret**, crear `SONAR_TOKEN` con ese valor.
6. Desactivar "Automatic Analysis" en la configuración del proyecto en
   SonarCloud (Administration → Analysis Method), porque el análisis lo
   dispara el workflow de GitHub Actions, no SonarCloud directamente.

Una vez configurado, cada push o PR corre el análisis y actualiza el Quality
Gate. El badge de arriba refleja el resultado del último análisis en la rama
por defecto de SonarCloud.

Para repetir las comprobaciones desde la raíz del repositorio:

```powershell
python -m pip install -r requirements-dev.txt
New-Item -ItemType Directory -Force reports | Out-Null
python -m pytest -q --junitxml=reports/tests.xml --cov=backend --cov-report=xml:reports/coverage.xml
python -m bandit -r backend -f json -o reports/bandit.json --exit-zero
python scripts/sast_rating.py reports/bandit.json reports/sast.json
```

### Notificaciones del CI en Discord

El job `notify-discord` espera a los tests, Bandit, SonarCloud y la publicación
del badge. Envía `CI OK` si las comprobaciones finalizan correctamente,
`CI FALLÓ` si algún job falla o `CI INCOMPLETO` si faltan comprobaciones.
El mensaje incluye el resultado de cada job, la rama, el commit y un enlace
a la ejecución. SonarCloud sin token se informa como omitido; el badge también
puede omitirse en ramas donde no se publica, sin convertir el CI en un fallo.

Para activarlo:

1. En el canal de Discord, abrir **Editar canal → Integraciones → Webhooks**,
   crear un webhook y copiar su URL.
2. En el repositorio de GitHub, abrir **Settings → Secrets and variables →
   Actions → New repository secret**.
3. Crear el secreto `DISCORD_WEBHOOK_URL` con la URL del webhook como valor.
4. Subir el workflow y ejecutar el CI mediante un push o **Run workflow**.

No guardar la URL en el código. Si el secreto no está disponible (por ejemplo,
en PRs desde forks), se omite el envío con un aviso. Las ejecuciones canceladas
no envían notificación. Un error de Discord se registra como advertencia y no
cambia el resultado de los controles del CI.

Referencia: [webhooks de Discord](https://docs.discord.com/developers/resources/webhook).
