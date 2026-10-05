import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";
import { auth, db } from "../db/db.js";
import "../assets/style/dashboard.css";

/* ---------- Perfil: nombre y rol desde la colección "usuarios" ---------- */

// Busca primero por id de documento (uid) y si no, por los campos uid o email
async function buscarPerfil(u) {
  try {
    const porId = await getDoc(doc(db, "usuarios", u.uid));
    if (porId.exists()) return porId.data();

    for (const [campo, valor] of [
      ["uid", u.uid],
      ["email", u.email],
    ]) {
      if (!valor) continue;
      const snap = await getDocs(
        query(collection(db, "usuarios"), where(campo, "==", valor), limit(1))
      );
      if (!snap.empty) return snap.docs[0].data();
    }
  } catch (e) {
    console.log(e);
  }
  return null;
}

const ROLES = {
  admin: "Administrador",
  administrador: "Administrador",
  trabajador: "Trabajador",
};

const nombreDeRol = (rol = "") => {
  const r = String(rol).trim().toLowerCase();
  if (!r) return "";
  return ROLES[r] || r.charAt(0).toUpperCase() + r.slice(1);
};

const esAdmin = (rol = "") => ["admin", "administrador"].includes(String(rol).trim().toLowerCase());

const iniciales = (nombre = "") =>
  nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");

const saludo = () => {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
};

