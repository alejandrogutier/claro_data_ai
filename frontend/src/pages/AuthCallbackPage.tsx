import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Spin, Result, Button, Flex } from "antd";
import { consumeReturnPath } from "../auth/cognito";
import { useAuth } from "../auth/AuthContext";

export const AuthCallbackPage = () => {
  const navigate = useNavigate();
  const { handleCallback, session, login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const processingRef = useRef(false);

  useEffect(() => {
    if (processingRef.current) return;

    const run = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const state = params.get("state");

      if (!code || !state) {
        setError("Callback invalido de Cognito (faltan code/state)");
        return;
      }

      processingRef.current = true;

      try {
        await handleCallback(code, state);
        const nextPath = consumeReturnPath();
        navigate(nextPath, { replace: true });
      } catch (callbackError) {
        processingRef.current = false;
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
          extra={
            <Button type="primary" onClick={() => login()}>
              Reintentar login
            </Button>
          }
        />
      ) : (
        <Spin size="large" tip="Procesando inicio de sesion...">
          <div style={{ padding: 60 }} />
        </Spin>
      )}
    </Flex>
  );
};
