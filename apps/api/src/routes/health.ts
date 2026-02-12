export async function healthRoutes(app: any) {
  app.get("/health", async () => ({ ok: true }));
}
