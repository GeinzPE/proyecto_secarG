import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../db/db.js";
import "../assets/style/conbustible.css";

// Colecciones (cámbialas aquí si hace falta)
const COL_CONTROL = "control_conbustible";
const COL_VEHICULOS = "veiculo";

const VENTANAS = [
  { id: "todas", label: "Todo", dias: null },
  { id: "semana", label: "7 días", dias: 7 },
  { id: "mes", label: "30 días", dias: 30 },
  { id: "trimestre", label: "90 días", dias: 90 },
];

/* ---------- Utilidades ---------- */

const p2 = (n) => String(n).padStart(2, "0");
const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
};
const ahoraHM = () => {
  const d = new Date();
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
};
// "2026-09-09" -> "9/9/2026" (mismo formato que ya guardas)
const aTexto = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${Number(d)}/${Number(m)}/${y}`;
};
// "9/9/2026" -> Date
function parseFecha(t) {
  if (!t || typeof t !== "string") return null;
  const [d, m, y] = t.split("/").map(Number);
  return d && m && y ? new Date(y, m - 1, d, 12) : null;
}
// "9/9/2026" -> "2026-09-09"
const aInput = (t) => {
  const f = parseFecha(t);
  return f ? `${f.getFullYear()}-${p2(f.getMonth() + 1)}-${p2(f.getDate())}` : "";
};
const inicioDeDia = (f) => new Date(f.getFullYear(), f.getMonth(), f.getDate());
const diasEntre = (desde, hasta) =>
  Math.round((inicioDeDia(hasta) - inicioDeDia(desde)) / 86400000);

const num = (v) => (v === "" || v == null ? 0 : Number(v) || 0);
const redondear = (n) => Math.round(n * 100) / 100;
const fmt = (n) => Number(n || 0).toLocaleString("es-PE", { maximumFractionDigits: 2 });

const iniciales = (nombre = "") =>
  nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");

const alertar = (error) => {
  console.log(error);
  alert(error.message);
};

// Fecha de ordenamiento: creado, o fecha + hora si el documento es antiguo
const orden = (r) => {
  if (r.creado?.toDate) return r.creado.toDate().getTime();
  const f = parseFecha(r.fecha);
  if (!f) return 0;
  const [h, m] = (r.hora || "0:0").split(":").map(Number);
  return f.getTime() + (h || 0) * 3600000 + (m || 0) * 60000;
};

const formVacio = () => ({
  vehiculoId: "",
  nguia: "",
  flete: "",
  fecha: hoyISO(),
  hora: ahoraHM(),
  cod_campo: "",
  lugar: "",
  nombre: "",
  peso1: "",
  peso2: "",
  usaComb: false,
  combFecha: hoyISO(),
  combHora: ahoraHM(),
});

/* ---------- Iconos ---------- */

const Icono = ({ children, size = 18, ...rest }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
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
const IconMas = (p) => (
  <Icono {...p}>
    <path d="M10 4v12M4 10h12" />
  </Icono>
);
const IconCerrar = (p) => (
  <Icono {...p}>
    <path d="M5 5l10 10M15 5L5 15" />
  </Icono>
);
const IconEditar = (p) => (
  <Icono {...p}>
    <path d="M13.5 3.5l3 3L7 16H4v-3l9.5-9.5z" />
  </Icono>
);
const IconBasura = (p) => (
  <Icono {...p}>
    <path d="M4.5 6h11M8 6V4h4v2M6 6l.7 10h6.6L14 6" />
  </Icono>
);
const IconAtras = (p) => (
  <Icono {...p}>
    <path d="M12 5l-5 5 5 5" />
  </Icono>
);
const IconBuscar = (p) => (
  <Icono {...p}>
    <circle cx="9" cy="9" r="5.5" />
    <path d="M13.5 13.5L17 17" />
  </Icono>
);
const IconFlecha = (p) => (
  <Icono {...p}>
    <path d="M5 8l5 5 5-5" />
  </Icono>
);
const IconGota = (p) => (
  <Icono {...p}>
    <path d="M10 3s5 5.2 5 8.6A5 5 0 015 11.6C5 8.2 10 3 10 3z" />
  </Icono>
);

/* ---------- Panel lateral (en celular sube desde abajo) ---------- */

function Panel({ abierto, onCerrar, titulo, children }) {
  useEffect(() => {
    if (!abierto) return;
    const tecla = (e) => e.key === "Escape" && onCerrar();
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  return (
    <div
      className="cb-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}
    >
      <aside className="cb-panel" role="dialog" aria-modal="true" aria-label={titulo}>
        {children}
      </aside>
    </div>
  );
}

/* ---------- Selector de vehículo (placa + chofer) ---------- */

function SelectorVehiculo({ value, opciones, onChange }) {
  const [abierto, setAbierto] = useState(false);
  const [filtro, setFiltro] = useState("");
  const caja = useRef(null);

  useEffect(() => {
    const cerrarFuera = (e) => {
      if (caja.current && !caja.current.contains(e.target)) setAbierto(false);
    };
    document.addEventListener("mousedown", cerrarFuera);
    return () => document.removeEventListener("mousedown", cerrarFuera);
  }, []);

  const sel = opciones.find((v) => v.id === value);
  const lista = useMemo(() => {
    const t = filtro.trim().toLowerCase();
    if (!t) return opciones;
    return opciones.filter(
      (v) => v.placa.toLowerCase().includes(t) || v.chofer.toLowerCase().includes(t)
    );
  }, [opciones, filtro]);

  return (
    <div
      className="cb-select"
      ref={caja}
      onKeyDown={(e) => {
        if (e.key === "Escape" && abierto) {
          e.stopPropagation();
          setAbierto(false);
        }
      }}
    >
      <button
        type="button"
        className={`cb-select-btn ${abierto ? "is-open" : ""}`}
        onClick={() => setAbierto(!abierto)}
        aria-haspopup="listbox"
        aria-expanded={abierto}
      >
        {sel ? (
          <>
            <span className="cb-plate cb-plate-mini">{sel.placa}</span>
            <span className="cb-select-text">{sel.chofer || "Sin chofer"}</span>
          </>
        ) : (
          <span className="cb-select-text cb-placeholder">Elige un vehículo</span>
        )}
        <IconFlecha className="cb-chevron" size={16} />
      </button>

      {abierto && (
        <div className="cb-select-pop">
          <input
            type="text"
            className="cb-select-search"
            placeholder="Buscar placa o chofer"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
          />
          <ul className="cb-select-list" role="listbox">
            {lista.length === 0 ? (
              <li className="cb-select-empty">No hay vehículos que coincidan.</li>
            ) : (
              lista.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={v.id === value}
                    className={v.id === value ? "is-selected" : ""}
                    onClick={() => {
                      onChange(v.id);
                      setAbierto(false);
                      setFiltro("");
                    }}
                  >
                    <span className="cb-plate cb-plate-mini">{v.placa || "S/P"}</span>
                    <span className="cb-select-text">{v.chofer || "Sin chofer"}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ---------- Pantalla principal ---------- */

function ControlCombustible() {
  const navigate = useNavigate();

  const [registros, setRegistros] = useState([]);
  const [vehiculos, setVehiculos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");

  const [panel, setPanel] = useState(false);
  const [form, setForm] = useState(formVacio);
  const [errores, setErrores] = useState({});
  const [editando, setEditando] = useState(null);

  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [ventanaId, setVentanaId] = useState("todas");

  // Registros y vehículos en tiempo real (espera a que Firebase restaure la sesión)
  useEffect(() => {
    let stops = [];

    const stopAuth = onAuthStateChanged(auth, (user) => {
      stops.forEach((s) => s());
      stops = [];

      if (!user) {
        setCargando(false);
        return;
      }

      stops.push(
        onSnapshot(
          collection(db, COL_CONTROL),
          { includeMetadataChanges: true },
          (snap) => {
            const lista = snap.docs
              .map((d) => ({
                ...d.data({ serverTimestamps: "estimate" }),
                id: d.id,
                pendiente: d.metadata.hasPendingWrites,
              }))
              .sort((a, b) => orden(b) - orden(a));
            setRegistros(lista);
            setErrorCarga("");
            setCargando(false);
          },
          (err) => {
            console.log(err);
            setErrorCarga(
              err.code === "permission-denied"
                ? "No tienes permisos para ver el control de combustible. Revisa las reglas de Firestore."
                : err.message
            );
            setCargando(false);
          }
        )
      );

      stops.push(
        onSnapshot(
          collection(db, COL_VEHICULOS),
          (snap) =>
            setVehiculos(
              snap.docs
                .map((d) => ({
                  id: d.id,
                  placa: d.data().placa || "",
                  chofer: d.data().chofer || "",
                }))
                .sort((a, b) => a.placa.localeCompare(b.placa))
            ),
          (err) => console.log(err)
        )
      );
    });

    return () => {
      stopAuth();
      stops.forEach((s) => s());
    };
  }, []);

  const cambiar = (campo, valor) => {
    setForm((f) => ({ ...f, [campo]: valor }));
    setErrores((e) => ({ ...e, [campo]: "" }));
  };

  const cerrarPanel = useCallback(() => {
    setPanel(false);
    setForm(formVacio());
    setErrores({});
    setEditando(null);
  }, []);

  const abrirNuevo = () => {
    setForm(formVacio());
    setErrores({});
    setEditando(null);
    setPanel(true);
  };

  const iniciarEdicion = (r) => {
    const veh =
      vehiculos.find((v) => v.id === r.vehiculo_id) ||
      vehiculos.find((v) => v.placa === r.n_carro);
    setForm({
      vehiculoId: veh?.id || "",
      nguia: r.nguia || "",
      flete: r.flete ?? "",
      fecha: aInput(r.fecha) || hoyISO(),
      hora: r.hora || ahoraHM(),
      cod_campo: r.campo?.cod_campo || "",
      lugar: r.campo?.lugar || "",
      nombre: r.campo?.nombre || "",
      peso1: r.peso?.peso1 ?? "",
      peso2: r.peso?.peso2 ?? "",
      usaComb: !!r.combustible,
      combFecha: aInput(r.combustible?.fecha) || hoyISO(),
      combHora: r.combustible?.hora || ahoraHM(),
    });
    setErrores({});
    setEditando(r.id);
    setPanel(true);
  };

  const total = redondear(num(form.peso1) + num(form.peso2));

  // Campos usados antes, para rellenar con un toque
  const camposRecientes = useMemo(() => {
    const vistos = new Map();
    registros.forEach((r) => {
      const c = r.campo;
      if (c?.cod_campo && !vistos.has(c.cod_campo)) vistos.set(c.cod_campo, c);
    });
    return [...vistos.values()].slice(0, 6);
  }, [registros]);

  const validar = () => {
    const e = {};
    if (!form.vehiculoId) e.vehiculoId = "Elige un vehículo";
    if (!form.nguia.trim()) e.nguia = "Escribe el número de guía";
    if (!form.fecha) e.fecha = "Elige la fecha";
    if (!form.hora) e.hora = "Elige la hora";
    if (!form.cod_campo.trim()) e.cod_campo = "Escribe el código del campo";
    if (form.usaComb && (!form.combFecha || !form.combHora))
      e.comb = "Completa la fecha y la hora de la carga";
    setErrores(e);
    return Object.keys(e).length === 0;
  };

  const guardar = (ev) => {
    ev.preventDefault();
    if (!validar()) return;

    const veh = vehiculos.find((v) => v.id === form.vehiculoId);
    if (!veh) return;

    const datos = {
      n_carro: veh.placa,
      chofer: veh.chofer,
      vehiculo_id: veh.id,
      nguia: form.nguia.trim(),
      flete: num(form.flete),
      fecha: aTexto(form.fecha),
      hora: form.hora,
      campo: {
        cod_campo: form.cod_campo.trim(),
        lugar: form.lugar.trim(),
        nombre: form.nombre.trim(),
      },
      peso: { peso1: num(form.peso1), peso2: num(form.peso2), total },
    };
    const combustible = form.usaComb
      ? { fecha: aTexto(form.combFecha), hora: form.combHora }
      : null;

    // No esperamos al servidor: la tarjeta aparece al instante como "Guardando…"
    let promesa;
    if (editando) {
      promesa = updateDoc(doc(db, COL_CONTROL, editando), {
        ...datos,
        combustible: combustible || deleteField(),
      });
    } else {
      const ref = doc(collection(db, COL_CONTROL)); // el id del campo = id del documento
      promesa = setDoc(ref, {
        ...datos,
        ...(combustible ? { combustible } : {}),
        id: ref.id,
        uid: auth.currentUser?.uid || null,
        creado: serverTimestamp(),
      });
    }

    promesa.catch(alertar);
    cerrarPanel();
  };

  const eliminar = (r) => {
    if (!window.confirm(`¿Eliminar la guía ${r.nguia}?`)) return;
    if (editando === r.id) cerrarPanel();
    deleteDoc(doc(db, COL_CONTROL, r.id)).catch(alertar);
  };

  /* ---------- Filtros ---------- */

  const hoyTexto = aTexto(hoyISO());

  const conteo = useMemo(
    () => ({
      todos: registros.length,
      hoy: registros.filter((r) => r.fecha === hoyTexto).length,
      con: registros.filter((r) => !!r.combustible).length,
      sin: registros.filter((r) => !r.combustible).length,
    }),
    [registros, hoyTexto]
  );

  const ventana = VENTANAS.find((v) => v.id === ventanaId);

  const filtrados = useMemo(() => {
    const b = busqueda.trim().toLowerCase();
    return registros.filter((r) => {
      if (filtro === "hoy" && r.fecha !== hoyTexto) return false;
      if (filtro === "con" && !r.combustible) return false;
      if (filtro === "sin" && r.combustible) return false;

      if (ventana.dias !== null) {
        const f = parseFecha(r.fecha);
        if (!f || diasEntre(f, new Date()) > ventana.dias) return false;
      }

      if (!b) return true;
      return [r.n_carro, r.chofer, r.nguia, r.campo?.cod_campo, r.campo?.nombre, r.campo?.lugar]
        .filter(Boolean)
        .some((t) => String(t).toLowerCase().includes(b));
    });
  }, [registros, busqueda, filtro, ventana, hoyTexto]);

  const KPIS = [
    { id: "todos", label: "Total" },
    { id: "hoy", label: "Hoy" },
    { id: "con", label: "Con combustible" },
    { id: "sin", label: "Sin combustible" },
  ];

  const hayFiltros = filtro !== "todos" || ventanaId !== "todas" || busqueda.trim() !== "";
  const limpiarFiltros = () => {
    setFiltro("todos");
    setVentanaId("todas");
    setBusqueda("");
  };

  return (
    <div className="cb-page">
      <div className="cb-wrap">
        {/* ---------- Encabezado ---------- */}
        <header className="cb-top">
          <div>
            <button type="button" className="cb-back" onClick={() => navigate("/dashboard")}>
              <IconAtras size={16} />
              Volver al panel
            </button>
            <h1>Control de combustible</h1>
            <p>Guías, campos, pesos y cargas de combustible por vehículo.</p>
          </div>

          <button type="button" className="cb-btn cb-btn-primary" onClick={abrirNuevo}>
            <IconMas size={18} />
            Nuevo registro
          </button>
        </header>

        {/* ---------- Resumen que también filtra ---------- */}
        <div className="cb-kpis" role="group" aria-label="Filtrar registros">
          {KPIS.map((k) => (
            <button
              key={k.id}
              type="button"
              aria-pressed={filtro === k.id}
              className={`cb-kpi cb-kpi-${k.id} ${filtro === k.id ? "is-active" : ""}`}
              onClick={() => setFiltro(k.id)}
            >
              <span className="cb-kpi-label">
                <i />
                {k.label}
              </span>
              <strong>{conteo[k.id]}</strong>
            </button>
          ))}
        </div>

        {/* ---------- Búsqueda y rango ---------- */}
        <div className="cb-toolbar">
          <label className="cb-search">
            <IconBuscar size={18} />
            <input
              type="text"
              placeholder="Buscar por placa, chofer, guía o campo"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </label>

          <div className="cb-window">
            <span>Últimos</span>
            <div className="cb-seg" role="group" aria-label="Rango de fechas">
              {VENTANAS.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  aria-pressed={ventanaId === w.id}
                  className={ventanaId === w.id ? "is-active" : ""}
                  onClick={() => setVentanaId(w.id)}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ---------- Lista ---------- */}
        {errorCarga ? (
          <p className="cb-empty cb-empty-error">{errorCarga}</p>
        ) : cargando ? (
          <p className="cb-empty">Cargando registros…</p>
        ) : filtrados.length === 0 ? (
          <div className="cb-empty">
            {conteo.todos === 0 ? (
              <>
                <p>Aún no hay registros de combustible.</p>
                <button type="button" className="cb-btn cb-btn-primary" onClick={abrirNuevo}>
                  <IconMas size={18} />
                  Agregar el primero
                </button>
              </>
            ) : (
              <>
                <p>Ningún registro coincide con estos filtros.</p>
                {hayFiltros && (
                  <button type="button" className="cb-btn cb-btn-ghost" onClick={limpiarFiltros}>
                    Quitar filtros
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          <ul className="cb-list">
            {filtrados.map((r) => {
              const tiene = !!r.combustible;
              return (
                <li
                  key={r.id}
                  className={`cb-card ${tiene ? "is-con" : "is-sin"} ${
                    r.pendiente ? "is-pending" : ""
                  }`}
                >
                  {r.pendiente && (
                    <div className="cb-saving">
                      <span className="cb-spinner" />
                      Guardando…
                    </div>
                  )}

                  <div className="cb-card-head">
                    <span className="cb-plate">
                      <i />
                      {r.n_carro}
                      <i />
                    </span>
                    <span className={`cb-estado ${tiene ? "is-con" : "is-sin"}`}>
                      {tiene ? "Con combustible" : "Sin combustible"}
                    </span>
                  </div>

                  <div className="cb-card-body">
                    <div className="cb-chofer">
                      <span className="cb-avatar">{iniciales(r.chofer)}</span>
                      <div>
                        <strong>{r.chofer || "Sin chofer"}</strong>
                        <small>
                          {r.fecha} · {r.hora}
                        </small>
                      </div>
                    </div>

                    <div className="cb-box">
                      <div className="cb-box-row">
                        <span className="cb-box-name">
                          Campo
                          {r.campo?.cod_campo && (
                            <span className="cb-plate cb-plate-mini">{r.campo.cod_campo}</span>
                          )}
                        </span>
                        <strong>{r.campo?.nombre || "Sin nombre"}</strong>
                      </div>
                      {r.campo?.lugar && <span className="cb-box-note">{r.campo.lugar}</span>}
                    </div>

                    <div className="cb-peso">
                      <div>
                        <small>Peso 1</small>
                        <strong>{fmt(r.peso?.peso1)}</strong>
                      </div>
                      <div>
                        <small>Peso 2</small>
                        <strong>{fmt(r.peso?.peso2)}</strong>
                      </div>
                      <div className="is-total">
                        <small>Total</small>
                        <strong>{fmt(r.peso?.total)}</strong>
                      </div>
                    </div>

                    <div className="cb-lines">
                      <p>
                        <span>Flete</span>
                        <strong>{fmt(r.flete)}</strong>
                      </p>
                      <p className={tiene ? "is-on" : ""}>
                        <span>
                          <IconGota size={15} />
                          Combustible
                        </span>
                        <strong>
                          {tiene ? `${r.combustible.fecha} · ${r.combustible.hora}` : "No se cargó"}
                        </strong>
                      </p>
                    </div>
                  </div>

                  <div className="cb-card-foot">
                    <small>Guía {r.nguia}</small>
                    <div className="cb-icons">
                      <button
                        type="button"
                        onClick={() => iniciarEdicion(r)}
                        disabled={r.pendiente}
                        aria-label={`Editar guía ${r.nguia}`}
                        title="Editar"
                      >
                        <IconEditar />
                      </button>
                      <button
                        type="button"
                        className="is-danger"
                        onClick={() => eliminar(r)}
                        disabled={r.pendiente}
                        aria-label={`Eliminar guía ${r.nguia}`}
                        title="Eliminar"
                      >
                        <IconBasura />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ---------- Panel del formulario ---------- */}
      <Panel
        abierto={panel}
        onCerrar={cerrarPanel}
        titulo={editando ? "Editar registro" : "Nuevo registro"}
      >
        <form className="cb-form" onSubmit={guardar} noValidate>
          <header className="cb-panel-head">
            <h2>{editando ? "Editar registro" : "Nuevo registro"}</h2>
            <button type="button" className="cb-x" onClick={cerrarPanel} aria-label="Cerrar">
              <IconCerrar size={20} />
            </button>
          </header>

          <div className="cb-panel-body">
            <div className={`cb-field ${errores.vehiculoId ? "has-error" : ""}`}>
              <label>Vehículo</label>
              <SelectorVehiculo
                value={form.vehiculoId}
                opciones={vehiculos}
                onChange={(v) => cambiar("vehiculoId", v)}
              />
              {errores.vehiculoId && <span className="cb-error">{errores.vehiculoId}</span>}
            </div>

            <div className={`cb-field ${errores.nguia ? "has-error" : ""}`}>
              <label htmlFor="nguia">Número de guía</label>
              <input
                id="nguia"
                type="text"
                inputMode="numeric"
                value={form.nguia}
                onChange={(e) => cambiar("nguia", e.target.value)}
              />
              {errores.nguia && <span className="cb-error">{errores.nguia}</span>}
            </div>

            <div className="cb-row2">
              <div className={`cb-field ${errores.fecha ? "has-error" : ""}`}>
                <label htmlFor="fecha">Fecha</label>
                <input
                  id="fecha"
                  type="date"
                  value={form.fecha}
                  onChange={(e) => cambiar("fecha", e.target.value)}
                />
                {errores.fecha && <span className="cb-error">{errores.fecha}</span>}
              </div>
              <div className={`cb-field ${errores.hora ? "has-error" : ""}`}>
                <label htmlFor="hora">Hora</label>
                <input
                  id="hora"
                  type="time"
                  value={form.hora}
                  onChange={(e) => cambiar("hora", e.target.value)}
                />
                {errores.hora && <span className="cb-error">{errores.hora}</span>}
              </div>
            </div>

            <div className="cb-field">
              <label htmlFor="flete">Flete</label>
              <input
                id="flete"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={form.flete}
                onChange={(e) => cambiar("flete", e.target.value)}
              />
            </div>

            {/* Campo */}
            <div className="cb-group">
              <h3>Campo</h3>

              {camposRecientes.length > 0 && (
                <div className="cb-quick">
                  {camposRecientes.map((c) => (
                    <button
                      type="button"
                      key={c.cod_campo}
                      className={form.cod_campo === c.cod_campo ? "is-active" : ""}
                      onClick={() => {
                        setForm((f) => ({
                          ...f,
                          cod_campo: c.cod_campo,
                          lugar: c.lugar || "",
                          nombre: c.nombre || "",
                        }));
                        setErrores((e) => ({ ...e, cod_campo: "" }));
                      }}
                    >
                      {c.nombre || c.cod_campo}
                    </button>
                  ))}
                </div>
              )}

              <div className="cb-row2">
                <div className={`cb-field ${errores.cod_campo ? "has-error" : ""}`}>
                  <label htmlFor="cod_campo">Código</label>
                  <input
                    id="cod_campo"
                    type="text"
                    value={form.cod_campo}
                    onChange={(e) => cambiar("cod_campo", e.target.value)}
                  />
                  {errores.cod_campo && <span className="cb-error">{errores.cod_campo}</span>}
                </div>
                <div className="cb-field">
                  <label htmlFor="lugar">Lugar</label>
                  <input
                    id="lugar"
                    type="text"
                    value={form.lugar}
                    onChange={(e) => cambiar("lugar", e.target.value)}
                  />
                </div>
              </div>

              <div className="cb-field">
                <label htmlFor="nombre">Nombre</label>
                <input
                  id="nombre"
                  type="text"
                  value={form.nombre}
                  onChange={(e) => cambiar("nombre", e.target.value)}
                />
              </div>
            </div>

            {/* Peso */}
            <div className="cb-group">
              <h3>Peso</h3>
              <div className="cb-row2">
                <div className="cb-field">
                  <label htmlFor="peso1">Peso 1</label>
                  <input
                    id="peso1"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={form.peso1}
                    onChange={(e) => cambiar("peso1", e.target.value)}
                  />
                </div>
                <div className="cb-field">
                  <label htmlFor="peso2">Peso 2</label>
                  <input
                    id="peso2"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={form.peso2}
                    onChange={(e) => cambiar("peso2", e.target.value)}
                  />
                </div>
              </div>
              <div className="cb-total">
                <span>Total</span>
                <strong>{fmt(total)}</strong>
              </div>
            </div>

            {/* Combustible */}
            <div className="cb-switch-row">
              <div>
                <strong>Se cargó combustible</strong>
                <small>Registra la fecha y la hora de la carga</small>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form.usaComb}
                aria-label="Se cargó combustible"
                className={`cb-switch ${form.usaComb ? "is-on" : ""}`}
                onClick={() => cambiar("usaComb", !form.usaComb)}
              >
                <span />
              </button>
            </div>

            {form.usaComb && (
              <div className={`cb-comb-box ${errores.comb ? "has-error" : ""}`}>
                <div className="cb-row2">
                  <div className="cb-field">
                    <label htmlFor="combFecha">Fecha de carga</label>
                    <input
                      id="combFecha"
                      type="date"
                      value={form.combFecha}
                      onChange={(e) => cambiar("combFecha", e.target.value)}
                    />
                  </div>
                  <div className="cb-field">
                    <label htmlFor="combHora">Hora de carga</label>
                    <input
                      id="combHora"
                      type="time"
                      value={form.combHora}
                      onChange={(e) => cambiar("combHora", e.target.value)}
                    />
                  </div>
                </div>
                {errores.comb && <span className="cb-error">{errores.comb}</span>}
              </div>
            )}
          </div>

          <footer className="cb-panel-foot">
            <button type="button" className="cb-btn cb-btn-ghost" onClick={cerrarPanel}>
              Cancelar
            </button>
            <button type="submit" className="cb-btn cb-btn-primary">
              {editando ? "Guardar cambios" : "Guardar registro"}
            </button>
          </footer>
        </form>
      </Panel>
    </div>
  );
}

export default ControlCombustible;