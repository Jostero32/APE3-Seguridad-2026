import "dotenv/config";
import http from "http";
import crypto from "crypto";
import pg from "pg";
const { Pool } = pg;
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "usuarios",
  user: process.env.DB_USER || "jostero32",
  password: process.env.DB_PASS || "1234",
  port: Number(process.env.DB_PORT) || 5432,
});

// sesiones en memoria: token -> fila de usuario
const sesiones = new Map();

// --- DB init ---
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id       SERIAL PRIMARY KEY,
      nombre   TEXT NOT NULL,
      email    TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      rol      TEXT NOT NULL DEFAULT 'usuario'
    )
  `);
  await pool.query(`
    INSERT INTO usuarios (nombre, email, password, rol) VALUES
      ('Admin',   'admin@test.com',   'admin123', 'admin'),
      ('Usuario', 'usuario@test.com', 'pass123',  'usuario')
    ON CONFLICT (email) DO NOTHING
  `);
}

// --- auth helpers ---
function generarToken() {
  return crypto.randomBytes(16).toString("hex");
}

function obtenerSesion(req) {
  const auth = req.headers["authorization"] || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  return token ? (sesiones.get(token) ?? null) : null;
}

function esAdmin(req) {
  return obtenerSesion(req)?.rol === "admin";
}

// --- HTTP helpers ---
function enviarJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(body);
}

function parsearBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      if (!data) return resolve(null);
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("JSON inválido"));
      }
    });
    req.on("error", reject);
  });
}

// --- servidor ---
const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host}`);
  const method = req.method;

  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    return res.end();
  }

  // GET /salud
  if (method === "GET" && pathname === "/salud") {
    return enviarJson(res, 200, { ok: true });
  }

  // ── AUTH ────────────────────────────────────────────────────────────────

  // POST /auth/login
  if (method === "POST" && pathname === "/auth/login") {
    try {
      const body = await parsearBody(req);
      const { rows } = await pool.query(
        "SELECT * FROM usuarios WHERE email = $1 AND password = $2",
        [body?.email, body?.password],
      );
      if (rows.length === 0)
        return enviarJson(res, 401, { error: "Credenciales inválidas" });

      const usuario = rows[0];
      const token = generarToken();
      sesiones.set(token, usuario);
      return enviarJson(res, 200, {
        token,
        usuario: {
          id: usuario.id,
          nombre: usuario.nombre,
          email: usuario.email,
          rol: usuario.rol,
        },
      });
    } catch {
      return enviarJson(res, 400, { error: "JSON inválido" });
    }
  }

  // ── /usuarios/me ────────────────────────────────────────────────────────

  // GET /usuarios/me
  if (method === "GET" && pathname === "/usuarios/me") {
    const yo = obtenerSesion(req);
    if (!yo) return enviarJson(res, 401, { error: "No autenticado" });
    return enviarJson(res, 200, {
      id: yo.id,
      nombre: yo.nombre,
      email: yo.email,
      rol: yo.rol,
    });
  }

  // PUT /usuarios/me  ⚠ VULNERABLE: acepta cualquier campo del body, incluyendo "rol"
  if (method === "PUT" && pathname === "/usuarios/me") {
    const yo = obtenerSesion(req);
    if (!yo) return enviarJson(res, 401, { error: "No autenticado" });
    try {
      const body = await parsearBody(req);
      if (!body) return enviarJson(res, 400, { error: "Cuerpo vacío" });

      const campos = ["nombre", "email", "password", "rol"];
      const updates = campos.filter((c) => body[c] !== undefined);
      if (updates.length === 0)
        return enviarJson(res, 400, { error: "Nada que actualizar" });

      const sets = updates.map((c, i) => `${c} = $${i + 1}`).join(", ");
      const vals = updates.map((c) => body[c]);
      const { rows } = await pool.query(
        `UPDATE usuarios SET ${sets} WHERE id = $${updates.length + 1} RETURNING id, nombre, email, rol`,
        [...vals, yo.id],
      );

      // actualizar la sesión en memoria con los nuevos datos
      sesiones.set(obtenerToken(req), { ...yo, ...rows[0] });
      return enviarJson(res, 200, rows[0]);
    } catch {
      return enviarJson(res, 400, { error: "JSON inválido" });
    }
  }

  // ── CRUD usuarios (solo admin) ───────────────────────────────────────────

  // GET /usuarios
  if (method === "GET" && pathname === "/usuarios") {
    if (!esAdmin(req)) return enviarJson(res, 403, { error: "Solo admins" });
    const { rows } = await pool.query(
      "SELECT id, nombre, email, rol FROM usuarios ORDER BY id",
    );
    return enviarJson(res, 200, rows);
  }

  // GET /usuarios/:id
  if (method === "GET" && pathname.startsWith("/usuarios/")) {
    if (!esAdmin(req)) return enviarJson(res, 403, { error: "Solo admins" });
    const id = pathname.split("/")[2];
    const { rows } = await pool.query(
      "SELECT id, nombre, email, rol FROM usuarios WHERE id = $1",
      [id],
    );
    if (rows.length === 0)
      return enviarJson(res, 404, { error: "No encontrado" });
    return enviarJson(res, 200, rows[0]);
  }

  // POST /usuarios
  if (method === "POST" && pathname === "/usuarios") {
    if (!esAdmin(req)) return enviarJson(res, 403, { error: "Solo admins" });
    try {
      const body = await parsearBody(req);
      if (!body?.nombre || !body?.email || !body?.password) {
        return enviarJson(res, 400, {
          error: "nombre, email y password son requeridos",
        });
      }
      const { rows } = await pool.query(
        `INSERT INTO usuarios (nombre, email, password, rol) VALUES ($1,$2,$3,$4)
         RETURNING id, nombre, email, rol`,
        [body.nombre, body.email, body.password, body.rol ?? "usuario"],
      );
      return enviarJson(res, 201, rows[0]);
    } catch (e) {
      if (e.code === "23505")
        return enviarJson(res, 409, { error: "Email ya registrado" });
      return enviarJson(res, 400, { error: "JSON inválido" });
    }
  }

  // PUT /usuarios/:id
  if (method === "PUT" && pathname.startsWith("/usuarios/")) {
    if (!esAdmin(req)) return enviarJson(res, 403, { error: "Solo admins" });
    try {
      const id = pathname.split("/")[2];
      const body = await parsearBody(req);
      if (!body) return enviarJson(res, 400, { error: "Cuerpo vacío" });
      const { rows } = await pool.query(
        `UPDATE usuarios SET
           nombre   = COALESCE($1, nombre),
           email    = COALESCE($2, email),
           password = COALESCE($3, password),
           rol      = COALESCE($4, rol)
         WHERE id = $5 RETURNING id, nombre, email, rol`,
        [
          body.nombre ?? null,
          body.email ?? null,
          body.password ?? null,
          body.rol ?? null,
          id,
        ],
      );
      if (rows.length === 0)
        return enviarJson(res, 404, { error: "No encontrado" });
      return enviarJson(res, 200, rows[0]);
    } catch {
      return enviarJson(res, 400, { error: "JSON inválido" });
    }
  }

  // DELETE /usuarios/:id
  if (method === "DELETE" && pathname.startsWith("/usuarios/")) {
    if (!esAdmin(req)) return enviarJson(res, 403, { error: "Solo admins" });
    const id = pathname.split("/")[2];
    const { rows } = await pool.query(
      "DELETE FROM usuarios WHERE id = $1 RETURNING id, nombre, email, rol",
      [id],
    );
    if (rows.length === 0)
      return enviarJson(res, 404, { error: "No encontrado" });
    return enviarJson(res, 200, rows[0]);
  }

  enviarJson(res, 404, { error: "Ruta no encontrada" });
});

// helper interno para refrescar sesión
function obtenerToken(req) {
  const auth = req.headers["authorization"] || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : null;
}

initDB()
  .then(() =>
    server.listen(PORT, () => console.log(`http://localhost:${PORT}`)),
  )
  .catch((err) => {
    console.error("Error DB:", err);
    process.exit(1);
  });
