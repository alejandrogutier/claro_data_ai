import { Card, List, Typography } from "antd";
import { PageHeader } from "../components/shared/PageHeader";

const { Paragraph } = Typography;

type ConfigStubPageProps = {
  title: string;
  objective: string;
  blockedBy: string[];
};

export const ConfigStubPage = ({ title, objective, blockedBy }: ConfigStubPageProps) => {
  return (
    <section>
      <PageHeader title={title} subtitle={objective} />

      <Card title="Estado de implementacion" style={{ marginBottom: 16 }}>
        <Paragraph>Shell base disponible. Pantalla habilitada para routing y controles de acceso.</Paragraph>
        <Paragraph>Acciones de negocio quedan bloqueadas hasta cerrar historias backend relacionadas.</Paragraph>
      </Card>

      <Card title="Bloqueos declarados">
        <List
          size="small"
          dataSource={blockedBy}
          renderItem={(item) => <List.Item>{item}</List.Item>}
        />
      </Card>
    </section>
  );
};
