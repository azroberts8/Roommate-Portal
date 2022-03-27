import { Client, bcrypt } from "../deps.ts";
import { InputError } from "./security.ts";

interface FullUser {
    uname: string,
    sessionToken: string,
    tokenExpires: string,
    dateJoined: Date,
    firstName: string,
    lastName: string,
    email: string
}

interface BriefUser {
    uname: string,
    firstName: string,
    lastName: string,
    joinedGroup: Date
}

interface Incentive {
    incentiveID: string,
    incentiveName: string,
    description: string,
    amount: number,
    effectiveDate: Date,
    onPurchase: boolean
}

interface Transaction {
    type: string,
    date: Date,
    uname: string,
    incentiveName: string,
    amount: number,
    store: string,
    notes: string
}

interface Settlement {
    uname: string,
    totalPurchases: number,
    countPurchases: number,
    totalIncentives: number,
    countIncentives: number,
    totalContribution: number,
    owes: number
}

interface GroupTransactions {
    periodFrom: Date,
    periodTo: Date,
    countPurchases: number,
    countIncentives: number,
    purchaseTotal: number,
    incentiveTotal: number,
    total: number,
    countRecords: number,
    records: Array<Transaction>,
    settlements: Array<Settlement>
}

interface Group {
    groupName: string,
    groupID: string,
    created: Date,
    description: string,
    status: string,
    maxMembers: number,
    countMembers: number,
    members: Array<BriefUser>,
    countIncentivesAvailable: number,
    incentivesAvailable: Array<Incentive>,
    transactions: GroupTransactions
}

interface Dashboard {
    user: FullUser,
    memberships: number,
    groups: Array<Group>
}

export class API {
    private client: Client;

    private constructor(client: Client) {
        this.client = client;
    }

    public static async connect(credentials: { hostname: string, db: string, username: string, password: string }): Promise<API> {
        return await new Client().connect(credentials).then(async client => {
            return new API(client);
        });
    }

    /* Getter Methods */

    /**
     * Queries the database for all relevant information on a user specified by a session token
     * @param sessionToken A valid session token that references the desired user
     * @returns Promise of an object with containing all relevant information about a user
     */
    public async getFullUser(sessionToken: string): Promise<FullUser> {
        return await this.client.query('SELECT Users.Uname AS uname, BIN_TO_ID(Sessions.Token) AS sessionToken, Sessions.Expires AS tokenExpires, Users.DateJoined AS dateJoined, Users.Fname AS firstName, Users.Lname AS lastName, Users.Email AS email FROM Users RIGHT JOIN Sessions ON Users.UID = Sessions.UID WHERE Sessions.Token = ID_TO_BIN(?) AND Sessions.Active = 1 AND Sessions.Expires > NOW() LIMIT 1;', [sessionToken]).then(async res => {
            if(res.length == 0) throw new InputError('Invalid Session Token', `'${sessionToken}' is expired or does not exist.`, sessionToken);
            return await res[0];
        });
    }

    /**
     * Queries the database for basic information on each user in a specified group
     * @param groupID A unique group ID
     * @returns Promise of an array containing username, firstname, lastname, and joined date of each user in group
     */
    public async listGroupMembers(groupID: string): Promise<Array<BriefUser>> {
        return await this.client.query('SELECT Users.Uname AS uname, Users.Fname AS firstName, Users.Lname AS lastName, Memberships.JoinedGroup AS joinedGroup FROM Memberships RIGHT JOIN Users ON Memberships.UID = Users.UID WHERE Memberships.GID = ID_TO_BIN(?) AND Memberships.LeftGroup IS NULL;', [groupID]);
    }

