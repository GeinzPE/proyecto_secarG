import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../db/db.js";
import "../assets/style/trabajadores.css";

/* ---------- Utilidades ---------- */

const ROLES = [
  {
    value: "trabajador",
    label: "Trabajador",
    desc: "Acceso básico a sus tareas",
  },
  {
    value: "admin",
    label: "Administrador",
    desc: "Gestiona trabajadores y ajustes",
  },
];

const inicioDeDia = (fecha) =>
  new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());

const diasEntre = (desde, hasta) =>
  Math.round((inicioDeDia(hasta) - inicioDeDia(desde)) / 86400000);

// "2026-12-31" -> Date local (evita el desfase de zona horaria)
const leerFecha = (texto) => {
  const [y, m, d] = texto.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const dinero = (n) =>
  `S/ ${Number(n).toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fechaCorta = (texto) =>
  leerFecha(texto).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const textoDias = (n) => `${n} ${n === 1 ? "día" : "días"}`;

const estadoContrato = (vencimiento) => {
  const restan = diasEntre(new Date(), leerFecha(vencimiento));
  if (restan < 0)
    return {
      tipo: "vencido",
      texto: `Venció hace ${textoDias(Math.abs(restan))}`,
    };
  if (restan === 0) return { tipo: "pronto", texto: "Vence hoy" };
  if (restan <= 15)
    return { tipo: "pronto", texto: `Vence en ${textoDias(restan)}` };
  return { tipo: "vigente", texto: `Vence en ${textoDias(restan)}` };
};

const iniciales = (nombre) =>
  nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");

const FORM_VACIO = {
  nombre: "",
  dni: "",
  celular: "",
  rol: "trabajador",
  salario: "",
  vencimiento: "",
};

/* ---------- Selector personalizado ---------- */

function SelectorRol({ value, onChange }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef(null);
  const actual = ROLES.find((r) => r.value === value);

  useEffect(() => {
    const cerrarFuera = (e) => {
      if (caja.current && !caja.current.contains(e.target)) setAbierto(false);
    };
    document.addEventListener("mousedown", cerrarFuera);
    return () => document.removeEventListener("mousedown", cerrarFuera);
  }, []);

  const teclas = (e) => {
    if (e.key === "Escape") setAbierto(false);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const i = ROLES.findIndex((r) => r.value === value);
      const sig = e.key === "ArrowDown" ? i + 1 : i - 1;
      onChange(ROLES[(sig + ROLES.length) % ROLES.length].value);
    }
  };

  return (
    <div className="tr-select" ref={caja} onKeyDown={teclas}>
      <button
        type="button"
        className={`tr-select-btn ${abierto ? "is-open" : ""}`}
        onClick={() => setAbierto(!abierto)}
        aria-haspopup="listbox"
        aria-expanded={abierto}
      >
        <span className={`tr-dot tr-dot-${actual.value}`} />
        <span className="tr-select-text">
          <strong>{actual.label}</strong>
          <small>{actual.desc}</small>
        </span>
        <svg
          className="tr-chevron"
          width="16"
          height="16"
          viewBox="0 0 20 20"
          fill="none"
        >
          <path
            d="M5 8l5 5 5-5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {abierto && (
        <ul className="tr-select-list" role="listbox">
          {ROLES.map((r) => (
            <li
              key={r.value}
              role="option"
              aria-selected={r.value === value}
              className={r.value === value ? "is-selected" : ""}
              onClick={() => {
                onChange(r.value);
                setAbierto(false);
              }}
            >
              <span className={`tr-dot tr-dot-${r.value}`} />
              <span className="tr-select-text">
                <strong>{r.label}</strong>
                <small>{r.desc}</small>
              </span>
              {r.value === value && (
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M4 10.5l4 4 8-9"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- Pantalla principal ---------- */

function Trabajadores() {
  const [trabajadores, setTrabajadores] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [form, setForm] = useState(FORM_VACIO);
  const [errores, setErrores] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  // Lista en tiempo real
  useEffect(() => {
    let stopSnapshot = null;

    const stopAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setCargando(false);
        return;
      }

      const q = query(collection(db, "usuarios"), orderBy("creado", "desc"));
      stopSnapshot = onSnapshot(
        q,
        { includeMetadataChanges: true },
        (snap) => {
          setTrabajadores(
            snap.docs.map((d) => ({
              id: d.id,
              ...d.data({ serverTimestamps: "estimate" }),
              pendiente: d.metadata.hasPendingWrites,
            })),
          );
          setCargando(false);
        },
        (err) => {
          console.log(err);
          setCargando(false);
        },
      );
    });

    return () => {
      stopAuth();
      if (stopSnapshot) stopSnapshot();
    };
  }, []);

  const cambiar = (campo, valor) => {
    setForm((f) => ({ ...f, [campo]: valor }));
    setErrores((e) => ({ ...e, [campo]: "" }));
  };

  const soloNumeros = (campo, max) => (e) =>
    cambiar(campo, e.target.value.replace(/\D/g, "").slice(0, max));

  const validar = () => {
    const e = {};
    if (form.nombre.trim().length < 3) e.nombre = "Escribe el nombre completo";
    if (form.dni.length !== 8) e.dni = "El DNI tiene 8 dígitos";
    else if (trabajadores.some((t) => t.dni === form.dni))
      e.dni = "Este DNI ya está registrado";
    if (form.celular.length !== 9) e.celular = "El celular tiene 9 dígitos";
    if (!form.salario || Number(form.salario) <= 0)
      e.salario = "Ingresa un salario válido";
    if (!form.vencimiento) e.vencimiento = "Elige la fecha de vencimiento";
    else if (diasEntre(new Date(), leerFecha(form.vencimiento)) < 0)
      e.vencimiento = "La fecha ya pasó";
    setErrores(e);
    return Object.keys(e).length === 0;
  };

const guardar = (ev) => {
  ev.preventDefault();
  if (!validar()) return;

  const datos = {
    nombre: form.nombre.trim(),
    dni: form.dni,
    celular: form.celular,
    rol: form.rol,
    salario: Number(form.salario),
    vencimiento: form.vencimiento,
    creado: serverTimestamp(),
  };

  setForm(FORM_VACIO);

  addDoc(collection(db, "usuarios"), datos).catch((error) => {
    console.log(error);
    alert(error.message);
  });
};

  const eliminar = async (t) => {
    if (!window.confirm(`¿Eliminar a ${t.nombre}?`)) return;
    try {
      await deleteDoc(doc(db, "trabajadores", t.id));
    } catch (error) {
      console.log(error);
      alert(error.message);
    }
  };

  const filtrados = useMemo(() => {
    const b = busqueda.trim().toLowerCase();
    if (!b) return trabajadores;
    return trabajadores.filter(
      (t) => t.nombre.toLowerCase().includes(b) || t.dni.includes(b),
    );
  }, [trabajadores, busqueda]);

  const hoy = new Date().toLocaleDateString("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="tr-page">
      <header className="tr-header">
        <div>
          <h1>Trabajadores</h1>
          <p>{hoy}</p>
        </div>
        <div className="tr-total">
          <strong>{trabajadores.length}</strong>
          <span>
            {trabajadores.length === 1 ? "registrado" : "registrados"}
          </span>
        </div>
      </header>

      <div className="tr-layout">
        {/* ---------- Formulario ---------- */}
        <form className="tr-form" onSubmit={guardar} noValidate>
          <h2>Nuevo trabajador</h2>

          <div className={`tr-field ${errores.nombre ? "has-error" : ""}`}>
            <label htmlFor="nombre">Nombre completo</label>
            <input
              id="nombre"
              type="text"
              placeholder="Ej. María Quispe Rojas"
              value={form.nombre}
              onChange={(e) => cambiar("nombre", e.target.value)}
            />
            {errores.nombre && (
              <span className="tr-error">{errores.nombre}</span>
            )}
          </div>

          <div className="tr-row">
            <div className={`tr-field ${errores.dni ? "has-error" : ""}`}>
              <label htmlFor="dni">DNI</label>
              <input
                id="dni"
                type="text"
                inputMode="numeric"
                placeholder="8 dígitos"
                value={form.dni}
                onChange={soloNumeros("dni", 8)}
              />
              {errores.dni && <span className="tr-error">{errores.dni}</span>}
            </div>

            <div className={`tr-field ${errores.celular ? "has-error" : ""}`}>
              <label htmlFor="celular">Celular</label>
              <input
                id="celular"
                type="text"
                inputMode="numeric"
                placeholder="9 dígitos"
                value={form.celular}
                onChange={soloNumeros("celular", 9)}
              />
              {errores.celular && (
                <span className="tr-error">{errores.celular}</span>
              )}
            </div>
          </div>

          <div className="tr-field">
            <label>Rol</label>
            <SelectorRol value={form.rol} onChange={(v) => cambiar("rol", v)} />
          </div>

          <div className="tr-row">
            <div className={`tr-field ${errores.salario ? "has-error" : ""}`}>
              <label htmlFor="salario">Salario mensual</label>
              <div className="tr-money">
                <span>S/</span>
                <input
                  id="salario"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={form.salario}
                  onChange={(e) => cambiar("salario", e.target.value)}
                />
              </div>
              {errores.salario && (
                <span className="tr-error">{errores.salario}</span>
              )}
            </div>

            <div
              className={`tr-field ${errores.vencimiento ? "has-error" : ""}`}
            >
              <label htmlFor="vencimiento">Vence el contrato</label>
              <input
                id="vencimiento"
                type="date"
                value={form.vencimiento}
                onChange={(e) => cambiar("vencimiento", e.target.value)}
              />
              {errores.vencimiento && (
                <span className="tr-error">{errores.vencimiento}</span>
              )}
            </div>
          </div>

   <button className="tr-submit" type="submit">
  Agregar trabajador
</button>
          <p className="tr-hint">
            Los días trabajados se cuentan desde que lo agregas.
          </p>
        </form>

        {/* ---------- Lista ---------- */}
        <section className="tr-list-wrap">
          <div className="tr-search">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <circle
                cx="9"
                cy="9"
                r="5.5"
                stroke="currentColor"
                strokeWidth="1.7"
              />
              <path
                d="M13.5 13.5L17 17"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
            <input
              type="text"
              placeholder="Buscar por nombre o DNI"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>

          {cargando ? (
            <p className="tr-empty">Cargando trabajadores…</p>
          ) : filtrados.length === 0 ? (
            <p className="tr-empty">
              {trabajadores.length === 0
                ? "Aún no hay trabajadores. Agrega el primero desde el formulario."
                : "No hay resultados para tu búsqueda."}
            </p>
          ) : (
            <ul className="tr-list">
              {filtrados.map((t) => {
                // creado es null un instante mientras el servidor confirma la fecha
                const ingreso = t.creado?.toDate
                  ? t.creado.toDate()
                  : new Date();
                const dias = Math.max(0, diasEntre(ingreso, new Date()));
                const contrato = estadoContrato(t.vencimiento);

                return (
        <li key={t.id} className={`tr-card ${t.pendiente ? "is-pending" : ""}`}>
                    <div className="tr-avatar">{iniciales(t.nombre)}</div>

                    <div className="tr-info">
                      <div className="tr-name">
                        <h3>{t.nombre}</h3>
                        <span className={`tr-badge tr-badge-${t.rol}`}>
                          {t.rol === "admin" ? "Administrador" : "Trabajador"}
                        </span>
                      </div>
                      <p className="tr-meta tr-meta-split">
                        <span>DNI {t.dni}</span>
                        <span>Cel. {t.celular}</span>
                      </p>
                      <p className="tr-meta">{dinero(t.salario)} al mes</p>
                      <p className={`tr-contrato is-${contrato.tipo}`}>
                        <span className="tr-pulse" />
                        {contrato.texto} ({fechaCorta(t.vencimiento)})
                      </p>
                    </div>

                  {t.pendiente ? (
  <div className="tr-days tr-days-pending">
    <span className="tr-spinner" />
    <span>Agregando…</span>
  </div>
) : (
  <div className="tr-days">
    <strong>{dias}</strong>
    <span>{dias === 1 ? "día trabajado" : "días trabajados"}</span>
  </div>
)}

                <button
  type="button"
  className="tr-delete"
  onClick={() => eliminar(t)}
  disabled={t.pendiente}
  aria-label={`Eliminar a ${t.nombre}`}
  title="Eliminar"
>
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 20 20"
                        fill="none"
                      >
                        <path
                          d="M5 6h10M8 6V4h4v2M6.5 6l.6 10h5.8l.6-10"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

export default Trabajadores;
