import { Application, Router } from "./deps.ts";
import { API } from "./src/api.ts";
import { InputError, InputType, screenInput, errorHandler } from "./src/security.ts";

const settings = JSON.parse(await Deno.readTextFile('preferences.json'));
const api = await API.connect(settings.db);

const app = new Application();
const router = new Router({ prefix: "/api" });

// define routes
router
.post("/dashboard", async ctx => {
    /* Sends dashboard by login credentials or sesison token */
    const data = await ctx.request.body().value;
    let res: { status: string, body: any } = { status: "OK", body: undefined};

    try {
        if(typeof data.get('session') === 'string') res.body = await api.getDashboard(screenInput(data.get('session'), InputType.Token))
        else if(typeof data.get('username') === 'string' && typeof data.get('password') === 'string') res.body = await api.login(screenInput(data.get('username'), InputType.Username), screenInput(data.get('password'), InputType.Password))
        else throw new InputError('No Credentials Provided', 'No session token or username-password combination were provided with the request.', '');
    } catch (e) {
        res = errorHandler(e);
    }

    ctx.response.body = JSON.stringify(res);
})
.post("/user/exists", async ctx => {
    /* Checks whether username or email already exist */
    const data = await ctx.request.body().value;
    let res: { status: string, body: any } = { status: "OK", body: undefined};

    try {
        res.body = {
            username: (typeof data.get('username') === 'string') ? await api.userExists(screenInput(data.get('username'), InputType.Username)) : null,
            email: (typeof data.get('email') === 'string') ? await api.emailExists(screenInput(data.get('email'), InputType.Email)) : null
        }
    } catch (e) {
        res = errorHandler(e);
    }

    ctx.response.body = JSON.stringify(res);
})
.put("/user", async ctx => {
    /* Updates username, password or email */
    const data = await ctx.request.body().value;
    let res: { status: string, body: any } = { status: "OK", body: { username: false, password: false, email: false } };
    
    try {
        if(typeof data.get('username') != 'string') throw new InputError('No User Specified', 'No username was specified to update properties.', '');
        if(typeof data.get('password') != 'string') throw new InputError('No Password Specified', 'No password provided when updating user properties', data.get('username'));
        if(!(await api.validateCreds(screenInput(data.get('username'), InputType.Username), screenInput(data.get('password'), InputType.Password)))) throw new InputError('Invalid Credentials', 'The username and password combination provided were not valid.', '');
        
        if(typeof data.get('newpassword') === 'string') {
            await api.changePassword(screenInput(data.get('username'), InputType.Username), screenInput(data.get('password'), InputType.Password), screenInput(data.get('newpassword'), InputType.Password));
            res.body.password = true;
        }
        if(typeof data.get('newemail') === 'string') {
            if(await api.emailExists(screenInput(data.get('newemail'), InputType.Email))) throw new InputError('Email Address Taken', `The email address '${ data.get('newemail') }' is already in use by another user.`, data.get('newemail'));
            await api.changeEmail(screenInput(data.get('username'), InputType.Username), screenInput(data.get('newemail'), InputType.Email));
            res.body.email = true;
        }
        if(typeof data.get('newusername') === 'string') {
            if(await api.userExists(screenInput(data.get('newusername'), InputType.Username))) throw new InputError('Username Taken', `The username '${ data.get('newusername') }' is already in use by another user.`, data.get('newemail'));
            await api.changeUsername(screenInput(data.get('username'), InputType.Username), screenInput(data.get('newusername'), InputType.Username));
            res.body.username = true;
        }
    } catch (e) {
        res = errorHandler(e);
    }

    ctx.response.body = JSON.stringify(res);
})

