import { signInWithPopup } from "firebase/auth";
import { auth, provider, db } from "../db/db.js";
import { useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { useState } from "react";
import "../assets/style/login.css"


function Login() {
  const navigate = useNavigate();
  const [cargando, setCargando] = useState(false);

  const loginGoogle = async () => {
    try {
      setCargando(true);

      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      const docRef = doc(db, "usuarios", user.uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        // Ya está registrado
        navigate("/dashboard");
    } else {
  // Es su primer ingreso
  navigate("/formulario", {
    state: {
      uid: user.uid,
      nombre: user.displayName,
      email: user.email,
      foto: user.photoURL,
    },
  });
}
    } catch (error) {
      console.log(error);
      setCargando(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-glow" />

      <div className="login-card">

        <p className="login-eyebrow">Bienvenido de vuelta</p>
        <h2 className="login-title">
          Inicia sesión
          <br />
          en tu cuenta
        </h2>

        <button className="login-btn" onClick={loginGoogle} disabled={cargando}>
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.84 2.08-1.79 2.72v2.26h2.9c1.7-1.56 2.69-3.87 2.69-6.62z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.83.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33C2.44 15.98 5.48 18 9 18z"/>
            <path fill="#FBBC05" d="M3.95 10.7c-.18-.54-.28-1.11-.28-1.7s.1-1.16.28-1.7V4.97H.96A8.99 8.99 0 000 9c0 1.45.35 2.83.96 4.03l2.99-2.33z"/>
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58z"/>
          </svg>
          {cargando ? "Conectando…" : "Continuar con Google"}
        </button>

        <p className="login-foot">
          Al continuar aceptas nuestros Términos y Política de Privacidad.
        </p>
      </div>
    </div>
  );
}

export default Login;