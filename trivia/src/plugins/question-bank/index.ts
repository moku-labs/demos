/**
 * @file question-bank — Standard room game plugin skeleton.
 * @see README.md
 */
import { createPlugin, intentPlugin, stagePlugin, syncPlugin } from "@moku-labs/room";
import { createQuestionBankApi } from "./api";
import { initQuestionBank } from "./lifecycle";
import { createQuestionBankState } from "./state";

export const questionBankPlugin = createPlugin("questionBank", {
  depends: [stagePlugin, syncPlugin, intentPlugin],
  createState: createQuestionBankState,
  onInit: initQuestionBank,
  api: createQuestionBankApi
});