    /**
     * Queries the database for information on each incentive available to a group
     * @param groupID Unique group ID of requested group
     * @returns Promise of an array containing info about each available incentive for the group
     */
    public async listGroupIncentives(groupID: string): Promise<Array<Incentive>> {
        return await this.client.query('SELECT BIN_TO_ID(IID) AS incentiveID, Name AS incentiveName, Description AS description, Amount AS amount, Begin AS effectiveDate, OnPurchase AS onPurchase FROM IncentivesAvailable WHERE (End IS NULL OR End > NOW()) AND GID = ID_TO_BIN(?);', [groupID]).then(async res => {
            // Doing some reformatting on the output because MySQL returns DECIMAL as String and BOOLEAN as Integer
            return await res.map((x: any) => {
                x.amount = Number(x.amount);
                x.onPurchase = Boolean(x.onPurchase);
                return x;
            });
        });
    }

    /**
     * Queries the database for every purchase and incentive performed in a specified group within a specified date range
     * @param groupID Unique group ID of requested group
     * @param fromDate List transactions from date
     * @param toDate List transactions until date
     * @returns Promise of an array containing info on every purchase and incentive in specified range
     */
    public async getTransactionRecords(groupID: string, fromDate: Date, toDate: Date): Promise<Array<Transaction>> {
        // Large query splitting up over multiple lines
        return await this.client.query(`SELECT 'purchase' AS type, Purchases.Date AS date, Users.Uname AS uname, NULL AS incentiveName, Purchases.Amount AS amount, Purchases.Store AS store, Purchases.Notes AS notes
        FROM Purchases
        LEFT JOIN Users ON Purchases.UID = Users.UID
        WHERE Purchases.GID = ID_TO_BIN(?)
        AND Purchases.Date BETWEEN ? AND ?
        UNION ALL
        SELECT 'incentive' AS type, Incentives.Date AS date, Users.Uname AS uname, IncentivesAvailable.Name AS incentiveName, IncentivesAvailable.Amount AS amount, NULL AS store, Incentives.Notes AS notes
        FROM Incentives
        LEFT JOIN Users ON Incentives.UID = Users.UID
        RIGHT JOIN IncentivesAvailable ON Incentives.IID = IncentivesAvailable.IID
        WHERE IncentivesAvailable.GID = ID_TO_BIN(?)
        AND Incentives.Date BETWEEN '2022-03-01' AND '2022-04-02'
        ORDER BY date;`, [groupID, fromDate.toISOString(), toDate.toISOString(), groupID, fromDate.toISOString(), toDate.toISOString()]).then(async res => {
            // Reformatting output of property amount to number
            return await res.map((x: any) => {
                x.amount = Number(x.amount);
                return x;
            });
        })
    }

