# Java profile

Apply after the generic profile. Framework profiles add runtime and adapter rules.

## Build and boundaries

- Read `pom.xml` or Gradle settings/build files, wrapper metadata, CI, toolchains, module boundaries, annotation processors, generated sources, and configured formatter/static-analysis/test plugins. Use committed `mvnw`/`gradlew` (or Windows wrappers); do not change wrappers, plugins, BOMs, repositories, or toolchains incidentally.
- Detect the configured Java level before using newer language APIs. Preserve package/module dependency direction, package-private seams, JPMS exports/service providers, and source/binary-compatible public APIs unless change is authorized.
- Keep entry points/adapters thin and domain invariants with their owning model/use case. Do not add one-implementation interfaces or cyclic dependencies. Keep persistence entities, wire DTOs, and domain models separate where the project does.

## Java safety

- Follow local nullability, immutability, exception, and logging conventions; keep generics precise, avoid raw/unchecked casts, and validate constructor/factory invariants once.
- Translate infrastructure exceptions at adapter boundaries without losing cause; never broadly catch `Exception`/`Throwable`, expose internal errors, or log secrets/personal payloads. Preserve interruption and correlation context.
- Close streams, files, database resources, and clients through existing lifecycles. Make shared mutable state and executor ownership explicit; do not block reactive/event-loop threads or add parallel streams without an understood execution model.
- Validate deserialized input and make time zones, locale, decimals, and IDs explicit at external boundaries. Treat schema, serialization, and generated-source changes as compatibility work.

## Commands and tests

```text
./mvnw -Dtest=ClassName#method test
./mvnw verify
./gradlew test --tests 'package.ClassName.method'
./gradlew check
```

- Run a module-scoped or filtered check first; avoid routine `clean`. Use configured JUnit/assertion tools, unit-test domain behavior without a framework, and add integration coverage for persistence, transactions, serialization, modules, and external adapters. Assert observable contracts and deterministic failure types.

## Routing and done

- Use framework profiles/skills for framework code and specific migration/API/debug/refactor skills when applicable. For medium multi-module work, map dependencies and quality gates first; keep parent builds, settings/catalogs, shared DTOs, and migrations under one writer.
- Done: code targets the configured Java level; package/module/public boundaries, resources, concurrency, and error behavior are intentional; focused tests plus applicable static analysis, format, and build checks pass; metadata/generated sources changed only when required.

## Reference anchors

- Java language updates: https://docs.oracle.com/en/java/javase/21/language/
- Maven Wrapper: https://maven.apache.org/wrapper/
- Gradle Wrapper: https://docs.gradle.org/current/userguide/gradle_wrapper.html
