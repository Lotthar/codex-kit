# Flutter profile

Apply this profile after the generic profile. Preserve the app architecture, state, navigation, platforms, and Dart constraints.

## Scope and discovery

- Read `pubspec.yaml`, analyzer config, lockfile, platform config, CI, feature layout, navigation, localization, themes, generators, and affected widget/state/data/tests.
- Respect package and federated-plugin public boundaries. Never edit `.dart_tool/`, `build/`, registrants, or generated Dart files.

## Architecture and lifecycle

- Follow the established architecture: widgets render/orchestrate; existing view-model/controller/bloc/notifier owns state transitions; repositories own data truth; services contain external/platform I/O.
- Preserve selected unidirectional state management. Keep transient visual state local, do not add a use-case layer or second state system for one feature, and model loading/empty/error/refresh/retry.
- Keep `build` side-effect-free. Own/dispose controllers, focus nodes, animations, and subscriptions; check lifecycle/context after async gaps. Use keys only for identity.

## Navigation, platform, and security

- Preserve router/Navigator names, parameters, restoration, redirects, deep-link validation, and Flutter-web history. Backend authorization is authoritative.
- Keep plugin/platform channels behind adapters; do not add permissions without runtime, privacy, store, and platform impact. Treat manifests, entitlements, signing, and deployment as high-risk.
- Use themes, flexible constraints, text scaling, localization, safe areas, semantic labels, focus, tap targets, and visible loading/offline/permission states. Do not hide overflow instead of restoring access.
- Keep secrets out of assets/config, validate decoded JSON/persisted state, treat storage as untrusted, and do not log sensitive data.

## Commands and testing

- Use the repository Flutter manager/scripts first, then `dart format --output=none --set-exit-if-changed <paths>`, `flutter analyze`, focused `flutter test`, integration tests, and supported builds. Run generators only when their sources changed.
- Unit-test services, repositories, and state; widget-test rendering, interaction, semantics, and layout; integration-test critical/platform journeys. Pump for conditions, mock external I/O, and review golden changes.

## Skill routing and completion

- Use `flutter-general` for Flutter work and `ui-feature-implementation` for complex user-visible/accessibility flows. Keep `pubspec`, router, shared state models, generator inputs, and platform manifests under one owner.
- Done: architecture/state, lifecycle, async, accessibility, and responsive behavior remain valid; relevant formatter/analyzer/tests/build checks pass; generated output, secrets, dependency churn, and platform regressions are absent.

## Reference anchors

- Flutter architecture: https://docs.flutter.dev/app-architecture/recommendations
- Flutter testing: https://docs.flutter.dev/testing/overview
- Effective Dart: https://dart.dev/effective-dart
