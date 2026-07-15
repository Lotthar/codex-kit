# Java profile

Apply this profile after the generic profile. Framework profiles add their own runtime and adapter rules.

## Discover the build

- Read `pom.xml` or Gradle settings/build files, wrapper metadata, toolchains, and CI configuration.
- Use `mvnw`/`mvnw.cmd` or `gradlew`/`gradlew.bat` when committed.
- Detect the configured Java language level before using records, sealed types, pattern matching, or newer APIs.
- Identify multi-module boundaries, dependency management, annotation processors, and generated-source directories.
- Find formatter, static-analysis, coverage, integration-test, and packaging plugins before selecting commands.
- Do not change wrapper, plugins, BOMs, repositories, or toolchains as part of unrelated work.

## Packages and architecture

- Preserve package and module dependency direction.
- Keep domain logic independent of framework, transport, persistence, and serialization details where the existing architecture does.
- Keep entry points and adapters thin; put invariants close to the domain model or use case that owns them.
- Respect package-private boundaries instead of making members public for tests.
- Avoid cyclic dependencies between modules or packages.
- Do not create an interface for one implementation unless it marks a real boundary or test seam.
- Keep public APIs source- and binary-compatible unless change is explicitly authorized.
- Treat exported JPMS packages and service providers as public contracts.

## Language and API design

- Follow existing naming, nullability, immutability, and exception conventions.
- Prefer immutable value objects and records when supported and semantically appropriate.
- Validate constructor or factory invariants once at the owning boundary.
- Use collections interfaces in APIs and return ownership-safe views or copies when mutation would leak.
- Prefer enums or sealed hierarchies over stringly typed closed sets when supported by local style.
- Keep generics precise; avoid raw types and unchecked casts.
- Use `Optional` according to project convention, usually for return values rather than fields or parameters.
- Override `equals`, `hashCode`, and `toString` consistently for value semantics.
- Avoid reflection and dynamic class loading unless the framework or requirement needs them.

## Exceptions and observability

- Use exceptions for exceptional outcomes, not routine branching.
- Preserve checked versus unchecked exception policy at module boundaries.
- Translate infrastructure exceptions at the adapter boundary without discarding their cause.
- Do not catch `Exception` or `Throwable` unless an entry point must isolate failures and rethrow or report intentionally.
- Keep client-facing messages safe and logs diagnostic.
- Do not log secrets, tokens, personal data, or full sensitive payloads.
- Use parameterized logging rather than eager string construction.
- Preserve trace or correlation context through asynchronous boundaries.

## Concurrency and resources

- Prefer structured, existing executors and concurrency utilities over manual thread management.
- Make thread-safety and ownership explicit for mutable shared state.
- Do not block event-loop or reactive threads in framework profiles.
- Close streams, files, database resources, and clients with established lifecycle patterns.
- Preserve interruption status when handling `InterruptedException`.
- Avoid parallel streams unless workload, ordering, and execution context are understood.
- Use timeouts and cancellation for external calls where project APIs support them.

## Persistence and serialization boundaries

- Keep persistence entities, wire DTOs, and domain models distinct when the repository already separates them.
- Validate deserialized input before domain use.
- Avoid exposing lazy persistence collections across closed sessions or transaction boundaries.
- Treat schema, serialization, and migration changes as compatibility work.
- Never edit generated clients, metamodels, or sources directly.
- Make time zones, locale, decimals, and identifiers explicit at external boundaries.

## Dependencies and build integrity

- Prefer JDK and existing library capabilities before adding a dependency.
- Keep dependency scope narrow and versions managed by the repository's BOM or catalog.
- Avoid dynamic or snapshot versions unless the repository explicitly uses them.
- Preserve dependency locks and verification metadata.
- Review annotation processors and build plugins as executable supply-chain inputs.
- Do not add repositories merely to resolve one artifact without approval.

## Commands

Use the detected wrapper and existing lifecycle. Examples are fallbacks:

```text
./mvnw -Dtest=ClassName#method test
./mvnw test
./mvnw verify
./gradlew test --tests 'package.ClassName.method'
./gradlew check
./gradlew build
```

- On Windows use the committed `.cmd` or `.bat` wrapper.
- Prefer a module-scoped or test-filtered command first.
- Do not use `clean` routinely; it discards useful incremental state and can hide ownership mistakes.

## Testing

- Use the configured JUnit generation and assertion/mocking libraries.
- Test domain behavior without a framework context when possible.
- Use integration tests for persistence, transactions, serialization, modules, and external adapters.
- Assert observable behavior and contracts, not private implementation details.
- Use deterministic clocks, IDs, and data builders through existing seams.
- Avoid excessive mocking of value objects or the class under test.
- Verify exception type and meaningful contract, not brittle full messages unless the message is public API.
- Keep integration resources isolated and reliably cleaned up.

## Skill routing and delegation

- Use `targeted-codebase-work` for bounded Java changes when no framework-specific skill applies.
- Use the applicable Spring or Quarkus profile and skill for framework code.
- Route migrations, API changes, debugging, and refactoring to their specific skills when available.
- Delegate multi-module dependency mapping or quality-gate discovery for medium work.
- Use one-level workers only for non-overlapping modules after contracts are agreed.
- Keep parent POMs, Gradle settings, version catalogs, shared DTOs, and migrations under one writer.

## Definition of done

- Code compiles at the configured language level.
- Package, module, and public API boundaries remain coherent.
- Focused tests and applicable static analysis, formatting, and build lifecycle pass.
- Resources, concurrency, and error behavior are intentional.
- Build metadata and generated sources changed only when required.

## Reference anchors

- Java language updates: https://docs.oracle.com/en/java/javase/21/language/
- Maven Wrapper: https://maven.apache.org/wrapper/
- Gradle Wrapper: https://docs.gradle.org/current/userguide/gradle_wrapper.html
