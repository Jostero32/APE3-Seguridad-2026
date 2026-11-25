# APE3 · Gestión de usuarios con roles

Práctica de la asignatura de **Seguridad** (mayo de 2026): una API de usuarios con roles en **Node.js**
(módulo `http`, sin frameworks) sobre **PostgreSQL**, y un frontend estático con inicio de sesión, panel
del usuario y panel de administración.

## Funcionalidades

| Método | Ruta | Acceso |
|---|---|---|
| `GET` | `/salud` | Público |
| `POST` | `/auth/login` | Público: devuelve un token de sesión |
| `GET` · `PUT` | `/usuarios/me` | Usuario autenticado |
| `GET` · `POST` | `/usuarios` | Administrador |
| `GET` · `PUT` · `DELETE` | `/usuarios/{id}` | Administrador |

El frontend (`Frontend/`) tiene `index.html` (login), `dashboard.html` (usuario) y `admin.html`
(administración).

## Ejecutar

```bash
docker compose up -d --build      # API en http://localhost:8080 · PostgreSQL en localhost:5555
```

Al arrancar, el backend crea la tabla `usuarios` y dos cuentas de ejemplo. Para ejecutar el backend fuera
de Docker, copie `Backend/.env.example` a `Backend/.env` y ajuste la conexión.

## Advertencia

Es un ejercicio académico y **no** debe usarse tal cual en producción: las contraseñas se guardan en texto
plano y las sesiones viven en memoria. Los siguientes pasos naturales serían hashear con bcrypt o
Argon2, firmar tokens con expiración y limitar los intentos de inicio de sesión.
