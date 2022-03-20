#!/bin/bash

echo -e "Enter Testfile: "
read file

echo -e "\n\033[1mRunning Test: $file...\033[0m\n";
/home/ubuntu/.deno/bin/deno run --allow-net --allow-read=./static,settings.json ./tests/$file