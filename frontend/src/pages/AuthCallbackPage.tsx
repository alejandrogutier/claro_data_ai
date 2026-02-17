import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { consumeReturnPath } from "../auth/cognito";
import { useAuth } from "../auth/AuthContext";

export const AuthCallbackPage = () => {
  const navigate = useNavigate();
  const { handleCallback, session } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const state = params.get("state");

      if (!code || !state) {
        setError("Callback invalido de Cognito (faltan code/state)");
        return;
      }

      try {
        await handleCallback(code, state);
        const nextPath = consumeReturnPath();
        navigate(nextPath, { replace: true });
      } catch (callbackError) {
        setError((callbackError as Error).message);
      }
    };

    void run();
  }, [handleCallback, navigate]);

  if (session) {
    return <Navigate to="/app/feed" replace />;
  }

  return (
    <div className="screen-state">
      {error ? (
        <>
          <h2>No se pudo completar el login</h2>
          <p>{error}</p>
        </>
      ) : (
        <>
          <h2>Procesando inicio de sesion...</h2>
          <p>Validando codigo de autorizacion con Cognito.</p>
        </>
      )}
    </div>
  );
};
