import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../db/db.js";

function FormUser() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        navigate("/"); // no hay sesión, vuelve al login
        return;
      }
      setUser(currentUser);
      setCargando(false);
    });

    return unsubscribe;
  }, [navigate]);

  const guardarUsuario = async () => {
    if (!nombre.trim() || !apellido.trim()) {
      alert("Completa nombre y apellido");
      return;
    }

    try {
      await setDoc(doc(db, "usuarios", user.uid), {
        uid: user.uid,
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        correo: user.email,
        rol: "usuario",
        fecha_registro: serverTimestamp(),
      });

      alert(`Usuario ${nombre} registrado`);
      navigate("/dashboard");
    } catch (error) {
      console.log(error);
      alert(error.message);
    }
  };

  if (cargando) return <p>Cargando…</p>;

  return (
    <div>
      <h2>Completa tu información</h2>

      <p>Correo: {user.email}</p>

      <input
        type="text"
        placeholder="Nombre"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
      />

      <input
        type="text"
        placeholder="Apellido"
        value={apellido}
        onChange={(e) => setApellido(e.target.value)}
      />

      <button onClick={guardarUsuario}>Guardar</button>
    </div>
  );
}

export default FormUser;
