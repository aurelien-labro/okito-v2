/**
 * Type partagé pour le contexte Hono : variables posées par les middlewares
 * et accessibles dans les routes via c.get("tenantId").
 */
export type AppEnv = {
  Variables: {
    tenantId: string;
    userId?: string;
  };
};