    /**
     * Calculates total putchases, incentives, and amount owed by each group member within a specified time range
     * @param groupID Unique group ID of requested group
     * @param fromDate Sum transactions from date
     * @param toDate Sum transactions until date
     * @returns Promise of array containing sum of purchases, incentives, and amount awed by each group member
     */
    public async calculateSettlements(groupID: string, fromDate: Date, toDate: Date): Promise<Array<Settlement>> {
        return await Promise.all([
            this.client.query(`SELECT Users.Uname AS uname, IFNULL(SUM(Purchases.Amount), 0) AS totalPurchases, COUNT(Purchases.Amount) AS countPurchases, CALC_SHARE(ID_TO_BIN(?), STR_TO_DATE(?, '%m/%d/%Y'), STR_TO_DATE(?, '%m/%d/%Y')) AS groupShare
            FROM Memberships
            LEFT JOIN Users ON Memberships.UID = Users.UID
            LEFT JOIN Purchases ON Users.UID = Purchases.UID
            WHERE Memberships.GID = ID_TO_BIN(?)
            AND (Purchases.Date BETWEEN STR_TO_DATE(?, '%m/%d/%Y') AND STR_TO_DATE(?, '%m/%d/%Y') OR Purchases.Date IS NULL)
            GROUP BY Users.Uname
            ORDER BY Users.Uname ASC;`, [groupID, fromDate.toLocaleDateString(), toDate.toLocaleDateString(), groupID, fromDate.toLocaleDateString(), toDate.toLocaleDateString()]),
            this.client.query(`SELECT Users.Uname AS uname, IFNULL(SUM(IncentivesAvailable.Amount), 0) AS totalIncentives, COUNT(Incentives.IID) AS countIncentives
            FROM Memberships
            LEFT JOIN Users ON Memberships.UID = Users.UID
            LEFT JOIN Incentives ON Users.UID = Incentives.UID
            LEFT JOIN IncentivesAvailable ON Incentives.IID = IncentivesAvailable.IID
            WHERE Memberships.GID = ID_TO_BIN(?)
            AND (Incentives.Date BETWEEN STR_TO_DATE(?, '%m/%d/%Y') AND STR_TO_DATE(?, '%m/%d/%Y') OR Incentives.Date IS NULL)
            GROUP BY Users.Uname
            ORDER BY Users.Uname ASC;`, [groupID, fromDate.toLocaleDateString(), toDate.toLocaleDateString()])
        ])
        .then(async data => {
            let res: Array<Settlement> = [];
            for(let i = 0; i < data[0].length; i++) {
                res.push({
                    uname: String(await data[0][i].uname),
                    totalPurchases: Number(await data[0][i].totalPurchases),
                    countPurchases: Number(await data[0][i].countPurchases),
                    totalIncentives: Number(await data[1][i].totalIncentives),
                    countIncentives: Number(await data[1][i].countIncentives),
                    totalContribution: Number(await data[0][i].totalPurchases) + Number(await data[1][i].totalIncentives),
                    owes: Number(await data[0][0].groupShare) - (Number(await data[0][i].totalPurchases) + Number(await data[1][i].totalIncentives))
                });
            }
            return res;
        })
    }

    /**
     * Lists all information about a group's transactions in a specified time range
     * @param groupID Unique group ID of requested group
     * @param fromDate List transactions from date
     * @param toDate List transactions until date
     * @returns Object containing all information about a group's transactions
     */
    public async getGroupTransactions(groupID: string, fromDate: Date, toDate: Date): Promise<GroupTransactions> {
        return await Promise.all([
            this.client.query("SELECT COUNT(*) AS countPurchases, IFNULL(SUM(Amount), 0) AS purchaseTotal, SUM_EXPENSES(ID_TO_BIN(?), STR_TO_DATE(?, '%m/%d/%Y'), STR_TO_DATE(?, '%m/%d/%Y')) AS total FROM Purchases WHERE GID = ID_TO_BIN(?) AND Date BETWEEN ? AND ?;", [groupID, fromDate.toLocaleDateString(), toDate.toLocaleDateString(), groupID, fromDate.toISOString(), toDate.toISOString()]),
            this.client.query('SELECT COUNT(*) AS countIncentives, IFNULL(SUM(IncentivesAvailable.Amount), 0) AS incentiveTotal FROM Incentives RIGHT JOIN IncentivesAvailable ON Incentives.IID = IncentivesAvailable.IID WHERE IncentivesAvailable.GID = ID_TO_BIN(?) AND Incentives.Date BETWEEN ? AND ?;', [groupID, fromDate.toISOString(), toDate.toISOString()]),
            this.getTransactionRecords(groupID, fromDate, toDate),
            this.calculateSettlements(groupID, fromDate, toDate)
        ]).then(async data => {
            return {
                periodFrom: fromDate,
                periodTo: toDate,
                countPurchases: await data[0][0].countPurchases,
                countIncentives: await data[1][0].countIncentives,
                purchaseTotal: Number(await data[0][0].purchaseTotal),
                incentiveTotal: Number(await data[1][0].incentiveTotal),
                total: Number(await data[0][0].total),
                countRecords: await data[0][0].countPurchases + await data[1][0].countIncentives,
                records: data[2],
                settlements: data[3]
            }
        })
    }

