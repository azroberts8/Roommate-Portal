# Roommate-Portal
Roommate Portal is a simple webapp for roommates to record, track, and reconcile general expenses and chores.

### Features

- Join user groups
- Log chores and store purchases
- Reconcile transactions monthly to divide expenses

### Setup
Roommate Portal requires installations of MariaDB and Deno. (An open-source TypeScript runtime environment) The following instructions are written for an installation on an Ubuntu host machine however can be adapted to multiple platforms.

Install MariaDB and Deno:

```sh
apt install mariadb-server;
curl -fsSL https://deno.land/install.sh | sh
```

Setup Roommate Portal database:
```sh
make setup-db
```

This command will create a new datbase and prompt you to set a username and password for the SQL user that it creates. (as shown below) For security purposes this user will only be granted the minimum privileges required for the program to function properly. Make sure to note the credentials you provide as they are needed in the next step.
```
Enter username:
...
Enter password:

Setting up database...
[Complete]

Creating user: ...
[Complete]
```

Modify the preferences.json file to reflect your SQL credentials:
```
{
  "port": 5000                 // the port the server will be hosted on
  "db": {
    "hostname": "127.0.0.1"    // SQL server address
    "db": "roomates"           // the name of the database (setup uses "roomates" by default)
    "username": "foo"          // username you provided in previous step
    "password": "bar"          // password you provided in previous step
  }
}
```

Finally, to start the server run the following:
```sh
make run
```

### Additional Notes
If ever necessary the database can be wiped clean back to the initial setup using the following command:
```sh
make clean-db
```


