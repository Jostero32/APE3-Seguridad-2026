const API_URL = "http://localhost:8080";

const $ = (selector) => document.querySelector(selector);

function getToken() {
  return localStorage.getItem("token");
}

function setToken(token) {
  localStorage.setItem("token", token);
}

function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("usuario");
}

function setUsuario(usuario) {
  localStorage.setItem("usuario", JSON.stringify(usuario));
}

function getUsuario() {
  try {
    return JSON.parse(localStorage.getItem("usuario"));
  } catch {
    return null;
  }
}

function showMessage(data, isError = false) {
  const box = $("#messageBox");
  if (!box) return;

  box.classList.remove("hidden");
  box.classList.toggle("error", isError);
  box.textContent =
    typeof data === "string" ? data : JSON.stringify(data, null, 2);
}

function authHeaders() {
  const token = getToken();

  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, options);

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = { error: "Respuesta no JSON" };
  }

  if (!response.ok) {
    throw {
      status: response.status,
      data,
    };
  }

  return data;
}

function requireAuth() {
  const token = getToken();

  if (!token) {
    window.location.href = "./index.html";
  }
}

function setupLogout() {
  const logoutBtn = $("#logoutBtn");

  if (!logoutBtn) return;

  logoutBtn.addEventListener("click", () => {
    clearSession();
    window.location.href = "./index.html";
  });
}


function setupLoginPage() {
  const loginForm = $("#loginForm");
  const loginAdminBtn = $("#loginAdminBtn");

  if (!loginForm) return;

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(loginForm);

    const payload = {
      email: formData.get("email"),
      password: formData.get("password"),
    };

    try {
      const data = await request("/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      setToken(data.token);
      setUsuario(data.usuario);

      showMessage({
        mensaje: "Login correcto",
        token: data.token,
        usuario: data.usuario,
      });

      setTimeout(() => {
        window.location.href = "./dashboard.html";
      }, 600);
    } catch (error) {
      showMessage(error.data ?? error, true);
    }
  });

  loginAdminBtn?.addEventListener("click", () => {
    $("#email").value = "admin@test.com";
    $("#password").value = "admin123";
  });
}


async function loadProfile() {
  const profileBox = $("#profileBox");

  if (!profileBox) return;

  try {
    const data = await request("/usuarios/me", {
      method: "GET",
      headers: authHeaders(),
    });

    setUsuario(data);

    profileBox.innerHTML = `
      <div class="profile-row">
        <span>ID</span>
        <strong>${data.id}</strong>
      </div>

      <div class="profile-row">
        <span>Nombre</span>
        <strong>${data.nombre}</strong>
      </div>

      <div class="profile-row">
        <span>Email</span>
        <strong>${data.email}</strong>
      </div>

      <div class="profile-row">
        <span>Rol</span>
        <strong class="role-pill">${data.rol}</strong>
      </div>
    `;

    const nombreInput = $("#nombre");
    const emailInput = $("#email");

    if (nombreInput) nombreInput.value = data.nombre;
    if (emailInput) emailInput.value = data.email;
  } catch (error) {
    showMessage(error.data ?? error, true);

    if (error.status === 401) {
      clearSession();
      setTimeout(() => {
        window.location.href = "./index.html";
      }, 800);
    }
  }
}

function setupDashboardPage() {
  const updateProfileForm = $("#updateProfileForm");

  if (!updateProfileForm) return;

  requireAuth();
  loadProfile();

  updateProfileForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(updateProfileForm);

    const payload = {};

    const nombre = formData.get("nombre");
    const email = formData.get("email");
    const password = formData.get("password");

    if (nombre) payload.nombre = nombre;
    if (email) payload.email = email;
    if (password) payload.password = password;

    try {
      const data = await request("/usuarios/me", {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });

      showMessage({
        mensaje: "Perfil actualizado",
        respuesta: data,
        nota: "Esta petición puede interceptarse con Burp Suite y agregar el campo rol.",
      });

      await loadProfile();
    } catch (error) {
      showMessage(error.data ?? error, true);
    }
  });
}


async function loadUsers() {
  const tbody = $("#usersTableBody");

  if (!tbody) return;

  try {
    const users = await request("/usuarios", {
      method: "GET",
      headers: authHeaders(),
    });

    if (!users.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5">No existen usuarios registrados.</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = users
      .map(
        (user) => `
      <tr>
        <td>${user.id}</td>
        <td>${user.nombre}</td>
        <td>${user.email}</td>
        <td><span class="role-pill">${user.rol}</span></td>
        <td>
          <button class="btn btn-danger btn-small" data-delete-id="${user.id}">
            Eliminar
          </button>
        </td>
      </tr>
    `,
      )
      .join("");

    document.querySelectorAll("[data-delete-id]").forEach((button) => {
      button.addEventListener("click", async () => {
        const id = button.getAttribute("data-delete-id");
        await deleteUser(id);
      });
    });
  } catch (error) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5">
          Error ${error.status ?? ""}: ${JSON.stringify(error.data ?? error)}
        </td>
      </tr>
    `;

    showMessage(error.data ?? error, true);
  }
}

async function deleteUser(id) {
  const confirmDelete = confirm(`¿Eliminar usuario con ID ${id}?`);

  if (!confirmDelete) return;

  try {
    const data = await request(`/usuarios/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    showMessage({
      mensaje: "Usuario eliminado",
      usuario: data,
    });

    await loadUsers();
  } catch (error) {
    showMessage(error.data ?? error, true);
  }
}

function setupAdminPage() {
  const createUserForm = $("#createUserForm");
  const reloadUsersBtn = $("#reloadUsersBtn");

  if (!createUserForm) return;

  requireAuth();
  loadUsers();

  reloadUsersBtn?.addEventListener("click", loadUsers);

  createUserForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(createUserForm);

    const payload = {
      nombre: formData.get("nombre"),
      email: formData.get("email"),
      password: formData.get("password"),
      rol: formData.get("rol"),
    };

    try {
      const data = await request("/usuarios", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });

      showMessage({
        mensaje: "Usuario creado",
        usuario: data,
      });

      createUserForm.reset();
      await loadUsers();
    } catch (error) {
      showMessage(error.data ?? error, true);
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setupLogout();
  setupLoginPage();
  setupDashboardPage();
  setupAdminPage();
});
