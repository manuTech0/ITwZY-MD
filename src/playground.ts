import fastify from "fastify";

const app = fastify();

app.post("/receive", async ({ body }) => {
  console.log(body);
});

app.listen({
  port: 3111,
});
