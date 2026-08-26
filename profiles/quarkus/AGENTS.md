# Quarkus profile

Apply after generic and Java profiles. Preserve the detected Quarkus platform, REST/persistence stack, build mode, and deployment target.

## Discovery and build behavior

- Read the Quarkus BOM/plugin, config, extensions, wrappers, CDI scopes/qualifiers/interceptors, config mappings, test profiles, Dev Services, and native-image config. Identify REST versus RESTEasy, imperative/reactive paths, ORM/reactive persistence, messaging, and task-relevant resource/service/repository/client boundaries. Do not add extensions until existing platform/JDK capabilities are checked.
- Quarkus configures and augments at build time: treat extension, indexing, reflection, proxy, resource, and native changes as build-impacting. Preserve dev/test/production differences, leave generated and build output untouched, verify JVM packaging before native unless native-only, and add native metadata only for a demonstrated failure.

## CDI, HTTP, persistence, security

- Keep REST resources/message consumers thin; put use cases in cohesive CDI/domain services. Use the local injection style, deliberate scopes, qualifiers only for real alternatives, and policy-boundary interceptors. Do not depend on proxy/self-invocation behavior or write a delegating bean wrapper.
- Validate HTTP input; preserve method/path/media/status/error contracts; use exception mappers without internal leakage; never block reactive event-loop endpoints; preserve reactive cancellation/failure semantics; maintain DTO/entity separation and trusted authorization boundaries.
- Use MicroProfile Config or existing typed mappings, preserve source precedence and deployment overrides, keep secrets out of config/logs, and treat HTTP/TLS/CORS/OIDC/datasource/management settings as security-sensitive.
- Place `@Transactional` at consistency boundaries, understand rollback, avoid remote calls inside transactions when possible, bound queries/lazy state, and keep schema generation/migrations environment-safe. Preserve messaging retry, acknowledgement, ordering, backpressure, idempotency, and safe multi-instance schedules. Keep OIDC issuer/audience/TLS/token rules and least privilege intact.

## Commands and tests

```text
./mvnw -Dtest=ExampleTest test
./mvnw verify
./mvnw package
./gradlew test --tests 'package.ExampleTest'
./gradlew quarkusBuild
```

- Run focused JVM tests first. Use unit tests outside CDI, configured component tests for light wiring, and `@QuarkusTest` for HTTP/config/CDI/persistence/extensions; use local Dev Services/test resources only. Cover allowed and denied roles and explicit transaction behavior. Run integration/native checks only for packaging/native changes.

## Routing and done

- Use `quarkus-general`, `api-endpoint-change`, and `database-migration` when applicable; map CDI/REST/persistence or native risks before medium cross-layer work. Keep shared config, BOM/build, security policy, DTOs, and migrations under one writer.
- Done: CDI, execution-model, transaction, and config boundaries remain valid; focused JVM plus applicable integration/build checks pass; native metadata is necessary and verified when feasible; role coverage includes denied access; no generated output, secrets, or unrelated extension changes entered the diff.

## Reference anchors

- Quarkus testing: https://quarkus.io/guides/getting-started-testing
- Quarkus REST: https://quarkus.io/guides/rest
- Quarkus configuration: https://quarkus.io/guides/config
- Quarkus security testing: https://quarkus.io/guides/security-testing
