import { json } from "../core/http";

export const notImplemented = (route: string) =>
  json(501, {
    error: "not_implemented",
    route,
    message: "Endpoint base creado. Implementacion funcional pendiente segun backlog CLARO."
  });