    /**
     * Retrieves all information about a specified group including transaction records for the current month
     * @param groupID Unique group ID of requested group
     * @returns Object containing all information about a given group
     */
    public async getGroup(groupID: string): Promise<Group | undefined> {
        const today = new Date();
        const from = new Date(today.getFullYear(), today.getMonth(), 1);
        const to = new Date(today.getFullYear(), today.getMonth() + 1, 0);

        return await Promise.all([
            this.client.query('SELECT Name AS groupName, Created AS created, Description AS description, Status AS status, MaxUsers AS maxMembers FROM Groups WHERE GID = ID_TO_BIN(?) LIMIT 1;', [groupID]),
            this.listGroupMembers(groupID),
            this.listGroupIncentives(groupID),
            this.getGroupTransactions(groupID, from, to)
        ]).then(async data => {
            if(data[0].length == 0) {
                return;
            } else {
                return {
                    groupName: await data[0][0].groupName,
                    groupID: groupID,
                    created: await data[0][0].created,
                    description: await data[0][0].description,
                    status: await data[0][0].status,
                    maxMembers: Number(await data[0][0].maxMembers),
                    countMembers: data[1].length,
                    members: data[1],
                    countIncentivesAvailable: data[2].length,
                    incentivesAvailable: data[2],
                    transactions: data[3]
                }
            }
        });
    }

    /**
     * Gets all information about about a user and the groups they are part of identified by a session token
     * @param sessionToken A valid session token that references the desired user
     * @returns Object containing all all information about a given user groups they are in
     */
    public async getDashboard(sessionToken: string): Promise<Dashboard> {
        return await Promise.all([
            this.getFullUser(sessionToken),
            this.client.query('SELECT BIN_TO_ID(Memberships.GID) AS groupID FROM Memberships RIGHT JOIN Sessions ON Memberships.UID = Sessions.UID WHERE Sessions.Token = ID_TO_BIN(?) AND Sessions.Expires > NOW() AND Sessions.Active = 1;', [sessionToken])
            .then(async groups => {
                return await Promise.all(await groups.map(async (x: { groupID: string }) => {
                    return await this.getGroup(x.groupID);
                }))
            })
        ]).then(async data => {
            return {
                user: data[0],
                memberships: data[1].length,
                groups: data[1]
            }
        });
    }

    /* Action Methods */

    /**
     * Validates a username and password combination and starts a new user session if it is valid
     * @param uname Username or email address of user signing in
     * @param password User password to check
     * @returns Dashboard object if login is successful
     */
    public async login(uname: string, password: string): Promise<Dashboard> {
        return await this.client.query('SELECT Uname AS uname, PwdHash AS hash, FailedLoginAttempts AS attempts FROM Users WHERE Uname = ? OR Email = ? LIMIT 1;', [uname, uname]).then(async res => {
            if(await res.length < 1) throw new InputError('User Not Found', `'${ uname }' does not match any users.`, uname);
            if(await res[0].attempts >= 5) throw new InputError('Account Locked', 'You have exceeded the maximum login attempts.', uname);
            if(!(await bcrypt.compare(password, await res[0].hash))) {
                await this.client.execute('UPDATE Users SET FailedLoginAttempts = FailedLoginAttempts + 1 WHERE Uname = ? OR Email = ?;', [uname, uname]).then(() => {
                    throw new InputError('Incorrect Password', `The password you ented for '${ uname }' is incorrect.`, uname );
                });
            }
        }).then(async () => {
            await this.client.execute('UPDATE Users SET FailedLoginAttempts = 0 WHERE Uname = ? OR Email = ?;', [uname, uname]);
            return await this.client.execute('INSERT INTO Sessions (Token, UID) VALUES(ID_TO_BIN(UUID()), (SELECT UID FROM Users WHERE Uname = ? OR Email = ? LIMIT 1));', [uname, uname]).then(async () => {
                return await this.client.query('SELECT BIN_TO_ID(Token) AS session FROM Sessions WHERE UID = (SELECT UID FROM Users WHERE Uname = ? OR Email = ? LIMIT 1) ORDER BY Expires DESC LIMIT 1;', [uname, uname]).then(async res => {
                    return this.getDashboard(await res[0].session);
                });
            });
        });
    }