const hoyLargo = () => {
  const t = new Date().toLocaleDateString("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/* ---------- Iconos ---------- */

const Icono = ({ children, size = 24, ...rest }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...rest}
  >
    {children}
  </svg>
);

const IconGota = (p) => (
  <Icono {...p}>
    <path d="M12 3.5s6 6.3 6 10.4a6 6 0 01-12 0C6 9.800 12 3.500 12 3.500z" />
  </Icono>
);
const IconPersonas = (p) => (
  <Icono {...p}>
    <circle cx="9" cy="8.5" r="3.2" />
    <path d="M3.5 19c.4-3 2.6-4.8 5.5-4.8s5.100 1.800 5.500 4.800" />
    <path d="M15.500 5.700a3.200 3.200 0 010 5.600M17.500 14.500c1.800.600 2.800 2.100 3 4.500" />
  </Icono>
);
const IconCaja = (p) => (
  <Icono {...p}>
    <path d="M3.500 7.500L12 3l8.500 4.500v9L12 21l-8.500-4.500v-9z" />
    <path d="M3.500 7.500L12 12l8.500-4.500M12 12v9" />
  </Icono>
);
const IconVentas = (p) => (
  <Icono {...p}>
    <path d="M4 19V10M10 19V5M16 19v-7M21 19H3" />
  </Icono>
);
const IconCamion = (p) => (
  <Icono {...p}>
    <path d="M2.500 6.500h11v9h-11zM13.500 9.500h4l3 3v3h-7" />
    <circle cx="7" cy="17.500" r="1.800" />
    <circle cx="17" cy="17.500" r="1.800" />
  </Icono>
);
const IconFlecha = (p) => (
  <Icono {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icono>
);
const IconEscudo = (p) => (
  <Icono {...p}>
    <path d="M12 3l7 3v5.500c0 4.200-2.900 7.600-7 9.500-4.100-1.900-7-5.300-7-9.500V6l7-3z" />
    <path d="M9 12l2.200 2.200L15.500 10" />
  </Icono>
);
const IconUsuario = (p) => (
  <Icono {...p}>
    <circle cx="12" cy="8.500" r="3.500" />
    <path d="M5 20c.5-3.600 3.200-5.500 7-5.500s6.500 1.900 7 5.500" />
  </Icono>
);
const IconSalir = (p) => (
  <Icono {...p}>
    <path d="M14 4h4.500a1.500 1.500 0 011.500 1.500v13a1.500 1.500 0 01-1.500 1.500H14M10 8l-4 4 4 4M6 12h9" />
  </Icono>
);

/* ---------- Secciones ---------- */

const SECCIONES = [
  {
    title: "Combustible",
    sub: "Guías, campos, pesos y cargas por vehículo",
    ruta: "/combustible",
    tono: "fuel",
    Icono: IconGota,
  },
  {
    title: "Vehículos",
    sub: "Flota, SOAT y carretas",
    ruta: "/Vehículos",
    tono: "car",
    Icono: IconCamion,
  },
  {
    title: "Trabajadores",
    sub: "Equipo, roles y choferes",
    ruta: "/trabajadores",
    tono: "people",
    Icono: IconPersonas,
  },
  {
    title: "Productos",
    sub: "Catálogo e inventario",
    ruta: "/productos",
    tono: "box",
    Icono: IconCaja,
    pronto: true, // quita esta línea cuando exista la pantalla
  },
  {
    title: "Ventas",
    sub: "Pedidos y facturación",
    ruta: "/ventas",
    tono: "sales",
    Icono: IconVentas,
    pronto: true, // quita esta línea cuando exista la pantalla
  },
];

/* ---------- Pantalla ---------- */

function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [cargandoPerfil, setCargandoPerfil] = useState(true);

  useEffect(() => {
    let vivo = true;

    const stop = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        navigate("/"); // sin sesión, vuelve al login
        return;
      }
      setUser(u);
      setCargandoPerfil(true);
      const p = await buscarPerfil(u);
      if (!vivo) return;
      setPerfil(p);
      setCargandoPerfil(false);
    });

    return () => {
      vivo = false;
      stop();
    };
  }, [navigate]);

  const cerrarSesion = async () => {
    await signOut(auth);
    navigate("/");
  };

  const nombre = perfil?.nombre || user?.email?.split("@")[0] || "";
  const primerNombre = cargandoPerfil ? "" : nombre.split(" ")[0];
  const rol = nombreDeRol(perfil?.rol);
  const admin = esAdmin(perfil?.rol);

  return (
    <div className="dash-page">
      <header className="dash-topbar">
        <div className="dash-brand">
          <span className="dash-mark">
            <IconCaja size={18} />
          </span>
          <span className="dash-brand-text">Panel de control</span>
        </div>

        <div className="dash-user">
          {cargandoPerfil ? (
            <span className="dash-user-chip is-loading" aria-label="Cargando usuario" />
          ) : (
            nombre && (
              <span className="dash-user-chip">
                <span className="dash-user-avatar">{iniciales(nombre)}</span>
                <span className="dash-user-name">{nombre}</span>
              </span>
            )
          )}
          <button type="button" className="dash-logout" onClick={cerrarSesion}>
            <IconSalir size={16} />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </header>

      <main className="dash-content">
        <section className="dash-hero">
          <p className="dash-eyebrow">{hoyLargo()}</p>
          <h1 className="dash-title">
            {saludo()}
            {primerNombre ? `, ${primerNombre}` : ""}
          </h1>

          <div className="dash-role-row">
            {cargandoPerfil ? (
              <span className="dash-role is-loading" aria-label="Cargando rol" />
            ) : rol ? (
              <span className={`dash-role ${admin ? "is-admin" : "is-worker"}`}>
                {admin ? <IconEscudo size={16} /> : <IconUsuario size={16} />}
                {rol}
              </span>
            ) : null}
            <span className="dash-role-note">
              {admin
                ? "Tienes acceso completo al sistema."
                : rol
                ? "Accede a tus herramientas de trabajo."
                : ""}
            </span>
          </div>
        </section>

        <p className="dash-section-label">Accesos rápidos</p>

        <div className="dash-grid">
          {SECCIONES.map((s) => (
            <button
              type="button"
              key={s.title}
              className={`dash-card tone-${s.tono} ${s.pronto ? "is-soon" : ""}`}
              onClick={() => !s.pronto && navigate(s.ruta)}
              aria-disabled={s.pronto || undefined}
            >
              <span className="dash-card-icon">
                <s.Icono size={26} />
              </span>

              <span className="dash-card-text">
                <span className="dash-card-title">{s.title}</span>
                <span className="dash-card-sub">{s.sub}</span>
              </span>

              {s.pronto ? (
                <span className="dash-card-tag">Pronto</span>
              ) : (
                <span className="dash-card-go" aria-hidden="true">
                  <IconFlecha size={18} />
                </span>
              )}
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}

export default Dashboard;