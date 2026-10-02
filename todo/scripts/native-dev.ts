/**
 * @file `bun run native:dev` — run the app in the native shell against the web dev server.
 */
import { native } from "../src/native";

await native.start();
await native.cli.dev({ target: "macos" });
await native.stop();
