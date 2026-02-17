type ConfigStubPageProps = {
  title: string;
  objective: string;
  blockedBy: string[];
};

export const ConfigStubPage = ({ title, objective, blockedBy }: ConfigStubPageProps) => {
  return (
    <section>
      <header className="page-header">
        <h2>{title}</h2>
        <p>{objective}</p>
      </header>

      <section className="panel">
        <div className="section-title-row">
          <h3>Estado de implementacion</h3>
        </div>
        <p>Shell base disponible. Pantalla habilitada para routing y controles de acceso.</p>
        <p>Acciones de negocio quedan bloqueadas hasta cerrar historias backend relacionadas.</p>
      </section>

      <section className="panel">
        <div className="section-title-row">
          <h3>Bloqueos declarados</h3>
        </div>
        <ul className="simple-list simple-list--stacked">
          {blockedBy.map((item) => (
            <li key={item}>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
};