    /**
     * Validates a username and password combination
     * @param uname Username of user to validate
     * @param password Password to check
     * @returns true/false whether the username-password combination is valid
     */
    public async validateCreds(uname: string, password: string): Promise<boolean> {
        return await this.client.query('SELECT PwdHash AS hash FROM Users WHERE Uname = ? LIMIT 1;', [uname])
        .then(async res => {
            if(await res.length === 0) return false;
            return await bcrypt.compare(password, await res[0].hash);
        });
    }

    /**
     * Closes an active session and creates a new one for the same user
     * @param sessionToken An active session ID
     * @returns A new session ID
     */
    private async refreshSession(sessionToken: string): Promise<string> {
        return await this.client.query('SELECT BIN_TO_ID(UID) AS uid FROM Sessions WHERE Token = ID_TO_BIN(?) AND Expires > NOW() AND Active = 1;', [sessionToken])
        .then(async res => {
            await this.client.execute('UPDATE Sessions SET Active = 0 WHERE Token = ID_TO_BIN(?);', [sessionToken]);
            return await this.client.execute('INSERT INTO Sessions (Token, UID) VALUES(ID_TO_BIN(UUID()), ID_TO_BIN(?));', [await res[0].uid])
            .then(async () => {
                return await this.client.query('SELECT BIN_TO_ID(Token) AS session FROM Sessions WHERE UID = ID_TO_BIN(?) ORDER BY Expires DESC LIMIT 1;', [await res[0].uid])
                .then(async token => await token[0].session);
            });
        });
    }

    /**
     * Validates username and session token combination and generates a new token if it is more than a week old
     * @param uname A valid username
     * @param sessionToken A session token associated with the provided username
     * @returns A session ID
     */
    public async validateSession(uname: string, sessionToken: string): Promise<string> {
        return await this.client.query('SELECT Sessions.Expires AS expires FROM Sessions RIGHT JOIN Users ON Sessions.UID = Users.UID WHERE Users.Uname = ? AND Sessions.Token = ID_TO_BIN(?) AND Sessions.Expires > NOW() AND Sessions.Active = 1 LIMIT 1;', [uname, sessionToken])
        .then(async res => {
            if(await res.length < 1) throw new InputError('Invalid Session', 'The provided username and token combination are invalid.', `${ uname } -> ${ sessionToken }`);

            // if there is less than 3 weeks until expiration (been active a week), generate a new session token
            const today = new Date();
            const threeWeeks = new Date(today.getTime() + 1814400000);
            if(await res[0].expires < threeWeeks) {
                return await this.refreshSession(sessionToken);
            } else {
                return sessionToken;
            }
        })
    }

    /**
     * Updates a specified user's password
     * @param uname Username of the selected user
     * @param oldPassword Current password for user
     * @param newPassword New password to set for user
     */
    public async changePassword(uname: string, oldPassword: string, newPassword: string): Promise<void> {
        await this.client.query('SELECT PwdHash AS oldHash FROM Users WHERE Uname = ? LIMIT 1;', [uname])
        .then(async res => {
            if(await res.length < 1) throw new InputError('User Not Found', `Could not update password for user '${uname}' because the user could not be found.`, uname);
            if(!(await bcrypt.compare(oldPassword, await res[0].oldHash))) throw new InputError('Incorrect Password', `Incorrect password for '${uname}'`, uname);
            if(await bcrypt.compare(newPassword, await res[0].oldHash)) throw new InputError('Cannot Reuse Password', 'Your new password cannot be the same as your old password.', newPassword);
        })
        .then(async () => {
            const salt = await bcrypt.genSalt(8);
            const hash = await bcrypt.hash(newPassword, salt);
            await this.client.execute('UPDATE Users SET PwdHash = ? WHERE Uname = ?;', [hash, uname]);
        });
    }

