import { Application, Router } from "./deps.ts";
import { API } from "./src/api.ts";

const settings = JSON.parse(await Deno.readTextFile('preferences.json'));
//const client = await new Client().connect(settings.db);

const app = new Application();
const api = new Router({ prefix: "/api" });

// define api routes


// implement routes
app.use(api.routes());
app.use(async ctx => {
    try {
        await ctx.send({
            root: './static',
            index: 'index.html'
        });
    } catch {
        ctx.response.status = 404;
        ctx.response.body = '404 | Page Not Found';
    }
})