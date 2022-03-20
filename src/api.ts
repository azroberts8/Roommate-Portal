import { Client } from "../deps.ts";
import { UserError } from "./security.ts";

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
    public async getFullUser(sessionToken: string) {
        return await this.client.query('SELECT Users.Uname AS uname, BIN_TO_ID(Sessions.Token) AS sessionToken, Sessions.Expires AS tokenExpires, Users.DateJoined AS dateJoined, Users.Fname AS firstName, Users.Lname AS lastName, Users.Email AS email FROM Users RIGHT JOIN Sessions ON Users.UID = Sessions.UID WHERE Sessions.Token = ID_TO_BIN(?) AND Sessions.Active = 1 AND Sessions.Expires > NOW() LIMIT 1;', [sessionToken]).then(async res => {
            if(res.length == 0) throw new UserError('Invalid Session Token', `'${sessionToken}' is expired or does not exist.`);
            return await res[0];
        });
    }

    /**
     * Queries the database for basic information on each user in a specified group
     * @param groupID A unique group ID
     * @returns Promise of an array containing username, firstname, lastname, and joined date of each user in group
     */
    public async listGroupMembers(groupID: string): Promise<Array<{
        uname: string,
        firstName: string,
        lastName: string,
        joinedGroup: Date
    }>> {
        return await this.client.query('SELECT Users.Uname AS uname, Users.Fname AS firstName, Users.Lname AS lastName, Memberships.JoinedGroup AS joinedGroup FROM Memberships RIGHT JOIN Users ON Memberships.UID = Users.UID WHERE Memberships.GID = ID_TO_BIN(?) AND Memberships.LeftGroup IS NULL;', [groupID]);
    }

    /**
     * Queries the database for information on each incentive available to a group
     * @param groupID Unique group ID of requested group
     * @returns Promise of an array containing info about each available incentive for the group
     */
    public async listGroupIncentives(groupID: string): Promise<Array<{
        incentiveID: string,
        incentiveName: string,
        description: string,
        amount: number,
        effectiveDate: Date,
        onPurchase: boolean
    }>> {
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
    public async getTransactionRecords(groupID: string, fromDate: Date, toDate: Date): Promise<Array<{
        type: string,
        date: Date,
        uname: string,
        incentiveName: string,
        amount: number,
        store: string,
        notes: string
    }>> {
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
    public async calculateSettlements(groupID: string, fromDate: Date, toDate: Date): Promise<Array<{
        uname: string,
        totalPurchases: number,
        countPurchases: number,
        totalIncentives: number,
        countIncentives: number,
        totalContribution: number,
        owes: number
    }>> {
        return await this.client.query(`SELECT Users.Uname AS uname, IFNULL(SUM(Purchases.Amount), 0) AS totalPurchases, COUNT(Purchases.Amount) AS countPurchases, IFNULL(SUM(IncentivesAvailable.Amount), 0) AS totalIncentives, COUNT(Incentives.IID) AS countIncentives, IFNULL(SUM(Purchases.Amount), 0) + IFNULL(SUM(IncentivesAvailable.Amount), 0) AS totalContribution, CALC_SHARE(ID_TO_BIN(?), STR_TO_DATE(?, '%m/%d/%Y'), STR_TO_DATE(?, '%m/%d/%Y')) - (IFNULL(SUM(Purchases.Amount), 0) + IFNULL(SUM(IncentivesAvailable.Amount), 0)) AS owes
        FROM Memberships
        RIGHT JOIN Users ON Memberships.UID = Users.UID
        LEFT JOIN Purchases ON Users.UID = Purchases.UID
        LEFT JOIN Incentives ON Incentives.UID = Users.UID
        LEFT JOIN IncentivesAvailable ON Incentives.IID = IncentivesAvailable.IID
        WHERE Memberships.GID = ID_TO_BIN(?)
        AND (Memberships.LeftGroup IS NULL OR Memberships.LeftGroup >= DATE(?))
        AND Memberships.JoinedGroup <= DATE(?)
        GROUP BY Users.Uname;`, [groupID, fromDate.toLocaleDateString(), toDate.toLocaleDateString(), groupID, fromDate.toISOString(), toDate.toISOString()]).then(async res => {
            // Reformatting decimal properties
            return await res.map((x: any) => {
                x.totalPurchases = Number(x.totalPurchases);
                x.totalIncentives = Number(x.totalIncentives);
                x.totalContribution = Number(x.totalContribution);
                x.owes = Number(x.owes);
                return x;
            });
        });
    }

    /**
     * Lists all information about a group's transactions in a specified time range
     * @param groupID Unique group ID of requested group
     * @param fromDate List transactions from date
     * @param toDate List transactions until date
     * @returns Object containing all information about a group's transactions
     */
    public async getGroupTransactions(groupID: string, fromDate: Date, toDate: Date): Promise<{
        periodFrom: Date,
        periodTo: Date,
        countPurchases: number,
        countIncentives: number,
        purchaseTotal: number,
        incentiveTotal: number,
        total: number,
        countRecords: number,
        records: Array<{
            type: string,
            date: Date,
            uname: string,
            incentiveName: string,
            amount: number,
            store: string,
            notes: string
        }>,
        settlements: Array<{
            uname: string,
            totalPurchases: number,
            countPurchases: number,
            totalIncentives: number,
            countIncentives: number,
            totalContribution: number,
            owes: number
        }>
    }> {
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
    public async getGroup(groupID: string) {
        const today = new Date();
        const from = new Date(today.getFullYear(), today.getMonth(), 1);
        const to = new Date(today.getFullYear(), today.getMonth() + 1, 0);

        return await Promise.all([
            this.client.query('SELECT Name AS groupName, Created AS created, Description AS description, Status AS status, MaxUsers AS maxMembers FROM Groups WHERE GID = ID_TO_BIN(?) LIMIT 1;', [groupID]),
            this.listGroupMembers(groupID),
            this.listGroupIncentives(groupID),
            this.getGroupTransactions(groupID, from, to)
        ]).then(async data => {
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
        });
    }

    /**
     * Gets all information about about a user and the groups they are part of identified by a session token
     * @param sessionToken A valid session token that references the desired user
     * @returns Object containing all all information about a given user groups they are in
     */
    public async getDashboard(sessionToken: string) {
        return await Promise.all([
            this.getFullUser(sessionToken),
            this.client.query('SELECT BIN_TO_ID(Memberships.GID) AS groupID FROM Memberships RIGHT JOIN Sessions ON Memberships.UID = Sessions.UID WHERE Sessions.Token = ID_TO_BIN(?) AND Sessions.Expires > NOW() AND Sessions.Active = 1;', [sessionToken]).then(async groups => {
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

    /* Setter Methods */

    
}