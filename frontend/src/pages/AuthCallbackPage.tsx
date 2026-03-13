import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Spin, Result, Flex } from "antd";
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
    <Flex justify="center" align="center" style={{ minHeight: "100vh" }}>
      {error ? (
        <Result
          status="error"
          title="No se pudo completar el login"
          subTitle={error}
        />
      ) : (
        <Spin size="large" tip="Procesando inicio de sesion...">
          <div style={{ padding: 60 }} />
        </Spin>
      )}
    </Flex>
  );
};
