/**
 * @file `bun run native:build:macos` — package the macOS app. Installers land in `dist-native/macos/`.
 */
import { native } from "../src/native";

await native.start();
await native.cli.build({ target: "macos" });
await native.stop();
