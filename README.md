# SuperList

[![CI](https://github.com/miguet22/TPI1_DEVOPS/actions/workflows/ci.yml/badge.svg?branch=actions)](https://github.com/miguet22/TPI1_DEVOPS/actions/workflows/ci.yml?query=branch%3Aactions)
[![Valoración SAST Python](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fmiguet22%2FTPI1_DEVOPS%2Fci-badges%2Factions.json)](https://github.com/miguet22/TPI1_DEVOPS/actions/workflows/ci.yml?query=branch%3Aactions)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=miguet22_TPI1_DEVOPS&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=miguet22_TPI1_DEVOPS)

Trabajo Práctico N.º 1 de DevOps, UTN FRRe, 2026.

SuperList es una lista de compras que usamos para probar la integración entre una aplicación web, una API REST y Redis. Permite agregar productos, marcarlos como comprados, volverlos a dejar pendientes y eliminarlos. La web nunca accede directamente a Redis: todas las operaciones pasan por la API.

## Arquitectura

El entorno local se levanta completo con Docker Compose:

```text
                         ┌─ frontend
Navegador ──> Nginx ─────┼─ frontend2
             :8080       └─ frontend3
                 │
                 │ /api
                 ├───────── backend  ─┐
                 ├───────── backend2 ─┼──> Redis
                 └───────── backend3 ─┘
```

Nginx funciona como proxy reverso y distribuye las solicitudes entre tres instancias de la web y tres de la API. Las API comparten el mismo Redis, por lo que cualquier réplica puede consultar o modificar la lista. Redis está en una red interna y tiene un volumen para conservar los datos cuando se recrean los contenedores.

Solo el proxy publica un puerto en el host. La comunicación queda separada en dos redes:

- `web`: proxy, aplicaciones web y API.
- `data`: API y Redis. Esta red es interna.

## Ejecución local

Se necesita Docker con Docker Compose y el motor iniciado.

```powershell
docker compose up -d --build --wait
```

La aplicación queda disponible en [http://localhost:8080](http://localhost:8080) y la documentación de la API en [http://localhost:8080/docs](http://localhost:8080/docs).

Para consultar el estado de los servicios o detener el entorno:

```powershell
docker compose ps
docker compose down
```

`docker compose down` conserva el volumen de Redis. La opción `-v` también elimina ese volumen y, por lo tanto, los productos guardados.

## Prueba durante el coloquio

Una forma corta de mostrar el funcionamiento completo es:

1. Agregar un producto desde la web, marcarlo como comprado y eliminarlo.
2. Abrir **Visor Redis** para comprobar que la información fue guardada por la API en `superlist:items`.
3. Hacer varias solicitudes y observar `X-Upstream-Addr` y `X-API-Node` en las cabeceras de respuesta. Estas cabeceras permiten identificar el nodo que atendió cada petición.
4. Detener una réplica web y una réplica de API:

   ```powershell
   docker compose stop frontend backend
   ```

5. Repetir las operaciones desde la web. Las otras réplicas deben seguir respondiendo.
6. Restaurar las instancias detenidas:

   ```powershell
   docker compose start --wait frontend backend
   ```

Las cabeceras también se pueden consultar desde PowerShell:

```powershell
1..9 | ForEach-Object {
    (Invoke-WebRequest -UseBasicParsing http://localhost:8080/).Headers['X-Upstream-Addr']
    (Invoke-WebRequest -UseBasicParsing http://localhost:8080/api/health).Headers['X-API-Node']
}
```

La tolerancia a fallos solicitada cubre la caída de una instancia web o API. El proxy y Redis son instancias únicas en el entorno local.

## Servicios

| Servicio | Tecnología | Cantidad local | Función |
| --- | --- | ---: | --- |
| Proxy | Nginx | 1 | Punto de entrada y balanceo de carga |
| Web | HTML, CSS, JavaScript y Nginx | 3 | Interfaz de la lista y consumo de la API |
| API | FastAPI y Uvicorn | 3 | Reglas de la aplicación y acceso exclusivo a Redis |
| Datos | Redis 7 | 1 | Almacenamiento de productos y estado de compra |

La interfaz conserva en memoria la última lista recibida si todas las API dejan de responder, pero deshabilita las modificaciones. Cuando se recupera la conexión vuelve a cargar los datos desde Redis. No usa `localStorage` para persistir productos.

## API

| Método | Ruta | Uso |
| --- | --- | --- |
| `GET` | `/api/health` | Estado de la API y conexión con Redis |
| `GET` | `/api/items` | Obtener la lista |
| `POST` | `/api/items` | Agregar un producto |
| `PUT` | `/api/items/{id}` | Editar o cambiar el estado de un producto |
| `DELETE` | `/api/items/{id}` | Eliminar un producto |
| `DELETE` | `/api/items/completed/clear` | Eliminar los productos comprados |
| `GET` | `/api/redis/stats` | Consultar claves, tipos y datos para el visor de Redis |

Los productos se almacenan en el hash `superlist:items`. La API usa `HGETALL`, `HSET` y `HDEL` para recuperar, guardar y eliminar información.

## Integración continua

El workflow [ci.yml](.github/workflows/ci.yml) se ejecuta con cada push, pull request o ejecución manual. Incluye:

- tests de la API con `pytest` y `fakeredis`;
- tests del frontend con el runner de Node.js;
- cobertura de Python y JavaScript;
- análisis SAST del backend con Bandit;
- análisis de Python y JavaScript con SonarCloud cuando está configurado `SONAR_TOKEN`;
- publicación del resultado de SAST para el badge;
- notificación opcional a Discord mediante `DISCORD_WEBHOOK_URL`.

La valoración propia de Bandit es la siguiente:

| Valoración | Resultado |
| --- | --- |
| A | Sin hallazgos |
| B | Hallazgos de severidad baja |
| C | Hallazgos medios; el CI falla |
| D | Hallazgos altos; el CI falla |

Para ejecutar los controles principales en una máquina con Python y Node.js:

```powershell
python -m pip install -r requirements-dev.txt
python -m pytest -q
node --test tests/test_frontend.cjs
python -m bandit -r backend
```

## Imágenes en Docker Hub

Después de los tests y del SAST, el job `publish-docker` construye y publica las imágenes del frontend y del backend. Para habilitarlo se configuran estos secretos en GitHub Actions:

- `DOCKERHUB_USERNAME`: usuario de Docker Hub.
- `DOCKERHUB_TOKEN`: token de acceso con permiso de escritura.

Las imágenes se etiquetan como:

```text
<usuario>/superlist-frontend:latest
<usuario>/superlist-frontend:<sha-del-commit>
<usuario>/superlist-backend:latest
<usuario>/superlist-backend:<sha-del-commit>
```

La etiqueta con el SHA permite saber exactamente qué versión se publicó. En pull requests se ejecutan los controles, pero no se publican imágenes.

## Despliegue en la nube

La nube debe ejecutar las imágenes publicadas en Docker Hub, como pide la consigna. La configuración admite un frontend, una API y un Redis administrado; las réplicas en cloud quedan como mejora opcional.

Variables necesarias:

| Servicio | Variable | Valor |
| --- | --- | --- |
| Backend | `REDIS_URL` | URL de conexión entregada por Redis o Upstash |
| Frontend | `BACKEND_URL` | URL pública del backend, sin barra final |

Los secretos opcionales `RENDER_DEPLOY_HOOK_BACKEND` y `RENDER_DEPLOY_HOOK_FRONTEND` permiten que GitHub Actions solicite un nuevo despliegue en Render después de publicar las imágenes.

Antes de la entrega se deben registrar aquí las URLs que se usarán en el coloquio:

```text
Frontend: pendiente de completar
Backend:  pendiente de completar
Registry: pendiente de completar
```

La existencia del workflow y de las instrucciones no reemplaza la evidencia pedida por el profesor: las imágenes deben verse en la registry y la aplicación cloud debe responder desde una URL pública.

## Organización del repositorio

```text
backend/                 API, dependencias e imagen Docker
css/ y js/               interfaz web
nginx/default.conf       servidor del frontend y proxy hacia la API cloud
nginx/proxy.conf         balanceador del entorno local
scripts/                 cálculo SAST y demostración de tolerancia a fallos
tests/                   tests de API, frontend y valoración SAST
.github/workflows/ci.yml integración continua y publicación de imágenes
compose.yaml             arquitectura local completa
Dockerfile.frontend      imagen de la aplicación web
```

## Resultados, dificultades y mejoras

El entorno local integra los tres módulos solicitados y permite observar los datos reales de Redis desde la interfaz. Las tres réplicas web y API comparten estado y la aplicación continúa disponible cuando se detiene una de ellas.

Durante el armado fue necesario resolver el descubrimiento de servicios cuando Docker recrea contenedores, agregar healthchecks para ordenar el arranque y separar el estado confirmado por Redis del estado que el navegador conserva en memoria. También se mantuvieron las credenciales de Docker Hub, SonarCloud, Discord y Render fuera del repositorio mediante secretos de GitHub.

Como mejoras futuras quedan la alta disponibilidad de Redis y del proxy, autenticación de usuarios, pruebas end-to-end en navegador y réplicas de la aplicación en cloud.
