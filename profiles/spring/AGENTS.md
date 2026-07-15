# Spring Boot profile

Apply this profile after the generic and Java profiles. Preserve the detected Spring Boot generation, web stack, persistence stack, and project architecture.

## Discover the application

- Read the parent build, Spring Boot plugin/BOM, application entry point, and configuration files.
- Identify MVC versus WebFlux, JDBC/JPA versus reactive persistence, servlet versus reactive security, and migration tooling.
- Inspect package layout, component scanning, profiles, configuration properties, exception handling, and test conventions.
- Find controllers, application services, repositories, clients, events, schedulers, and messaging boundaries related to the task.
- Preserve multi-module and package visibility boundaries.
- Do not mix blocking and reactive stacks without an explicit adapter and execution strategy.

## Architecture and dependency direction

- Keep controllers and message listeners focused on transport mapping, validation, authorization context, and response mapping.
- Put use-case orchestration and transaction ownership in the established application/service layer.
- Keep repositories focused on persistence access, not transport or presentation concerns.
- Keep domain rules independent of Spring annotations where the existing architecture supports it.
- Keep external clients behind existing adapter boundaries.
- Do not create services that merely forward a repository call without adding a boundary or policy.
- Avoid field injection; preserve or use constructor injection according to local conventions.
- Keep the main application class small so test slices and component scanning remain predictable.

## Configuration

- Use typed `@ConfigurationProperties` for cohesive structured configuration when consistent with the project.
- Preserve property naming, validation, and override order.
- Keep secrets external; never commit credentials in `application*.properties` or YAML.
- Use profiles for environment variation, not arbitrary business branching.
- Do not add global bean overrides or broad component scans to fix a local wiring issue.
- Treat actuator exposure, management ports, logging, and proxy settings as security-sensitive.
- Document new required variables by name and safe example only.

## Web and API boundaries

- Validate request bodies, path variables, query parameters, headers, and multipart input.
- Keep API DTOs separate from persistence entities when the repository follows that boundary.
- Preserve status codes, error schema, content types, pagination, and compatibility expectations.
- Use centralized exception mapping for stable client errors; do not expose stack traces or internal exception text.
- Enforce authorization in trusted controller/service method boundaries.
- Treat redirects, forwarded headers, CORS, CSRF, cookies, and uploads as security-sensitive.
- Avoid returning JPA entities directly when it leaks lazy relations or persistence shape.
- Keep idempotency and transaction behavior explicit for mutating endpoints.

## Transactions and persistence

- Put transaction boundaries around complete business operations.
- Keep remote calls out of database transactions when consistency does not require them.
- Understand rollback rules before catching or translating exceptions.
- Avoid self-invocation assumptions for proxy-based annotations.
- Prevent accidental N+1 queries with repository-supported fetch strategies and measured tests.
- Do not solve lazy-loading failures by globally enabling wider session scope.
- Bound collection queries with pagination or explicit limits.
- Treat migrations as forward-compatible, reviewable, and separately validated changes.
- Never enable automatic destructive schema changes for production as a shortcut.

## Events, jobs, and messaging

- Define whether publication occurs before, during, or after transaction commit.
- Make consumers idempotent where delivery can repeat.
- Preserve retry, dead-letter, ordering, and acknowledgment semantics.
- Keep scheduled jobs safe under multiple application instances.
- Propagate correlation context without logging sensitive payloads.
- Do not perform unbounded work on request or listener threads.

## Security

- Preserve the configured `SecurityFilterChain` or reactive equivalent.
- Default to least privilege and test both allowed and denied roles.
- Never disable CSRF, authorization, or method security merely to make a test pass.
- Keep password encoding, token verification, and session handling in supported Spring Security components.
- Avoid logging authentication credentials, bearer tokens, cookies, or personal data.
- Treat deserialization and expression evaluation configuration as trust boundaries.

## Commands

Use the Java profile's wrapper commands and repository-specific profiles. Typical focused forms:

```text
./mvnw -Dtest=ExampleTest test
./mvnw verify
./gradlew test --tests 'package.ExampleTest'
./gradlew check
```

- Use a test profile only when the repository defines it.
- Start the application for smoke testing only after focused checks pass.
- Verify packaging when configuration, auto-configuration, AOT, or deployment behavior changes.

## Testing

- Use plain unit tests for domain and application logic without Spring wiring.
- Use test slices for focused web, persistence, JSON, or client behavior when their configuration matches the task.
- Use `@SpringBootTest` when the full application context is part of the behavior; do not default to it for every test.
- Keep context configurations reusable so Spring's test context cache remains effective.
- Use real local containers or repository-approved test doubles for infrastructure integration.
- Test transaction commit/rollback and database constraints at the integration boundary.
- For secured endpoints, cover unauthenticated, forbidden, and allowed cases.
- For APIs, assert status, headers, contract shape, and safe error output.
- Keep test-only configuration under `@TestConfiguration` or established test sources.

## Skill routing and delegation

- Use `api-endpoint-change` for controller/API contract work when available.
- Use `database-migration` for schema changes and `debug-fix-with-subagents` for non-trivial context or transaction failures.
- Use generic planning and implementation skills for cross-layer work.
- Delegate endpoint-to-service-to-repository mapping or test-slice discovery for medium changes.
- Use one-level workers for non-overlapping adapters only after DTO and transaction contracts are fixed.
- Keep shared configuration, security chains, parent builds, DTOs, and migrations under one writer.

## Definition of done

- Spring wiring and configured application context start where relevant.
- API, transaction, persistence, and security contracts are tested at the appropriate level.
- No blocking/reactive boundary was crossed accidentally.
- Focused tests plus applicable integration, static, and packaging checks pass.
- Configuration contains no secret and migrations remain deliberate.

## Reference anchors

- Spring Boot testing: https://docs.spring.io/spring-boot/reference/testing/spring-boot-applications.html
- Externalized configuration: https://docs.spring.io/spring-boot/reference/features/external-config.html
- Spring Security: https://docs.spring.io/spring-security/reference/
