#!/bin/bash

echo -e "\033[1mCreating user account on local MySQL server...\033[0m\n"

echo -e "Enter username: "
read uname
echo -e "Enter password: \033[8m"
read pwd

echo -e "\033[0m\nSetting up database..."
sudo mysql -u root < ./setup/db-setup.sql
echo -e "\033[2;32m[Complete]\033[0m"

echo -e "\nCreating user: $uname..."
sudo mysql -u root <<MYSQL_SCRIPT
USE roomates;
CREATE USER IF NOT EXISTS '$uname'@'localhost' IDENTIFIED BY '$pwd';
GRANT EXECUTE ON FUNCTION BIN_TO_ID TO '$uname'@'localhost';
GRANT EXECUTE ON FUNCTION ID_TO_BIN TO '$uname'@'localhost';
GRANT EXECUTE ON FUNCTION COUNT_MEMBERS TO '$uname'@'localhost';
GRANT EXECUTE ON FUNCTION SUM_EXPENSES TO '$uname'@'localhost';
GRANT EXECUTE ON FUNCTION CALC_SHARE TO '$uname'@'localhost';
GRANT SELECT, INSERT, UPDATE (Uname, PwdHash, HashAlgorithm, FailedLoginAttempts, Fname, Lname, Email) ON roomates.Users TO '$uname'@'localhost';
GRANT SELECT, INSERT ON roomates.Sessions TO '$uname'@'localhost';
GRANT SELECT, INSERT, UPDATE (Active) ON roomates.Sessions TO '$uname'@'localhost';
GRANT SELECT, INSERT, UPDATE (Name, Description, Status, MaxUsers) ON roomates.Groups TO '$uname'@'localhost';
GRANT SELECT, INSERT, UPDATE (LeftGroup) ON roomates.Memberships TO '$uname'@'localhost';
GRANT SELECT, INSERT, UPDATE (Name, Description, Amount, End, OnPurchase) ON roomates.IncentivesAvailable TO '$uname'@'localhost';
GRANT SELECT, INSERT ON roomates.Purchases TO '$uname'@'localhost';
GRANT SELECT, INSERT ON roomates.Incentives TO '$uname'@'localhost';
FLUSH PRIVILEGES;
MYSQL_SCRIPT
echo -e "\033[2;32m[Complete]\033[0m"