.post("/user", async ctx => {
    /* Creates a new user account */
    const data = await ctx.request.body().value;
    let res: { status: string, body: any } = { status: "OK", body: undefined};

    try {
        if(typeof data.get('username') != 'string') throw new InputError('Username Not Specified', 'No username was specified to apply to the new user.', '');
        if(typeof data.get('password') != 'string') throw new InputError('Password Not Specified', 'No password was specified to apply to the new user.', '');
        if(typeof data.get('firstname') != 'string') throw new InputError('First Name Not Specified', 'No value was specified for the users first name.', '');
        if(typeof data.get('lastname') != 'string') throw new InputError('Last Name Not Specified', 'No value was specified for the users last name.', '');
        if(typeof data.get('email') != 'string') throw new InputError('Email Address Not Specified', 'No value was specified for the users email address.', '');

        const uname = screenInput(data.get('username'), InputType.Username);
        const password = screenInput(data.get('password'), InputType.Password);
        const fname = screenInput(data.get('firstname'), InputType.Name);
        const lname = screenInput(data.get('lastname'), InputType.Name);
        const email = screenInput(data.get('email'), InputType.Email);

        res.body = await api.createUser(uname, password, fname, lname, email);
    } catch (e) {
        res = errorHandler(e);
    }

    ctx.response.body = JSON.stringify(res);
})
.post("/group", async ctx => {
    /* Creates a new user group */
    const data = await ctx.request.body().value;
    let res: { status: string, body: any } = { status: "OK", body: undefined};

    try {
        const name = screenInput(data.get('name'), InputType.Header);
        const description = screenInput(data.get('description'), InputType.String);
        const status = (data.get('status') === 'locked') ? 'locked' : 'open';
        const maxMembers = (typeof data.get('maxmembers') === 'string') ? Number(data.get('maxmembers')) : undefined;
        const session = screenInput(data.get('session'), InputType.Token);
        
        // getting list of members
        let i = 1;
        let members = [];
        while(typeof data.get(`m${i}`) === 'string') {
            members.push(screenInput(data.get(`m${i}`), InputType.Username));
            i++;
        }

        res.body = await api.createGroup(name, description, status, maxMembers, members)
        .then(async () => {
            return await api.getDashboard(session);
        });
    } catch (e) {
        res = errorHandler(e);
    }

    ctx.response.body = JSON.stringify(res);
})
.post("/group/:id", async ctx => {
    /* Joins a group */
    const data = await ctx.request.body().value;
    let res: { status: string, body: any } = { status: "OK", body: undefined};

    try {
        const username = screenInput(data.get('username'), InputType.Username);
        const session = await api.validateSession(username, screenInput(data.get('session'), InputType.Token));
        const group = screenInput(ctx.params.id, InputType.Token);


        res.body = await api.joinGroup(username, group)
        .then(async () => {
            return await api.getDashboard(session);
        });
    } catch (e) {
        res = errorHandler(e);
    }

    ctx.response.body = JSON.stringify(res);
})
.put("/group/:id", async ctx => {
    /* Locks or unlocks a group */
    const data = await ctx.request.body().value;
    let res: { status: string, body: any } = { status: "OK", body: undefined};

    try {
        const group = screenInput(ctx.params.id, InputType.Token);

        if(data.get('state') === 'locked') {
            res.body = await api.lockGroup(group)
        } else {
            res.body = await api.unlockGroup(group)
        }
        res.body = true;
    } catch (e) {
        res = errorHandler(e);
    }

    ctx.response.body = JSON.stringify(res);
}) // lock/unlock group
.delete("/group/:id", async ctx => {
    /* leave a group */
    const data = await ctx.request.body().value;
    let res: { status: string, body: any } = { status: "OK", body: undefined};

    try {
        const username = screenInput(data.get('username'), InputType.Username);
        const session = screenInput(data.get('session'), InputType.Token);
        const group = screenInput(ctx.params.id, InputType.Token);

        res.body = await api.leaveGroup(username, group)
        .then(async () => {
            return await api.getDashboard(session);
        })
    } catch (e) {
        res = errorHandler(e);
    }

    ctx.response.body = JSON.stringify(res);
})
.post("/purchase", async ctx => {
    /* Adds a purchase */
    const data = await ctx.request.body().value;
    let res: { status: string, body: any } = { status: "OK", body: undefined};

    try {
        const username = screenInput(data.get('username'), InputType.Username);
        const group = screenInput(data.get('group'), InputType.Token);
        const amount = Number(data.get('amount'));
        const store = (typeof data.get('store') === 'string') ? screenInput(data.get('store'), InputType.Header) : undefined;
        const date = (typeof data.get('date') === 'string') ? new Date(data.get('date')) : new Date();
        const notes = (typeof data.get('notes') === 'string') ? screenInput(data.get('notes'), InputType.String) : undefined;

        await api.addPurchase(username, group, amount, store, date, notes);
        res.body = true;
    } catch (e) {
        res = errorHandler(e);
    }

    ctx.response.body = JSON.stringify(res);
})
.post("/incentive", async ctx => {
    /* Create new incentive */
    const data = await ctx.request.body().value;
    let res: { status: string, body: any } = { status: "OK", body: undefined};

    try {
        const group = screenInput(data.get('group'), InputType.Token);
        const name = screenInput(data.get('name'), InputType.Header);
        const amount = Number(data.get('amount'));
        const onPurchase = data.get('onpurchase') === 'true' || data.get('onpurchase') === '1';
        const description = (typeof data.get('description') === 'string') ? screenInput(data.get('description'), InputType.String) : '';

        res.body = await api.createNewIncentive(group, name, amount, onPurchase, description)
        .then(async () => await api.listGroupIncentives(group));
    } catch (e) {
        res = errorHandler(e);
    }

    ctx.response.body = JSON.stringify(res);
})
.post("/incentive/:id", async ctx => {
    /* Add incentive */
    const data = await ctx.request.body().value;
    let res: { status: string, body: any } = { status: "OK", body: undefined};

    try {
        const uname = screenInput(data.get('username'), InputType.Token);
        const incentiveID = screenInput(data.get('incentive'), InputType.Token);
        const notes = (typeof data.get('notes') === 'string') ? screenInput(data.get('notes'), InputType.String) : '';

        await api.addIncentive(uname, incentiveID, notes);
        res.body = true;
    } catch (e) {
        res = errorHandler(e);
    }

    ctx.response.body = JSON.stringify(res);
});


// implement routes
app.use(router.routes());
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
});

app.addEventListener("listen", ({ secure, hostname, port }) => {
    const protocol = secure ? "https://" : "http://";
    const url = `${protocol}${hostname ?? "localhost"}:${port}`;
    console.log(`Listening on: ${url}`);
});

await app.listen({ port: settings.port });