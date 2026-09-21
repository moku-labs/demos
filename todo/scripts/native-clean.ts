/**
 * @file `bun run native:clean` — delete the generated Tauri project (`.moku/`). Fully regenerable.
 */
import { native } from "../src/native";

await native.start();
await native.cli.clean();
await native.stop();
