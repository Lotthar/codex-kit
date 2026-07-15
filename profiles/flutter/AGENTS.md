# Flutter profile

Apply this profile after the generic profile. Preserve the app's established architecture, state management, navigation, supported platforms, and Dart language constraints.

## Discover the application

- Read `pubspec.yaml`, `analysis_options.yaml`, lockfile, platform configs, and CI workflows.
- Identify Flutter and Dart constraints before using new language or framework APIs.
- Inspect feature layout, state-management choice, navigation, dependency injection, localization, themes, and generated-code tools.
- Find the affected screen, widgets, view model/controller/state, repository, service, and tests before editing.
- Detect packages or federated plugins in a workspace and respect their public boundaries.
- Never edit `.dart_tool/`, `build/`, generated registrants, or generated Dart files directly.

## Architecture and data flow

- Follow the repository's architecture; do not migrate the app to a new pattern during feature work.
- Keep UI rendering separate from data access and external services.
- Keep widgets focused on layout, presentation, simple interaction, and lifecycle-aware orchestration.
- Put business and state-transition logic in the existing view model, controller, bloc, notifier, or domain boundary.
- Keep repositories as sources of truth when the project uses that pattern.
- Keep services focused on external APIs, storage, or platform access.
- Add a domain/use-case layer only when complex or repeated logic demonstrates the need.
- Preserve unidirectional data flow and a single source of truth.
- Do not add a second state-management framework for one feature.

## Dart conventions

- Follow Effective Dart and the repository's analyzer/lint rules.
- Use consistent domain terminology and concise, intention-revealing names.
- Prefer sound, precise types over `dynamic`, unchecked casts, or sentinel values.
- Model required, optional, loading, success, and failure states explicitly.
- Prefer immutable state and value objects where the local architecture expects them.
- Use `const` constructors and widgets where semantics permit, without drive-by churn.
- Keep public APIs documented when package consumers need contracts.
- Let `dart format` own formatting.
- Do not suppress analyzer warnings without a narrow documented reason.

## Widgets and lifecycle

- Prefer composition over deep widget inheritance.
- Split widgets at meaningful responsibility or rebuild boundaries, not arbitrary line counts.
- Keep `build` methods free of side effects and expensive synchronous work.
- Do not start requests, subscriptions, or mutations from `build`.
- Create and dispose controllers, focus nodes, animation controllers, and subscriptions with clear ownership.
- Check lifecycle validity before using context or updating state after asynchronous gaps.
- Use keys when identity matters for state preservation, reordering, or tests.
- Avoid unnecessary global keys.
- Keep rebuild optimization evidence-based; measure before adding caching complexity.

## State and asynchronous work

- Preserve the selected Provider, Riverpod, Bloc, ChangeNotifier, signals, or other established pattern.
- Keep transient visual state local when it has no wider consumer.
- Represent async loading, empty, error, refresh, retry, and stale-data states deliberately.
- Cancel or ignore obsolete requests according to the existing pattern.
- Avoid concurrent duplicate submissions and uncontrolled retries.
- Keep platform, network, storage, clock, and randomness behind testable boundaries.
- Translate infrastructure errors into safe domain or presentation failures without discarding diagnostics.

## Navigation and deep links

- Follow the configured router or Navigator strategy.
- Keep route names, parameters, restoration, redirects, and guards compatible.
- Treat deep links and external route parameters as untrusted input.
- Preserve browser history semantics for Flutter web.
- Avoid passing large mutable objects through route arguments when stable identifiers suffice.
- Keep authorization enforced by the backend even when navigation guards hide screens.

## UI, accessibility, and responsiveness

- Use theme and design-system tokens instead of one-off colors, typography, and spacing.
- Support text scaling, localization expansion, safe areas, keyboard insets, and supported orientations.
- Prefer flexible constraints over device-specific pixel assumptions.
- Provide semantic labels, meaningful traversal, focus behavior, and adequate tap targets.
- Keep gestures discoverable and provide accessible alternatives where needed.
- Verify loading, empty, error, offline, and permission-denied states.
- Avoid clipping or overflow fixes that hide content without restoring access.
- Check light/dark and high-contrast behavior when the app supports them.

## Platform and plugin boundaries

- Keep platform-channel and plugin access behind an existing service or adapter.
- Preserve Android, iOS, web, desktop, and package-specific conditional behavior.
- Do not add permissions without explaining runtime, store, privacy, and platform impact.
- Treat native manifests, entitlements, signing, and deployment settings as high risk.
- Mock platform interfaces in unit/widget tests using project-supported seams.
- Use integration tests when native host behavior is essential.
- Do not assume plugins are available in plain Dart or widget-test environments.

## Persistence and security

- Do not store access tokens or sensitive data in plain preferences when secure storage is required.
- Keep secrets out of bundled assets and compile-time configuration.
- Validate decoded JSON and persisted state before use.
- Treat local storage as attacker-controlled on client devices.
- Preserve certificate, authentication, and authorization behavior.
- Avoid logging personal data, tokens, or full sensitive responses.
- Handle migration of persisted models explicitly and compatibly.

## Dependencies and generated code

- Use Flutter/Dart SDK and existing packages before adding a dependency.
- Preserve `pubspec.lock` policy for applications versus packages.
- Use declared generators through repository scripts or `dart run` only when source annotations changed.
- Review all generated diffs and keep them paired with their source changes.
- Do not hand-edit localization, serialization, routing, or DI generated files.
- Avoid broad `pub upgrade` during unrelated implementation.

## Commands

Use repository scripts first, then applicable Flutter defaults:

```text
dart format --output=none --set-exit-if-changed <touched-paths>
flutter analyze
flutter test <focused-test-path>
flutter test
flutter test integration_test
flutter build <supported-target>
```

- Use the repository's Flutter version manager when configured.
- Run generators and localization tools only when their inputs changed.
- Build only supported targets affected by the change.

## Testing

- Use unit tests for services, repositories, state transitions, formatters, and view-model/controller logic.
- Use widget tests for rendering, interaction, navigation widgets, semantics, and layout states.
- Use integration tests for critical flows, plugin integration, persistence, and platform behavior.
- Prefer many fast unit/widget tests plus enough integration coverage for important journeys.
- Pump until a meaningful condition rather than using arbitrary delays.
- Keep finders user-visible and resilient.
- Test multiple sizes and text scales for changed responsive UI.
- Update golden tests only after reviewing the rendered change intentionally.
- Keep external services mocked, sandboxed, or local.

## Skill routing and delegation

- Use `flutter-general` when available for Flutter implementation and validation.
- Use `ui-feature-implementation` for complex user-visible flows and accessibility verification.
- Use generic debugging, QA, planning, or clean-code skills when their trigger applies.
- Delegate feature-to-state-to-data mapping or platform test discovery for medium changes.
- Use one-level workers for non-overlapping platform or feature slices only after shared models are fixed.
- Keep `pubspec`, shared state models, router, generated inputs, and platform manifests under one writer.

## Definition of done

- Architecture and state-management conventions remain consistent.
- Changed UI handles relevant lifecycle, async, accessibility, and responsive states.
- Formatter, analyzer, focused tests, and applicable build/integration checks pass.
- Generated files match their sources and no generated file was hand-edited.
- No secret, unrelated dependency upgrade, or unsupported platform regression entered the diff.

## Reference anchors

- Flutter architecture recommendations: https://docs.flutter.dev/app-architecture/recommendations
- Flutter testing overview: https://docs.flutter.dev/testing/overview
- Effective Dart: https://dart.dev/effective-dart
