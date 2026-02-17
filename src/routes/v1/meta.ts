import { createAppStore } from "../../data/appStore";
import { json } from "../../core/http";

export const getMeta = async () => {
  const store = createAppStore();
  if (!store) {
    return json(500, {
      error: "misconfigured",
      message: "Database runtime is not configured"
    });
  }

  try {
    const meta = await store.getMeta();
    return json(200, meta);
  } catch (error) {
    return json(500, {
      error: "internal_error",
      message: (error as Error).message
    });
  }
};
