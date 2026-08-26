# Spring Boot profile

Apply after generic and Java profiles. Preserve the detected Boot generation, web/persistence/security stack, and package architecture.

## Discovery and architecture

- Read the parent build, Boot plugin/BOM, entry point, config, profiles, component scanning, exception handling, and test conventions. Identify MVC/WebFlux, JDBC/JPA/reactive persistence, servlet/reactive security, migrations, and task-relevant controllers, services, repositories, clients, events, and jobs.
- Keep controllers/listeners to transport mapping, validation, authorization context, and response mapping; own use-case orchestration/transactions in the established service layer; keep repositories persistence-only and external clients behind adapters. Preserve constructor injection and a small application class; do not mix blocking/reactive paths without an explicit execution strategy.

## Config, HTTP, persistence, security

- Use existing typed configuration/property validation. Keep secrets external, profile variation environmental, and actuator, proxy, logging, management, and global bean-scan changes security-sensitive. Document new variable names with safe examples only.
- Validate request inputs and uploads. Preserve API status/error/content-type/pagination contracts; use stable central exception mapping; keep DTO/entity boundaries and enforce authorization at controller/service boundaries. Treat CORS, CSRF, cookies, redirects, and forwarded headers as trust boundaries.
- Put transactions around whole business operations, understand rollback/proxy self-invocation, keep remote calls out when possible, bound queries, and prevent N+1 with supported fetch strategies. Keep migrations forward-compatible; never enable destructive production schema changes.
- Preserve event commit, retry, dead-letter, ordering, acknowledgement, idempotency, and multi-instance job semantics. Keep `SecurityFilterChain` (or reactive equivalent), supported token/session/password handling, least privilege, and safe logs intact.

## Commands and tests

```text
./mvnw -Dtest=ExampleTest test
./mvnw verify
./gradlew test --tests 'package.ExampleTest'
./gradlew check
```

- Use plain unit tests first, then matching test slices for web/persistence/JSON/clients; use `@SpringBootTest` only when the whole context is behavior. For secured APIs cover unauthenticated, forbidden, and allowed cases, plus API contract and transaction/constraint behavior. Use local containers or project-approved doubles only.

## Routing and done

- Use `api-endpoint-change` for controller contracts, `database-migration` for schema work, and `debug-fix-with-subagents` for non-trivial context/transaction failures. Keep shared config, security chains, parent builds, DTOs, and migrations under one writer.
- Done: relevant wiring starts; API, transaction, persistence, and security contracts are tested at the right level; no accidental blocking/reactive crossing; focused tests plus applicable integration/static/packaging checks pass; configuration is secret-free.

## Reference anchors

- Spring Boot testing: https://docs.spring.io/spring-boot/reference/testing/spring-boot-applications.html
- Externalized configuration: https://docs.spring.io/spring-boot/reference/features/external-config.html
- Spring Security: https://docs.spring.io/spring-security/reference/
