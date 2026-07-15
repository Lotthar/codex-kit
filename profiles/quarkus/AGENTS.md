# Quarkus profile

Apply this profile after the generic and Java profiles. Preserve the detected Quarkus platform, REST stack, persistence choice, build mode, and deployment target.

## Discover the application

- Read the Quarkus BOM/plugin configuration, application config, extensions, and wrapper scripts.
- Identify Quarkus REST versus legacy RESTEasy, imperative versus reactive paths, Hibernate ORM versus Reactive, and messaging extensions.
- Inspect CDI scopes, qualifiers, interceptors, config mappings, test profiles, Dev Services, and native-image configuration.
- Find resource, service, repository, client, event, and transaction boundaries related to the task.
- Preserve package and module boundaries from the Java profile.
- Do not add an extension until existing platform or JDK capabilities have been checked.

## Build-time and runtime behavior

- Remember that Quarkus resolves substantial configuration and augmentation at build time.
- Treat extension, indexing, reflection, proxy, and native resource changes as build-impacting.
- Do not use runtime classpath scanning assumptions without verifying Quarkus support.
- Keep generated sources and `target/` or `build/` output untouched.
- Preserve dev, test, and production configuration differences.
- Verify JVM packaging before native mode unless the task is specifically native-only.
- Add native reflection or resource metadata only for a demonstrated native failure.

## CDI and architecture

- Keep REST resources and message consumers thin.
- Put use-case behavior in cohesive CDI beans or domain services following local structure.
- Use constructor injection or the repository's established CDI injection style consistently.
- Select bean scopes intentionally; avoid accidental application-wide mutable state.
- Use qualifiers when multiple implementations are real, not speculative.
- Keep interceptor annotations at meaningful policy boundaries such as transactions or security.
- Avoid depending on implementation-specific proxies or self-invocation behavior.
- Do not create a bean wrapper that only delegates without adding policy or composition.

## REST and reactive boundaries

- Validate params, query values, headers, and request entities at the HTTP boundary.
- Preserve method, path, media type, status, and error contract behavior.
- Use exception mappers for stable client-facing errors without leaking internal details.
- Do not block I/O or event-loop threads in reactive endpoints.
- Mark or move blocking work according to the application's execution model.
- Preserve cancellation and failure semantics in reactive chains.
- Keep DTO and persistence entity boundaries consistent with the repository.
- Enforce authorization on the endpoint or service boundary, not only in client code.

## Configuration and secrets

- Use MicroProfile Config or typed config mappings according to local conventions.
- Keep the `quarkus.` namespace for Quarkus configuration.
- Use `%dev` and `%test` overrides only for environment-specific behavior.
- Do not commit production secrets or print resolved secret values.
- Preserve config source precedence and deployment-provided overrides.
- Treat HTTP, TLS, CORS, OIDC, datasource, and management settings as security-sensitive.
- Document new keys with safe defaults or explicit required status.

## Transactions and persistence

- Place `@Transactional` at the operation boundary that owns consistency.
- Understand default rollback behavior before translating exceptions.
- Keep remote calls outside transactions when possible.
- Avoid accessing lazy state after transaction or session closure.
- Bound queries and prevent N+1 behavior using the chosen ORM's supported mechanisms.
- Use `@TestTransaction` only when rollback-after-test matches the behavior under test.
- Treat schema generation and migration settings as environment-sensitive.
- Never switch production schema handling to destructive recreation as a shortcut.

## Messaging, jobs, and external services

- Preserve acknowledgment, retry, dead-letter, ordering, and backpressure semantics.
- Make repeated delivery safe where the transport is at-least-once.
- Keep scheduled work safe across multiple instances.
- Use existing REST Client or messaging abstractions instead of ad hoc network code.
- Configure timeouts and failure handling at external boundaries.
- Keep test services local through Dev Services or existing test resources.

## Security

- Use supported Quarkus Security mechanisms and standard authorization annotations.
- Default to least privilege and test positive and negative role cases.
- Do not disable authorization in production code or config to simplify testing.
- Use test security identities only in test sources and profiles.
- Keep tokens, credentials, cookies, and personal data out of logs.
- Preserve OIDC audience, issuer, TLS, and token-validation rules.

## Commands

Use committed wrappers and project tasks. Typical examples:

```text
./mvnw -Dtest=ExampleTest test
./mvnw verify
./mvnw package
./gradlew test --tests 'package.ExampleTest'
./gradlew quarkusBuild
```

- Use Quarkus dev mode for local exploration, not as the only validation.
- Run native tests/builds only when native behavior changed or release requirements demand them.
- Prefer focused JVM tests before integration or native suites.

## Testing

- Use plain unit tests for logic that does not need CDI or Quarkus runtime.
- Use component tests for CDI wiring with a lighter container when configured.
- Use `@QuarkusTest` for HTTP, config, CDI, persistence, and extension integration.
- Use test profiles for meaningfully different configurations, keeping profile count small.
- Use test resources or Dev Services for local infrastructure; never point tests at shared production services.
- Test secured behavior with explicit users and roles, including denied access.
- Verify transaction rollback or persistence explicitly when it is part of behavior.
- Use integration/native tests for packaging-specific behavior rather than duplicating all unit coverage.

## Skill routing and delegation

- Use `quarkus-general` when available for Quarkus implementation and validation.
- Use `api-endpoint-change` for REST contracts and `database-migration` for schema work.
- Use generic debugging and implementation skills for cross-layer failures or approved plans.
- Delegate CDI/REST/persistence mapping or native-risk review for medium changes.
- Use one-level workers for non-overlapping resource and adapter slices only after contracts are fixed.
- Keep shared config, BOM/build files, security policy, DTOs, and migrations under one writer.

## Definition of done

- CDI, execution-model, transaction, and config boundaries remain valid.
- Focused JVM tests and applicable integration/build checks pass.
- Native-specific metadata is added only when required and verified when feasible.
- Security roles include allowed and denied coverage.
- No generated output, secret, or unrelated extension change entered the diff.

## Reference anchors

- Quarkus testing: https://quarkus.io/guides/getting-started-testing
- Quarkus REST: https://quarkus.io/guides/rest
- Quarkus configuration: https://quarkus.io/guides/config
- Quarkus security testing: https://quarkus.io/guides/security-testing
