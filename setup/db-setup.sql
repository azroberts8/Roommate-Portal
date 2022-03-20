/* Must be using MariaDB */

/* Create the database */
CREATE DATABASE IF NOT EXISTS roomates;
use roomates;

/* Create ID & expense calculation functions */
DELIMITER //
CREATE FUNCTION IF NOT EXISTS BIN_TO_ID(b BINARY(16))
RETURNS CHAR(36)
BEGIN
DECLARE hexStr CHAR(32);
SET hexStr = HEX(b);
RETURN LOWER(CONCAT(SUBSTR(hexStr, 1, 8), '-', SUBSTR(hexStr, 9, 4), '-', SUBSTR(hexStr, 13, 4), '-', SUBSTR(hexStr, 17, 4), '-', SUBSTR(hexStr, 21)));
END//

CREATE FUNCTION IF NOT EXISTS ID_TO_BIN(id CHAR(36))
RETURNS BINARY(16)
BEGIN
RETURN UNHEX(REPLACE(id, '-', ''));
END//

CREATE FUNCTION IF NOT EXISTS COUNT_MEMBERS(groupID BINARY(16), fromDate date, toDate date)
RETURNS TINYINT(255) unsigned
BEGIN
DECLARE temp INT;
SELECT COUNT(DISTINCT UID) INTO temp FROM Memberships WHERE GID = groupID AND (LeftGroup IS NULL OR LeftGroup >= fromDate) AND JoinedGroup <= toDate;
RETURN temp;
END//

CREATE FUNCTION IF NOT EXISTS SUM_EXPENSES(groupID BINARY(16), fromDate date, toDate date)
RETURNS DECIMAL(7,2)
BEGIN
DECLARE temp DECIMAL(7,2);
SELECT (
	SELECT IFNULL(SUM(Amount), 0)
	FROM Purchases
	WHERE GID = groupID
	AND Date BETWEEN fromDate AND toDate
) + (
	SELECT IFNULL(SUM(IncentivesAvailable.Amount), 0)
	FROM Incentives
	RIGHT JOIN IncentivesAvailable ON Incentives.IID = IncentivesAvailable.IID
	WHERE IncentivesAvailable.GID = groupID
	AND Incentives.Date BETWEEN fromDate AND toDate
) INTO temp;
RETURN temp;
END//

CREATE FUNCTION IF NOT EXISTS CALC_SHARE(groupID BINARY(16), fromDate date, toDate date)
RETURNS DECIMAL(6,2)
BEGIN
DECLARE temp DECIMAL(6,2);
SELECT ROUND(SUM_EXPENSES(groupID, fromDate, toDate) DIV COUNT_MEMBERS(groupID, fromDate, toDate), 2) INTO temp;
RETURN temp;
END//

/* ---## Create Tables ##--- */

/* Create Users table */
CREATE TABLE IF NOT EXISTS Users (
	UID BINARY(16) NOT NULL,
	Uname VARCHAR(30) NOT NULL,
	PwdHash CHAR(60) NOT NULL,
	HashAlgorithm ENUM('bcrypt') NOT NULL DEFAULT 'bcrypt',
	FailedLoginAttempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
	DateJoined date NOT NULL DEFAULT NOW(),
	Fname VARCHAR(30) NOT NULL,
	Lname VARCHAR(30) NOT NULL,
	Email VARCHAR(60) NOT NULL,
	PRIMARY KEY (UID),
	UNIQUE(Uname),
	UNIQUE(Email)
);

/* Create Sessions table */
CREATE TABLE IF NOT EXISTS Sessions (
	Token BINARY(16) NOT NULL,
	UID BINARY(16) NOT NULL,
	Expires DATETIME NOT NULL DEFAULT DATE_ADD(NOW(), INTERVAL 1 MONTH),
	Active BOOLEAN NOT NULL DEFAULT 1,
	PRIMARY KEY (Token),
	FOREIGN KEY (UID) REFERENCES Users(UID)
);

/* Create Groups table */
CREATE TABLE IF NOT EXISTS Groups (
	Created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	GID BINARY(16) NOT NULL,
	Name VARCHAR(30) NOT NULL,
	Description VARCHAR(1024),
	Status ENUM('open','locked') NOT NULL DEFAULT 'open',
	MaxUsers TINYINT UNSIGNED,
	PRIMARY KEY (GID)
);

/* Create Memberships table */
CREATE TABLE IF NOT EXISTS Memberships (
	UID BINARY(16) NOT NULL,
	GID BINARY(16) NOT NULL,
	JoinedGroup DATE NOT NULL,
	LeftGroup DATE,
	FOREIGN KEY (UID) REFERENCES Users(UID),
	FOREIGN KEY (GID) REFERENCES Groups(GID)
);

/* Create Available Incentives Table */
CREATE TABLE IF NOT EXISTS IncentivesAvailable (
	IID BINARY(16) NOT NULL,
	GID BINARY(16) NOT NULL,
	Name VARCHAR(30) NOT NULL,
	Description VARCHAR(1024),
	Amount DECIMAL(5,2) NOT NULL,
	Begin DATE NOT NULL,
	End DATE,
	OnPurchase BOOLEAN NOT NULL DEFAULT '0',
	PRIMARY KEY (IID),
	FOREIGN KEY (GID) REFERENCES Groups(GID),
	UNIQUE(GID,Name)
);

/* Create Purchases table */
CREATE TABLE IF NOT EXISTS Purchases (
	UID BINARY(16) NOT NULL,
	GID BINARY(16) NOT NULL,
	Date DATE NOT NULL DEFAULT(CURRENT_DATE),
	Store VARCHAR(30),
	Amount DECIMAL(5,2) NOT NULL,
	Notes VARCHAR(1024),
	FOREIGN KEY (UID) REFERENCES Users(UID),
	FOREIGN KEY (GID) REFERENCES Groups(GID)
);

/* Create Incentives Table */
CREATE TABLE IF NOT EXISTS Incentives (
	UID BINARY(16) NOT NULL,
	IID BINARY(16) NOT NULL,
	Date DATE NOT NULL,
	Notes VARCHAR(1024)
);

