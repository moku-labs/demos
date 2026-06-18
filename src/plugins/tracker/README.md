# tracker

**Standard** tier · `src/plugins/tracker/` · `createPlugin` from **`@moku-labs/worker`**

The board-domain orchestrator for Tracker. Owns persistence and side effects across the five
composed Cloudflare resource plugins: **D1** (source of truth), **KV** (board index), **Queues**
(async activity feed), **R2/storage** (attachments), and **Durable Objects** (live WebSocket
fan-out via the Board DO). Env-first API — every method takes the per-request `env` first.

> Skeleton placeholder. Config table, API reference, events table, and usage are completed during
> the Wave 1 build.

## Dependencies

`d1Plugin`, `kvPlugin`, `queuesPlugin`, `storagePlugin`, `durableObjectsPlugin` (framework instances).

## Config

| Key | Type | Default | Purpose |
|-----|------|---------|---------|
| `boardDo` | `string` | `"board"` | Logical Durable Object name for the board DO. |
| `activityQueue` | `string` | `"ACTIVITY_QUEUE"` | Queue binding for activity messages. |
| `boardIndexKey` | `string` | `"boards:index"` | KV key holding the board index. |
| `attachmentPrefix` | `string` | `"attachments/"` | R2 key prefix for attachment objects. |

## API

Env-first methods: `listBoards`, `createBoard`, `getBoard`, `createColumn`, `createCard`,
`moveCard`, `updateCard`, `deleteCard`, `addAttachment`, `getAttachmentBody`, `recordActivity`,
`listActivity`. See `types.ts` for signatures.

## Events

`tracker:cardCreated`, `tracker:cardMoved`, `tracker:cardUpdated`, `tracker:cardDeleted`,
`tracker:columnCreated`, `tracker:attachmentAdded`, `tracker:activityRecorded`.

## Usage

```ts
import { trackerPlugin } from "./plugins/tracker";

const app = createApp({ plugins: [/* resource plugins */, trackerPlugin] });
const boards = await app.tracker.listBoards(env);
```
