import { Hono } from "hono";
import { validator } from "hono/validator";
import z from "zod";
import { createClient } from "redis";
import { logger } from "hono/logger";

const client = createClient();
client.on("error", (err) => console.log("Redis Client Error", err));
await client.connect();

const semanticLabels = [
  "CEILING",
  "DOOR_FRAME",
  "FLOOR",
  "INVISIBLE_WALL_FACE",
  "WALL_ART",
  "WALL_FACE",
  "WINDOW_FRAME",
  "COUCH",
  "TABLE",
  "BED",
  "LAMP",
  "PLANT",
  "SCREEN",
  "STORAGE",
  "GLOBAL_MESH",
  "OTHER",
];

const WriteSchema = z.object({
  label: z.enum(semanticLabels),
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

const QuerySchema = z.object({
  label: z.enum(semanticLabels),
});

const app = new Hono();
app.use(logger());

const route = app
  .post(
    "/write",
    validator("json", (value, c) => {
      const parsed = WriteSchema.safeParse(value);
      if (!parsed.success) {
        console.log(parsed.error);
        return c.json({ error: "Invalid Body!" }, 400);
      }
      return parsed.data;
    }),
    async (c) => {
      try {
        const body = c.req.valid("json");
        await client.set(body.label, JSON.stringify(body));
        return c.json(
          {
            message: "座標が正常に記録されました。",
          },
          201
        );
      } catch (e) {
        console.log(e);
        return c.json(
          {
            message: "エラーが発生しました。",
          },
          500
        );
      }
    }
  )
  .get(
    "/get",
    validator("query", (value, c) => {
      const parsed = QuerySchema.safeParse(value);
      if (!parsed.success) {
        return c.json({ error: "Invalid Body!" }, 400);
      }
      return parsed.data;
    }),
    async (c) => {
      try {
        const { label } = c.req.valid("query");
        const latest = await client.get(label);
        if (latest) {
          return c.json(JSON.parse(latest), 200);
        } else {
          return c.json({ message: "データが見つかりませんでした。" }, 400);
        }
      } catch (e) {
        console.error(e);
        return c.json({ message: "エラーが発生しました。" }, 500);
      }
    }
  );

const port = process.env.PORT ?? 9000;
Bun.serve({ fetch: app.fetch, port });
console.log(`Server running on http://localhost:${port}`);