    /**
     * Changes a user's username
     * @param oldUname The current username of the specified user
     * @param newUname New username to set for user
     */
    public async changeUsername(oldUname: string, newUname: string): Promise<void> {
        await this.client.execute('UPDATE Users SET Uname = ? WHERE Uname = ?;', [newUname, oldUname]);
    }

    /**
     * Changes a user's email address
     * @param uname Username of the selected user
     * @param email New email address to set
     */
    public async changeEmail(uname: string, email: string): Promise<void> {
        await this.client.execute('UPDATE Users SET Email = ? WHERE Uname = ?;', [email, uname]);
    }

    /**
     * Determines whether a specified username exists
     * @param uname Username to validate
     * @returns true/false if the user exists
     */
    public async userExists(uname: string): Promise<boolean> {
        return await this.client.query('SELECT EXISTS(SELECT * FROM Users WHERE Uname = ?) AS present;', [uname])
        .then(async res => Boolean(await res[0].present));
    }

    /**
     * Determines whether a specified email address is in use
     * @param email Email address to validate
     * @returns true/false if the email address exists
     */
    public async emailExists(email: string): Promise<boolean> {
        return await this.client.query('SELECT EXISTS(SELECT * FROM Users WHERE Email = ?) AS present;', [email])
        .then(async res => Boolean(await res[0].present));
    }

    /**
     * Creates a new user account and logs them in
     * @param uname New account username
     * @param password New account password
     * @param firstname User's first name
     * @param lastname User's last name
     * @param email User's email address
     * @returns Dashboard object
     */
    public async createUser(uname: string, password: string, firstname: string, lastname: string, email: string): Promise<Dashboard> {
        if(await this.userExists(uname)) throw new InputError('Username Taken', `The username '${ uname }' is already in use by another user.`, uname);
        if(await this.emailExists(email)) throw new InputError('Email Address Taken', `The email address '${ email }' is already in use by other user.`, email);

        const hash = bcrypt.hash(password, await bcrypt.genSalt(8));
        return await this.client.execute('INSERT INTO Users (UID, Uname, PwdHash, Fname, Lname, Email) VALUES(ID_TO_BIN(UUID()), ?, ?, ?, ?, ?);', [uname, await hash, firstname, lastname, email])
        .then(async () => await this.login(uname, password));
    }

    /**
     * Determines whether a user is a member of a specified group
     * @param uname Username of user
     * @param gid Group ID of group to check
     * @returns true/false if the user is a member of the group
     */
    private async isInGroup(uname: string, gid: string): Promise<boolean> {
        return await this.client.query('SELECT EXISTS(SELECT * FROM Memberships RIGHT JOIN Users ON Memberships.UID = Users.UID WHERE Users.Uname = ? AND Memberships.GID = ID_TO_BIN(?) AND Memberships.LeftGroup IS NULL) AS inGroup;', [uname, gid])
        .then(async res => Boolean(await res[0].inGroup));
    }

    /**
     * Determines whether a group exists by its ID
     * @param gid Group ID of group to check
     * @returns true/false if the group exists
     */
    private async groupExists(gid: string): Promise<boolean> {
        return await this.client.query('SELECT EXISTS(SELECT * FROM Groups WHERE GID = ID_TO_BIN(?)) AS present;', [gid])
        .then(async res => Boolean(await res[0].present));
    }

    /**
     * Adds a specified user to a group
     * @param uname Username of user to add
     * @param gid Group ID of group to add user to
     */
    public async joinGroup(uname: string, gid: string): Promise<void> {
        if(!(await this.userExists(uname))) throw new InputError('User Not Found', `Could not find user '${ uname }'.`, uname)
        if(!(await this.groupExists(gid))) throw new InputError('Group Not Found', `Could not find group identified by '${ gid }'`, gid);
        if(await this.isInGroup(uname, gid)) throw new InputError('Already In Group', `${ uname } is already a member of this group.`, uname);

        const group = await this.client.query('SELECT MaxUsers as max, Status as status, Name as name FROM Groups WHERE GID = ID_TO_BIN(?);', [gid]).then(async res => await res[0]);
        if(await group.max != null && (await this.listGroupMembers(gid)).length >= await group.max) throw new InputError('Group Full', `The group '${ await group.name }' is at its maximum member capacity.`, gid);
        if(await group.status == 'locked') throw new InputError('Group Locked', `The group '${ await group.name }' is locked.`, gid);

        await this.client.execute('INSERT INTO Memberships (UID, GID, JoinedGroup) VALUES((SELECT UID FROM Users WHERE Uname = ? LIMIT 1), ID_TO_BIN(?), NOW());', [uname, gid]);
    }

