run:
	deno run --allow-net --allow-read=./static,preferences.json mod.ts

setup-db:
	./setup/db-setup.sh

clean-db:
	./setup/db-clean.sh

test:
	./tests/tests.sh