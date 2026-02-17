import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "./auth/RequireAuth";
import { AppShell } from "./components/AppShell";
import { AuthCallbackPage } from "./pages/AuthCallbackPage";
import { LoginPage } from "./pages/LoginPage";
import { NewsFeedPage } from "./pages/NewsFeedPage";
import { TermsPage } from "./pages/TermsPage";

export const App = () => {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/app/feed" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />

      <Route
        path="/app"
        element={
          <RequireAuth allowedRoles={["Admin", "Analyst", "Viewer"]}>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="feed" replace />} />
        <Route path="feed" element={<NewsFeedPage />} />
        <Route path="terms" element={<TermsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/app/feed" replace />} />
    </Routes>
  );
};
