/**
 * @file `bun run native:build:ios-sim` — build the iOS simulator slice (unsigned, no device archive).
 */
import { native } from "../src/native";

await native.start();
await native.cli.build({ target: "ios", simulator: true });
await native.stop();
