import { useLocation } from "react-router-dom";
import { Card, Button, Alert, Typography, Flex } from "antd";
import { LoginOutlined } from "@ant-design/icons";
import { hasFrontendConfig } from "../config";
import { useAuth } from "../auth/AuthContext";

const { Text, Title, Paragraph } = Typography;

export const LoginPage = () => {
  const { login } = useAuth();
  const location = useLocation();
  const returnTo = (location.state as { from?: string } | null)?.from;

  return (
    <Flex
      justify="center"
      align="center"
      style={{ minHeight: "100vh", padding: 24 }}
    >
      <Card style={{ width: "100%", maxWidth: 560 }}>
        <Text
          strong
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: 1.5,
            color: "#e30613",
          }}
        >
          Claro Data AI
        </Text>
        <Title
          level={2}
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            marginTop: 8,
            marginBottom: 8,
          }}
        >
          Centro de Inteligencia de Marca
        </Title>
        <Paragraph type="secondary">
          Inicia sesion con Cognito para operar queries y revisar el feed de
          noticias de Claro con control editorial.
        </Paragraph>
        <Paragraph type="secondary" style={{ marginBottom: 24 }}>
          Despliegue continuo activo en AWS Amplify (verificado).
        </Paragraph>

        {!hasFrontendConfig() && (
          <Alert
            type="warning"
            showIcon
            title="Faltan variables VITE_* de Cognito/API. Revisa frontend/.env.example."
            style={{ marginBottom: 16 }}
          />
        )}

        <Button
          type="primary"
          size="large"
          icon={<LoginOutlined />}
          onClick={() => login(returnTo)}
          disabled={!hasFrontendConfig()}
          block
        >
          Entrar con Cognito
        </Button>
      </Card>
    </Flex>
  );
};
