import { InfluxDB, Point } from "@influxdata/influxdb-client";
import { Hono } from "hono";
import { validator } from "hono/validator";
import z from "zod";

const token = process.env.INFLUXDB_TOKEN;
const url = "http://localhost:8086";

let org = `docs`;
let bucket = `home`;
const client = new InfluxDB({ url, token });
const writeClient = client.getWriteApi(org, bucket, "ns");
const queryClient = client.getQueryApi(org);

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

const route = app
  .post(
    "/write",
    validator("json", (value, c) => {
      const parsed = WriteSchema.safeParse(value);
      if (!parsed.success) {
        console.log(parsed.error);
        return c.text("Invalid Body!", 400);
      }
      return parsed.data;
    }),
    (c) => {
      try {
        const body = c.req.valid("json");

        let point = new Point("environment")
          .tag("label", body.label)
          .intField("x", body.x)
          .intField("y", body.y)
          .intField("z", body.z);

        writeClient.writePoint(point);
        writeClient.flush();

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
  .post(
    "/query",
    validator("json", (value, c) => {
      const parsed = QuerySchema.safeParse(value);
      if (!parsed.success) {
        return c.text("Invalid Body!", 400);
      }
      return parsed.data;
    }),
    async (c) => {
      try {
        const { label } = c.req.valid("json");

        let fluxQuery = `from(bucket: "home")
        |> range(start: -10m)
        |> filter(fn: (r) => r._measurement == "environment" and r["label"] == "${label}")
        |> last()`;

        const rows: Record<string, any>[] = await new Promise(
          (resolve, reject) => {
            const result: Record<string, any>[] = [];
            queryClient.queryRows(fluxQuery, {
              next: (row, tableMeta) => {
                result.push(tableMeta.toObject(row));
              },
              error: (error) => {
                reject(error);
              },
              complete: () => {
                resolve(result);
              },
            });
          }
        );

        if (rows.length === 0) {
          return c.json({ message: "データが見つかりませんでした。" }, 404);
        }

        const latest: any = { label, x: null, y: null, z: null };
        for (const row of rows) {
          if (row._field === "x") latest.x = row._value;
          if (row._field === "y") latest.y = row._value;
          if (row._field === "z") latest.z = row._value;
        }

        return c.json(latest, 200);
      } catch (e) {
        console.error(e);
        return c.json({ message: "エラーが発生しました。" }, 500);
      }
    }
  );

const port = process.env.PORT ?? 9000;
Bun.serve({ fetch: app.fetch, port });
console.log(`Server running on http://localhost:${port}`);