    public async lockGroup(groupID: string): Promise<void> {
        if(!(await this.groupExists(groupID))) throw new InputError('Group Not Found', `Could not find group identified by '${ groupID }'`, groupID);

        await this.client.execute("UPDATE Groups SET Status = 'locked' WHERE GID = ID_TO_BIN(?);", [groupID]);
    }

    public async unlockGroup(groupID: string): Promise<void> {
        if(!(await this.groupExists(groupID))) throw new InputError('Group Not Found', `Could not find group identified by '${ groupID }'`, groupID);

        await this.client.execute("UPDATE Groups SET Status = 'open' WHERE GID = ID_TO_BIN(?);", [groupID]);
    }

    /**
     * Removes a user from a group
     * @param uname Username of user to remove
     * @param gid Group ID of group to remove user from
     */
    public async leaveGroup(uname: string, gid: string) {
        if(!(await this.userExists(uname))) throw new InputError('User Not Found', `Could not find user '${uname}'.`, uname);
        if(!(await this.groupExists(gid))) throw new InputError('Group Not Found', `Could not find group identified by '${ gid }'`, gid);
        if(!(await this.isInGroup(uname, gid))) throw new InputError('Not In Group', `${ uname } is not a member of the specified group.`, uname);

        await this.client.execute('UPDATE Memberships SET LeftGroup = NOW() WHERE UID = (SELECT UID FROM Users WHERE Uname = ? LIMIT 1) AND GID = ID_TO_BIN(?) AND LeftGroup IS NULL;', [uname, gid]);
    }

    /**
     * Creates a new user groups
     * @param name Group name to assign
     * @param description Breif description to assign
     * @param status Indicates whether new members can join after the group has been created (open | locked)
     * @param maxMembers Maximum members allowed in the group
     * @param members List of initial group members
     * @returns Object containing information about the new group
     */
    public async createGroup(name: string, description: string, status: string, maxMembers: number | undefined, members: Array<string>): Promise<Group | undefined> {
        if(typeof maxMembers === 'number' && members.length > maxMembers) maxMembers = members.length;
        if(status != 'open' && status != 'locked') throw new InputError('Invalid Group Status', `"${ status }" is not a valid group status.`, status);

        return await this.client.execute('INSERT INTO Groups (GID, Name, Description, Status, MaxUsers) VALUES(ID_TO_BIN(UUID()), ?, ?, ?, ?)', [name, description, 'open', maxMembers])
        .then(async () => await this.client.query('SELECT BIN_TO_ID(GID) AS groupID FROM Groups WHERE Name = ? ORDER BY Created DESC LIMIT 1;', [name]))
        .then(async res => {
            return await Promise.all(members.map(async uname => await this.joinGroup(uname, await res[0].groupID)))
            .then(async () => {
                if(status == 'locked') await this.lockGroup(await res[0].groupID);
            })
            .then(async () => await this.getGroup(await res[0].groupID));
        });
    }

