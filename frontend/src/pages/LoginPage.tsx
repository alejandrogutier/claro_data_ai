import { useLocation } from "react-router-dom";
import { hasFrontendConfig } from "../config";
import { useAuth } from "../auth/AuthContext";

export const LoginPage = () => {
  const { login } = useAuth();
  const location = useLocation();
  const returnTo = (location.state as { from?: string } | null)?.from;

  return (
    <div className="login-page">
      <div className="login-card">
        <p className="brand-kicker">Claro Data AI</p>
        <h1>Centro de Inteligencia de Marca</h1>
        <p>
          Inicia sesion con Cognito para operar queries y revisar el feed de noticias de Claro con control editorial.
        </p>
        <p>Despliegue continuo activo en AWS Amplify.</p>

        {!hasFrontendConfig() ? (
          <div className="alert warning">
            Faltan variables `VITE_*` de Cognito/API. Revisa `frontend/.env.example`.
          </div>
        ) : null}

        <button className="btn btn-primary" type="button" onClick={() => login(returnTo)} disabled={!hasFrontendConfig()}>
          Entrar con Cognito
        </button>
      </div>
    </div>
  );
};
