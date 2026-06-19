import { describe, expect, it } from "vitest";
import {
  rowToActivity,
  rowToAttachment,
  rowToBoard,
  rowToBoardSummary,
  rowToCard,
  rowToColumn
} from "../../helpers";
import type { ActivityRow } from "../../types";

describe("tracker helpers", () => {
  describe("rowToBoard", () => {
    it("maps snake_case row to Board domain object", () => {
      const row = { id: "b1", title: "My Board", created_at: 1_700_000_000 };
      const board = rowToBoard(row);
      expect(board).toEqual({ id: "b1", title: "My Board", createdAt: 1_700_000_000 });
    });

    it("handles zero created_at", () => {
      const row = { id: "b2", title: "Empty", created_at: 0 };
      expect(rowToBoard(row).createdAt).toBe(0);
    });
  });

  describe("rowToColumn", () => {
    it("maps snake_case row to Column domain object", () => {
      const row = { id: "c1", board_id: "b1", title: "To Do", position: 0 };
      const col = rowToColumn(row);
      expect(col).toEqual({ id: "c1", boardId: "b1", title: "To Do", position: 0 });
    });

    it("preserves integer position", () => {
      const row = { id: "c2", board_id: "b1", title: "Done", position: 2 };
      expect(rowToColumn(row).position).toBe(2);
    });
  });

  describe("rowToCard", () => {
    it("maps snake_case row to Card domain object", () => {
      const row = {
        id: "card1",
        board_id: "b1",
        column_id: "c1",
        title: "Task",
        description: "Details",
        position: 1,
        created_at: 1_700_000_001
      };
      const card = rowToCard(row);
      expect(card).toEqual({
        id: "card1",
        boardId: "b1",
        columnId: "c1",
        title: "Task",
        description: "Details",
        position: 1,
        createdAt: 1_700_000_001
      });
    });

    it("defaults empty description", () => {
      const row = {
        id: "card2",
        board_id: "b1",
        column_id: "c1",
        title: "No desc",
        description: "",
        position: 0,
        created_at: 1000
      };
      expect(rowToCard(row).description).toBe("");
    });
  });

  describe("rowToActivity", () => {
    it("maps snake_case row to Activity domain object", () => {
      const row: ActivityRow = {
        id: "act1",
        board_id: "b1",
        kind: "card.created",
        summary: "Created Task",
        at: 1_700_000_002
      };
      const activity = rowToActivity(row);
      expect(activity).toEqual({
        id: "act1",
        boardId: "b1",
        kind: "card.created",
        summary: "Created Task",
        at: 1_700_000_002
      });
    });

    it("preserves kind exactly", () => {
      const row: ActivityRow = {
        id: "act2",
        board_id: "b1",
        kind: "card.moved",
        summary: "Moved card",
        at: 100
      };
      expect(rowToActivity(row).kind).toBe("card.moved");
    });
  });

  describe("rowToAttachment", () => {
    it("maps snake_case row to Attachment domain object", () => {
      const row = {
        id: "att1",
        card_id: "card1",
        key: "attachments/uuid-1",
        filename: "photo.png",
        content_type: "image/png",
        size: 1024
      };
      const att = rowToAttachment(row);
      expect(att).toEqual({
        id: "att1",
        cardId: "card1",
        key: "attachments/uuid-1",
        filename: "photo.png",
        contentType: "image/png",
        size: 1024
      });
    });

    it("maps content_type to contentType", () => {
      const row = {
        id: "att2",
        card_id: "card1",
        key: "attachments/uuid-2",
        filename: "doc.pdf",
        content_type: "application/pdf",
        size: 512
      };
      expect(rowToAttachment(row).contentType).toBe("application/pdf");
    });
  });

  describe("rowToBoardSummary", () => {
    it("maps the card_count and updated_at aggregate aliases to camelCase", () => {
      const row = { id: "b1", title: "Board", card_count: 3, updated_at: 1_700_000_003 };
      expect(rowToBoardSummary(row)).toEqual({
        id: "b1",
        title: "Board",
        cardCount: 3,
        updatedAt: 1_700_000_003
      });
    });

    it("preserves a zero card_count", () => {
      const row = { id: "b2", title: "Empty", card_count: 0, updated_at: 50 };
      expect(rowToBoardSummary(row).cardCount).toBe(0);
    });
  });
});
