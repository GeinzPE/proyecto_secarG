import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../db/db.js";
import "../assets/style/Vehiculos.css";

// Colección donde se guardan los vehículos
const COLECCION = "veiculo";

// Días de anticipación por defecto para pasar a "Por vencer"
const AVISO_DEFECTO = 15;
const AVISOS_RAPIDOS = [7, 15, 30, 60];

// Filtro "Vence en": muestra los que tienen un documento venciendo entre hoy y N días
const VENTANAS = [
  { id: "todas", label: "Cualquier fecha", dias: null },
  { id: "semana", label: "1 semana", dias: 7 },
  { id: "mes", label: "1 mes", dias: 30 },
  { id: "dosmeses", label: "2 meses", dias: 60 },
  { id: "tresmeses", label: "3 meses", dias: 90 },
];

/* ---------- Utilidades ---------- */

const inicioDeDia = (f) => new Date(f.getFullYear(), f.getMonth(), f.getDate());

const diasEntre = (desde, hasta) =>
  Math.round((inicioDeDia(hasta) - inicioDeDia(desde)) / 86400000);

// Timestamp de Firestore -> Date
const aFecha = (ts) => (ts && ts.toDate ? ts.toDate() : null);

// "2026-12-31" -> Date local (mediodía, evita desfases de zona horaria)
const deInput = (texto) => {
  const [y, m, d] = texto.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
};

// Date -> "2026-12-31" para <input type="date">
const aInput = (f) => {
  if (!f) return "";
  const m = String(f.getMonth() + 1).padStart(2, "0");
  const d = String(f.getDate()).padStart(2, "0");
  return `${f.getFullYear()}-${m}-${d}`;
};

const fechaCorta = (f) =>
  f
    ? f.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })
    : "Sin fecha";

const textoDias = (n) => `${n} ${n === 1 ? "día" : "días"}`;

// Estado de un vencimiento. "aviso" = días de anticipación para pasar a "Por vencer"
const estadoFecha = (fecha, aviso = AVISO_DEFECTO) => {
  if (!fecha) return { tipo: "vencido", texto: "Sin fecha registrada", dias: null, pct: 100 };
  const restan = diasEntre(new Date(), fecha);
  const pct = Math.max(5, Math.min(100, (restan / 365) * 100));
  if (restan < 0)
    return { tipo: "vencido", texto: `Venció hace ${textoDias(Math.abs(restan))}`, dias: restan, pct: 100 };
  if (restan === 0) return { tipo: "pronto", texto: "Vence hoy", dias: 0, pct };
  if (restan <= aviso) return { tipo: "pronto", texto: `Vence en ${textoDias(restan)}`, dias: restan, pct };
  return { tipo: "vigente", texto: `Vence en ${textoDias(restan)}`, dias: restan, pct };
};

const ETIQUETA = { vigente: "Vigente", pronto: "Por vencer", vencido: "Vencido" };
const ETIQUETA_DB = { vigente: "vigente", pronto: "por vencer", vencido: "vencido" };
const PESO = { vigente: 0, pronto: 1, vencido: 2 };

const avisoDe = (v) => (Number.isFinite(v.avisar_dias) ? v.avisar_dias : AVISO_DEFECTO);

// Estados del SOAT y de la carreta (si lleva)
const estadosDe = (v) => {
  const aviso = avisoDe(v);
  const lista = [estadoFecha(aFecha(v.soat_vencimiento), aviso)];
  if (v.carreta?.activo) lista.push(estadoFecha(aFecha(v.carreta.vencimiento), aviso));
  return lista;
};

const iniciales = (nombre = "") =>
  nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");

const limpiarPlaca = (t) => t.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 8);

const FORM_VACIO = {
  placa: "",
  chofer: "",
  soat: "",
  herramientas: [],
  carreta: false,
  carretaPlaca: "",
  carretaVence: "",
  avisar: String(AVISO_DEFECTO),
};