    /**
     * Adds a user's purchase to a group's records
     * @param uname User that made the purchase
     * @param groupID Group ID to apply the purchase to
     * @param amount Purchase recipt total
     * @param store Store where purchase was made
     * @param date Date that the purchase was made
     * @param notes Additional comments to tag with purchase
     */
    public async addPurchase(uname: string, groupID: string, amount: number, store?: string, date?: Date, notes?: string): Promise<void> {
        if(!(await this.userExists(uname))) throw new InputError('User Not Found', `Purchase could not be added because '${ uname }' could not be found.`, uname);
        if(!(await this.groupExists(groupID))) throw new InputError('Group Not Found', `Purchase coudl not be added because the group '${ groupID }' could not be found.`, groupID);
        if(!(await this.isInGroup(uname, groupID))) throw new InputError('User Not In Group', `${ uname } is not a member of the group ${ groupID }.`, `${uname} -> ${groupID}`);
        store = (typeof store == 'undefined') ? '' : store;
        date = (typeof date == 'undefined') ? new Date() : date;
        notes = (typeof notes == 'undefined') ? '' : notes;

        // add incentives if applicable
        await this.client.query('SELECT BIN_TO_ID(IID) AS incentiveID FROM IncentivesAvailable WHERE GID = ID_TO_BIN(?) AND Begin < NOW() AND (End IS NULL OR End > NOW()) AND OnPurchase = 1;', [groupID])
        .then(async res => await Promise.all(await res.map(async (incentive: { incentiveID: string }) => await this.addIncentive(uname, incentive.incentiveID, `Added by purchase on ${ date?.toLocaleDateString() }.`))));
        await this.client.execute('INSERT INTO Purchases (UID, GID, Date, Store, Amount, Notes) VALUES((SELECT UID FROM Users WHERE Uname = ?), ID_TO_BIN(?), ?, ?, ?, ?);', [uname, groupID, date.toISOString().split('T')[0], store, amount, notes]);
    }

    /**
     * Determines whether an incentive exists by its ID
     * @param incentiveID Incentive to validate
     * @returns true/false if the incentive exists
     */
    public async incentiveExists(incentiveID: string): Promise<boolean> {
        return await this.client.query('SELECT EXISTS(SELECT * FROM IncentivesAvailable WHERE IID = ID_TO_BIN(?)) AS present;', [incentiveID])
        .then(async res => Boolean(await res[0].present));
    }

    /**
     * Creates a new group incentive
     * @param groupID Group to assign incentive to
     * @param name Name of the incentive
     * @param amount Value of the incentive
     * @param onPurchase Whether the incentive should be invoked by a purchase
     * @param description Description of the incentive
     */
    public async createNewIncentive(groupID: string, name: string, amount: number, onPurchase: boolean, description?: string): Promise<void> {
        if(!(await this.groupExists(groupID))) throw new InputError('Group Not Found', 'Could not create incentive because the group could not be found.', groupID);
        description = (typeof description == 'undefined') ? '' : description;

        await this.client.execute('INSERT INTO IncentivesAvailable (IID, GID, Name, Description, Amount, Begin, OnPurchase) VALUES(ID_TO_BIN(UUID()), ID_TO_BIN(?), ?, ?, ?, NOW(), ?);', [groupID, name, description, amount, onPurchase]);
    }

    /**
     * Add's a user's incentive action to a group's records
     * @param uname User that performed incentive
     * @param incentiveID Incentive that was performed
     * @param notes Additional comments on the action
     * @param date Date that the incentive was performed
     */
    public async addIncentive(uname: string, incentiveID: string, notes?: string, date?: Date): Promise<void> {
        if(!(await this.userExists(uname))) throw new InputError('User Not Found', `Incentive could not be added because '${ uname }' could not be found.`, uname);
        if(!(await this.incentiveExists(incentiveID))) throw new InputError('Incentive Not Found', 'Incentive could not be added because the ID provided could not be found.', incentiveID);
        notes = (typeof notes == 'undefined') ? '' : notes;
        date  = (typeof date == 'undefined') ? new Date() : date;

        await this.client.execute('INSERT INTO Incentives (UID, IID, Date, Notes) VALUES((SELECT UID FROM Users WHERE Uname = ?), ID_TO_BIN(?), ?, ?);', [uname, incentiveID, date.toISOString().split('T')[0], notes]);
    }
}