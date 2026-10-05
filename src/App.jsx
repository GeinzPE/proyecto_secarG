import { BrowserRouter, Routes, Route } from "react-router-dom";

import Login from "./pages/Login";
import Formulario from "./pages/Formulario";
import Dashboard from "./pages/Dashboard";
import Trabajadores from "./pages/trabajadores";
import Veiculos from "./pages/Vehiculos";
import ControlCombustible from "./pages/combustible";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/formulario" element={<Formulario />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/trabajadores" element={<Trabajadores />} />
        <Route path="/Vehículos" element={<Veiculos />} />
        <Route path="/combustible" element={<ControlCombustible />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;