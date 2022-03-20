#!/bin/bash

echo -e "\033[1mCleaning database...\033[0m\n"

echo -e "\033[0m\nDropping database..."
sudo mysql -u root <<MYSQL_SCRIPT
DROP DATABASE IF EXISTS roomates;
MYSQL_SCRIPT
echo -e "\033[2;32m[Complete]\033[0m"

echo -e "\033[0m\nSetting up database..."
sudo mysql -u root < ./setup/db-setup.sql
echo -e "\033[2;32m[Complete]\033[0m"