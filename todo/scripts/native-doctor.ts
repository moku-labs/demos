/**
 * @file `bun run native:doctor` — check the native toolchain. Exits 1 when a check fails.
 */
import { native } from "../src/native";

await native.start();
const healthy = await native.cli.doctor();
await native.stop();

process.exitCode = healthy ? 0 : 1;
