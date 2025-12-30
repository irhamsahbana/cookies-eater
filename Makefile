PORT ?= 3333
EMAIL ?=
PASSWORD ?=
COMPANY_ID ?=
URL ?=

.PHONY: setup install puppeteer-install build start start-local start-prod dev clean access-token

setup: install build

install:
	 npm install

puppeteer-install:
	 npx puppeteer browsers install chrome

build:
	 npm run build

start:
	 npm start

start-local:
	 ENVIRONMENT=LOCAL PORT=$(PORT) npm start

start-prod:
	 ENVIRONMENT=PRODUCTION PORT=$(PORT) npm start

dev:
	 npx ts-node index.ts

clean:
	 rm -rf dist

access-token:
	 curl -sS -X POST http://localhost:$(PORT)/access-token -H 'Content-Type: application/json' -d '{"email":"$(EMAIL)","password":"$(PASSWORD)","companyId":"$(COMPANY_ID)","url":"$(URL)"}'