const alertar = (error) => {
  console.log(error);
  alert(error.message);
};

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
const IconCampana = (p) => (
  <Icono {...p}>
    <path d="M5 14V9a5 5 0 0110 0v5l1 1.5H4L5 14zM8.5 17.5h3" />
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

/* ---------- Panel lateral (se oculta; en celular sube desde abajo) ---------- */

function Panel({ abierto, onCerrar, titulo, children }) {
  useEffect(() => {
    if (!abierto) return;
    const tecla = (e) => e.key === "Escape" && onCerrar();
    document.addEventListener("keydown", tecla);
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", tecla);
      document.body.style.overflow = previo;
    };
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  return (
    <div
      className="vh-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}
    >
      <aside className="vh-panel" role="dialog" aria-modal="true" aria-label={titulo}>
        {children}
      </aside>
    </div>
  );
}

/* ---------- Selector de chofer ---------- */

function SelectorChofer({ value, opciones, onChange }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef(null);

  useEffect(() => {
    const cerrarFuera = (e) => {
      if (caja.current && !caja.current.contains(e.target)) setAbierto(false);
    };
    document.addEventListener("mousedown", cerrarFuera);
    return () => document.removeEventListener("mousedown", cerrarFuera);
  }, []);

  return (
    <div
      className="vh-select"
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
        className={`vh-select-btn ${abierto ? "is-open" : ""}`}
        onClick={() => setAbierto(!abierto)}
        aria-haspopup="listbox"
        aria-expanded={abierto}
      >
        {value ? (
          <>
            <span className="vh-avatar vh-avatar-sm">{iniciales(value)}</span>
            <span className="vh-select-text">{value}</span>
          </>
        ) : (
          <span className="vh-select-text vh-placeholder">Elige un chofer</span>
        )}
        <IconFlecha className="vh-chevron" size={16} />
      </button>

      {abierto && (
        <ul className="vh-select-list" role="listbox">
          {opciones.length === 0 ? (
            <li className="vh-select-empty">
              No hay trabajadores con rol Trabajador. Agrégalos en la pantalla de Trabajadores.
            </li>
          ) : (
            opciones.map((nombre) => (
              <li key={nombre}>
                <button
                  type="button"
                  role="option"
                  aria-selected={nombre === value}
                  className={nombre === value ? "is-selected" : ""}
                  onClick={() => {
                    onChange(nombre);
                    setAbierto(false);
                  }}
                >
                  <span className="vh-avatar vh-avatar-sm">{iniciales(nombre)}</span>
                  <span className="vh-select-text">{nombre}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

/* ---------- Herramientas (formulario y tarjetas) ---------- */

function Herramientas({ items, onAdd, onRemove, disabled, compacto }) {
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(!compacto);

  const enviar = () => {
    const v = texto.trim();
    if (!v) return;
    onAdd(v);
    setTexto("");
  };

  return (
    <div className="vh-tools">
      <div className="vh-chips">
        {items.length === 0 && <span className="vh-none">Sin herramientas</span>}
        {items.map((h) => (
          <span className="vh-chip" key={h}>
            {h}
            <button
              type="button"
              onClick={() => onRemove(h)}
              disabled={disabled}
              aria-label={`Quitar ${h}`}
            >
              <IconCerrar size={12} />
            </button>
          </span>
        ))}
        {compacto && !abierto && (
          <button
            type="button"
            className="vh-chip-add"
            onClick={() => setAbierto(true)}
            disabled={disabled}
          >
            <IconMas size={13} />
            Herramienta
          </button>
        )}
      </div>

      {abierto && (
        <div className="vh-tool-add">
          <input
            type="text"
            placeholder="Ej. Gata, llave de ruedas"
            value={texto}
            autoFocus={compacto}
            disabled={disabled}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                enviar();
              }
              if (e.key === "Escape" && compacto) {
                e.stopPropagation();
                setAbierto(false);
                setTexto("");
              }
            }}
          />
          <button type="button" onClick={enviar} disabled={disabled}>
            Agregar
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- Documento (SOAT / carreta) con barra de tiempo restante ---------- */

function Documento({ nombre, placa, fecha, estado }) {
  return (
    <div className={`vh-doc is-${estado.tipo}`}>
      <div className="vh-doc-row">
        <span className="vh-doc-name">
          {nombre}
          {placa && <span className="vh-plate vh-plate-mini">{placa}</span>}
        </span>
        <strong>{fechaCorta(fecha)}</strong>
      </div>
      <div className="vh-bar">
        <span style={{ width: `${estado.pct}%` }} />
      </div>
      <span className="vh-doc-note">{estado.texto}</span>
    </div>
  );
}

/* ---------- Pantalla principal ---------- */

function Veiculos() {
  const navigate = useNavigate();

  const [vehiculos, setVehiculos] = useState([]);
  const [choferes, setChoferes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");

  const [panel, setPanel] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [errores, setErrores] = useState({});
  const [editando, setEditando] = useState(null);

  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [ventanaId, setVentanaId] = useState("todas");

  // Vehículos y trabajadores en tiempo real (espera a que Firebase restaure la sesión)
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
          collection(db, COLECCION),
          { includeMetadataChanges: true },
          (snap) => {
            const lista = snap.docs
              .map((d) => ({
                id: d.id,
                ...d.data({ serverTimestamps: "estimate" }),
                pendiente: d.metadata.hasPendingWrites,
              }))
              .sort(
                (a, b) =>
                  (aFecha(b.fecha)?.getTime() || 0) - (aFecha(a.fecha)?.getTime() || 0)
              );
            setVehiculos(lista);
            setErrorCarga("");
            setCargando(false);
          },
          (err) => {
            console.log(err);
            setErrorCarga(
              err.code === "permission-denied"
                ? "No tienes permisos para ver los vehículos. Revisa las reglas de Firestore."
                : err.message
            );
            setCargando(false);
          }
        )
      );

      // Solo los trabajadores con rol "trabajador" aparecen como choferes
      stops.push(
        onSnapshot(
          query(collection(db, "usuarios"), where("rol", "==", "trabajador")),
          (snap) => {
            const nombres = [...new Set(snap.docs.map((d) => d.data().nombre).filter(Boolean))];
            setChoferes(nombres.sort((a, b) => a.localeCompare(b, "es")));
          },
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
    setForm(FORM_VACIO);
    setErrores({});
    setEditando(null);
  }, []);

  const abrirNuevo = () => {
    setForm(FORM_VACIO);
    setErrores({});
    setEditando(null);
    setPanel(true);
  };

  const iniciarEdicion = (v) => {
    setForm({
      placa: v.placa || "",
      chofer: v.chofer || "",
      soat: aInput(aFecha(v.soat_vencimiento)),
      herramientas: v.herramientas || [],
      carreta: !!v.carreta?.activo,
      carretaPlaca: v.carreta?.placa || "",
      carretaVence: aInput(aFecha(v.carreta?.vencimiento)),
      avisar: String(avisoDe(v)),
    });
    setErrores({});
    setEditando(v.id);
    setPanel(true);
  };

  const validar = () => {
    const e = {};
    const placa = form.placa.trim();

    if (placa.length < 6) e.placa = "Escribe la placa (mínimo 6 caracteres)";
    else if (vehiculos.some((v) => v.id !== editando && v.placa === placa))
      e.placa = "Esta placa ya está registrada";

    if (!form.chofer) e.chofer = "Elige un chofer";
    if (!form.soat) e.soat = "Elige el vencimiento del SOAT";

    if (form.carreta) {
      if (form.carretaPlaca.trim().length < 6) e.carretaPlaca = "Escribe la placa de la carreta";
      if (!form.carretaVence) e.carretaVence = "Elige el vencimiento de la carreta";
    }

    const av = Number(form.avisar);
    if (!Number.isInteger(av) || av < 1 || av > 365) e.avisar = "Escribe un número entre 1 y 365";

    setErrores(e);
    return Object.keys(e).length === 0;
  };

  const guardar = (ev) => {
    ev.preventDefault();
    if (!validar()) return;

    const aviso = Number(form.avisar);

    const carreta = form.carreta
      ? {
          activo: true,
          placa: form.carretaPlaca.trim(),
          vencimiento: Timestamp.fromDate(deInput(form.carretaVence)),
          estado: ETIQUETA_DB[estadoFecha(deInput(form.carretaVence), aviso).tipo],
        }
      : { activo: false };

    const datos = {
      placa: form.placa.trim(),
      chofer: form.chofer,
      herramientas: form.herramientas,
      soat_vencimiento: Timestamp.fromDate(deInput(form.soat)),
      carreta,
      avisar_dias: aviso,
    };

    // No esperamos al servidor: la tarjeta aparece al instante como "Guardando…"
    const promesa = editando
      ? updateDoc(doc(db, COLECCION, editando), datos)
      : addDoc(collection(db, COLECCION), { ...datos, fecha: serverTimestamp() });

    promesa.catch(alertar);
    cerrarPanel();
  };

  const eliminar = (v) => {
    if (!window.confirm(`¿Eliminar el vehículo ${v.placa}?`)) return;
    if (editando === v.id) cerrarPanel();
    deleteDoc(doc(db, COLECCION, v.id)).catch(alertar);
  };

  // Herramientas dentro del formulario
  const agregarAlForm = (nombre) => {
    if (form.herramientas.some((h) => h.toLowerCase() === nombre.toLowerCase())) return;
    cambiar("herramientas", [...form.herramientas, nombre]);
  };
  const quitarDelForm = (nombre) =>
    cambiar("herramientas", form.herramientas.filter((h) => h !== nombre));

  // Herramientas directamente desde la tarjeta
  const agregarHerramienta = (v, nombre) => {
    if ((v.herramientas || []).some((h) => h.toLowerCase() === nombre.toLowerCase())) return;
    updateDoc(doc(db, COLECCION, v.id), { herramientas: arrayUnion(nombre) }).catch(alertar);
  };
  const quitarHerramienta = (v, nombre) =>
    updateDoc(doc(db, COLECCION, v.id), { herramientas: arrayRemove(nombre) }).catch(alertar);

  // Vehículos con sus estados calculados
  const conEstado = useMemo(
    () =>
      vehiculos.map((v) => {
        const estados = estadosDe(v);
        const general = estados.reduce((a, e) => (PESO[e.tipo] > PESO[a] ? e.tipo : a), "vigente");
        const proximos = estados.map((e) => e.dias).filter((d) => d !== null && d >= 0);
        return {
          ...v,
          estados,
          general,
          proximo: proximos.length ? Math.min(...proximos) : Infinity,
        };
      }),
    [vehiculos]
  );

  const conteo = useMemo(
    () => ({
      todos: conEstado.length,
      vigente: conEstado.filter((v) => v.general === "vigente").length,
      pronto: conEstado.filter((v) => v.general === "pronto").length,
      vencido: conEstado.filter((v) => v.general === "vencido").length,
    }),
    [conEstado]
  );

  const ventana = VENTANAS.find((v) => v.id === ventanaId);

  const filtrados = useMemo(() => {
    const b = busqueda.trim().toLowerCase();

    const lista = conEstado.filter((v) => {
      if (filtro !== "todos" && v.general !== filtro) return false;

      if (
        ventana.dias !== null &&
        !v.estados.some((e) => e.dias !== null && e.dias >= 0 && e.dias <= ventana.dias)
      )
        return false;

      if (!b) return true;
      return (
        (v.placa || "").toLowerCase().includes(b) ||
        (v.chofer || "").toLowerCase().includes(b) ||
        (v.carreta?.placa || "").toLowerCase().includes(b)
      );
    });

    // Con un rango de fechas activo, primero los que vencen antes
    if (ventana.dias !== null) lista.sort((a, b2) => a.proximo - b2.proximo);
    return lista;
  }, [conEstado, busqueda, filtro, ventana]);

  const KPIS = [
    { id: "todos", label: "Total" },
    { id: "vigente", label: "Vigentes" },
    { id: "pronto", label: "Por vencer" },
    { id: "vencido", label: "Vencidos" },
  ];

  const hayFiltros = filtro !== "todos" || ventanaId !== "todas" || busqueda.trim() !== "";

  const limpiarFiltros = () => {
    setFiltro("todos");
    setVentanaId("todas");
    setBusqueda("");
  };

  return (
    <div className="vh-page">
      <div className="vh-wrap">
        {/* ---------- Encabezado ---------- */}
        <header className="vh-top">
          <div>
            <button type="button" className="vh-back" onClick={() => navigate("/dashboard")}>
              <IconAtras size={16} />
              Volver al panel
            </button>
            <h1>Vehículos</h1>
            <p>Controla SOAT, carretas, choferes y herramientas de tu flota.</p>
          </div>

          <button type="button" className="vh-btn vh-btn-primary" onClick={abrirNuevo}>
            <IconMas size={18} />
            Nuevo vehículo
          </button>
        </header>

        {/* ---------- Resumen que también filtra ---------- */}
        <div className="vh-kpis" role="group" aria-label="Filtrar por estado">
          {KPIS.map((k) => (
            <button
              key={k.id}
              type="button"
              aria-pressed={filtro === k.id}
              className={`vh-kpi vh-kpi-${k.id} ${filtro === k.id ? "is-active" : ""}`}
              onClick={() => setFiltro(k.id)}
            >
              <span className="vh-kpi-label">
                <i />
                {k.label}
              </span>
              <strong>{conteo[k.id]}</strong>
            </button>
          ))}
        </div>

        {/* ---------- Búsqueda y rango de vencimiento ---------- */}
        <div className="vh-toolbar">
          <label className="vh-search">
            <IconBuscar size={18} />
            <input
              type="text"
              placeholder="Buscar por placa o chofer"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </label>

          <div className="vh-window">
            <span>Vence en</span>
            <div className="vh-seg" role="group" aria-label="Rango de vencimiento">
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
          <p className="vh-empty vh-empty-error">{errorCarga}</p>
        ) : cargando ? (
          <p className="vh-empty">Cargando vehículos…</p>
        ) : filtrados.length === 0 ? (
          <div className="vh-empty">
            {conteo.todos === 0 ? (
              <>
                <p>Aún no hay vehículos registrados.</p>
                <button type="button" className="vh-btn vh-btn-primary" onClick={abrirNuevo}>
                  <IconMas size={18} />
                  Agregar el primero
                </button>
              </>
            ) : (
              <>
                <p>Ningún vehículo coincide con estos filtros.</p>
                {hayFiltros && (
                  <button type="button" className="vh-btn vh-btn-ghost" onClick={limpiarFiltros}>
                    Quitar filtros
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          <ul className="vh-list">
            {filtrados.map((v) => {
              const lleva = !!v.carreta?.activo;

              return (
                <li
                  key={v.id}
                  className={`vh-card is-${v.general} ${v.pendiente ? "is-pending" : ""}`}
                >
                  {v.pendiente && (
                    <div className="vh-saving">
                      <span className="vh-spinner" />
                      Guardando…
                    </div>
                  )}

                  <div className="vh-card-head">
                    <span className="vh-plate">
                      <i />
                      {v.placa}
                      <i />
                    </span>
                    <span className={`vh-estado is-${v.general}`}>{ETIQUETA[v.general]}</span>
                  </div>

                  <div className="vh-card-body">
                    <div className="vh-chofer">
                      <span className="vh-avatar">{iniciales(v.chofer)}</span>
                      <div>
                        <strong>{v.chofer || "Sin chofer"}</strong>
                        <small>Chofer asignado</small>
                      </div>
                    </div>

                    <div className="vh-docs">
                      <Documento
                        nombre="SOAT"
                        fecha={aFecha(v.soat_vencimiento)}
                        estado={v.estados[0]}
                      />

                      {lleva ? (
                        <Documento
                          nombre="Carreta"
                          placa={v.carreta.placa}
                          fecha={aFecha(v.carreta.vencimiento)}
                          estado={v.estados[1]}
                        />
                      ) : (
                        <div className="vh-doc is-none">
                          <span className="vh-doc-name">Carreta</span>
                          <span className="vh-doc-note">Este vehículo va sin carreta</span>
                        </div>
                      )}
                    </div>

                    <p className="vh-aviso">
                      <IconCampana size={16} />
                      Aviso {textoDias(avisoDe(v))} antes de que venza
                    </p>

                    <Herramientas
                      compacto
                      items={v.herramientas || []}
                      disabled={v.pendiente}
                      onAdd={(n) => agregarHerramienta(v, n)}
                      onRemove={(n) => quitarHerramienta(v, n)}
                    />
                  </div>

                  <div className="vh-card-foot">
                    <small>Registrado el {fechaCorta(aFecha(v.fecha))}</small>
                    <div className="vh-icons">
                      <button
                        type="button"
                        onClick={() => iniciarEdicion(v)}
                        disabled={v.pendiente}
                        aria-label={`Editar ${v.placa}`}
                        title="Editar"
                      >
                        <IconEditar />
                      </button>
                      <button
                        type="button"
                        className="is-danger"
                        onClick={() => eliminar(v)}
                        disabled={v.pendiente}
                        aria-label={`Eliminar ${v.placa}`}
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

      {/* ---------- Panel del formulario (oculto hasta que lo abras) ---------- */}
      <Panel
        abierto={panel}
        onCerrar={cerrarPanel}
        titulo={editando ? "Editar vehículo" : "Nuevo vehículo"}
      >
        <form className="vh-form" onSubmit={guardar} noValidate>
          <header className="vh-panel-head">
            <h2>{editando ? "Editar vehículo" : "Nuevo vehículo"}</h2>
            <button type="button" className="vh-x" onClick={cerrarPanel} aria-label="Cerrar">
              <IconCerrar size={20} />
            </button>
          </header>

          <div className="vh-panel-body">
            {/* Vista previa de la placa sobre la pista */}
            <div className="vh-preview">
              <span className={`vh-plate vh-plate-lg ${form.placa ? "" : "is-empty"}`}>
                <i />
                {form.placa || "ABC-123"}
                <i />
              </span>
            </div>

            <div className={`vh-field ${errores.placa ? "has-error" : ""}`}>
              <label htmlFor="placa">Placa</label>
              <input
                id="placa"
                type="text"
                className="vh-input-placa"
                placeholder="ABC-123"
                autoFocus
                value={form.placa}
                onChange={(e) => cambiar("placa", limpiarPlaca(e.target.value))}
              />
              {errores.placa && <span className="vh-error">{errores.placa}</span>}
            </div>

            <div className={`vh-field ${errores.chofer ? "has-error" : ""}`}>
              <label>Chofer</label>
              <SelectorChofer
                value={form.chofer}
                opciones={choferes}
                onChange={(v) => cambiar("chofer", v)}
              />
              {errores.chofer && <span className="vh-error">{errores.chofer}</span>}
            </div>

            <div className={`vh-field ${errores.soat ? "has-error" : ""}`}>
              <label htmlFor="soat">Vencimiento del SOAT</label>
              <input
                id="soat"
                type="date"
                value={form.soat}
                onChange={(e) => cambiar("soat", e.target.value)}
              />
              {errores.soat && <span className="vh-error">{errores.soat}</span>}
            </div>

            {/* Carreta */}
            <div className="vh-switch-row">
              <div>
                <strong>Lleva carreta</strong>
                <small>Agrega su placa y su vencimiento</small>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form.carreta}
                aria-label="Lleva carreta"
                className={`vh-switch ${form.carreta ? "is-on" : ""}`}
                onClick={() => cambiar("carreta", !form.carreta)}
              >
                <span />
              </button>
            </div>

            {form.carreta && (
              <div className="vh-carreta-box">
                <div className={`vh-field ${errores.carretaPlaca ? "has-error" : ""}`}>
                  <label htmlFor="carretaPlaca">Placa de la carreta</label>
                  <input
                    id="carretaPlaca"
                    type="text"
                    className="vh-input-placa"
                    placeholder="XYZ-789"
                    value={form.carretaPlaca}
                    onChange={(e) => cambiar("carretaPlaca", limpiarPlaca(e.target.value))}
                  />
                  {errores.carretaPlaca && <span className="vh-error">{errores.carretaPlaca}</span>}
                </div>

                <div className={`vh-field ${errores.carretaVence ? "has-error" : ""}`}>
                  <label htmlFor="carretaVence">Vencimiento de la carreta</label>
                  <input
                    id="carretaVence"
                    type="date"
                    value={form.carretaVence}
                    onChange={(e) => cambiar("carretaVence", e.target.value)}
                  />
                  {errores.carretaVence && <span className="vh-error">{errores.carretaVence}</span>}
                </div>
              </div>
            )}

            {/* Aviso de vencimiento */}
            <div className={`vh-field ${errores.avisar ? "has-error" : ""}`}>
              <label htmlFor="avisar">Avisar con anticipación</label>
              <div className="vh-aviso-pick">
                <div className="vh-seg" role="group" aria-label="Días rápidos">
                  {AVISOS_RAPIDOS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={Number(form.avisar) === n ? "is-active" : ""}
                      onClick={() => cambiar("avisar", String(n))}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div className="vh-days-input">
                  <input
                    id="avisar"
                    type="number"
                    min="1"
                    max="365"
                    value={form.avisar}
                    onChange={(e) => cambiar("avisar", e.target.value)}
                  />
                  <span>días</span>
                </div>
              </div>
              {errores.avisar ? (
                <span className="vh-error">{errores.avisar}</span>
              ) : (
                <small className="vh-help">
                  Cuando falten {form.avisar || "…"} días o menos para el SOAT o la carreta, el
                  vehículo pasa a "Por vencer".
                </small>
              )}
            </div>

            <div className="vh-field">
              <label>Herramientas</label>
              <Herramientas
                items={form.herramientas}
                onAdd={agregarAlForm}
                onRemove={quitarDelForm}
              />
            </div>
          </div>

          <footer className="vh-panel-foot">
            <button type="button" className="vh-btn vh-btn-ghost" onClick={cerrarPanel}>
              Cancelar
            </button>
            <button type="submit" className="vh-btn vh-btn-primary">
              {editando ? "Guardar cambios" : "Agregar vehículo"}
            </button>
          </footer>
        </form>
      </Panel>
    </div>
  );
}

export default Veiculos;