.PHONY: up down build logs ps restart shell-backend shell-db migrate

## Start everything in the background
up:
	docker compose up -d --build

## Stop everything
down:
	docker compose down

## Rebuild images without cache
build:
	docker compose build --no-cache

## Tail logs (all services). Use: make logs s=backend
logs:
	docker compose logs -f $(s)

## Show running containers
ps:
	docker compose ps

## Restart a specific service. Usage: make restart s=backend
restart:
	docker compose restart $(s)

## Open a shell in the backend container
shell-backend:
	docker compose exec backend bash

## Open a psql shell in the database
shell-db:
	docker compose exec db psql -U postgres mamu
