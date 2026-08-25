import { Navigate, Route, Routes } from "react-router-dom";

import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { useAuth } from "./state/AuthContext";

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-sm text-white/80 drop-shadow-sm">Nalagam…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/prijava" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/prijava" replace />} />
      </Routes>
    );
  }

  const isAdmin = user.role === "admin";

  const familyRoutes = (
    <>
      <Route path="/druzine" element={<HomePage />} />
      <Route path="/druzine/nova-druzina" element={<HomePage />} />
      <Route path="/druzine/:username/uredi" element={<HomePage />} />
    </>
  );
  const profileRoutes = (
    <>
      <Route path="/profil" element={<HomePage />} />
      <Route path="/profil/racun" element={<HomePage />} />
    </>
  );

  return (
    <Routes>
      <Route path="/razpolozljivost" element={<HomePage />} />
      <Route path="/razpolozljivost/nova-rezervacija" element={<HomePage />} />
      <Route path="/razpolozljivost/rezervacija/:slug" element={<HomePage />} />
      <Route path="/nastavitve" element={<HomePage />} />
      <Route path="/nastavitve/cene" element={<HomePage />} />
      <Route path="/nastavitve/emaili" element={<HomePage />} />
      {isAdmin ? familyRoutes : profileRoutes}
      <Route path="*" element={<Navigate to="/razpolozljivost" replace />} />
    </Routes>
  );
}
