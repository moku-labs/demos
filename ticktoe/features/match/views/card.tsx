/**
 * @file The result card: who won, Play again and Home.
 */
import { projection, tr } from "@core/kit";
import type { Player, Session } from "@core/state";
import type { TextTone } from "@shared";
import { Card, MouldedText, ToyButton } from "@shared";
import { buttonMotions, cardMotion, topPieceMotion } from "../motion/card-motion";
import {
  cardButtonsStyle,
  cardGroupStyle,
  cardPieceStyle,
  cardStyle,
  cardTopStyle,
  screenStyle,
  stageStyle
} from "../styles/looks";
import type { CardItem } from "./board-items";
import { cardOf } from "./board-items";

/**
 * The title of the card for each result.
 */
const TITLES = { win: "result.win", loss: "result.loss", draw: "result.draw" } as const;

/**
 * The tone of the title for each result: coral is the human, blue is the bot, yellow is a draw.
 */
const TONES = { win: "coral", loss: "blue", draw: "yellow" } as const satisfies Record<
  CardItem["result"],
  TextTone
>;

/**
 * The projection `match.card`: the result card with the winner's piece on top of it, both pieces
 * after a draw. Drawn while the card is up.
 */
export const matchCard = projection({
  name: "match.card",
  layer: "ui",
  from: (_player: Player, session: Session) => cardOf(session),
  key: () => "board",
  view: card => (
    <screen key="matchCard" style={screenStyle}>
      <stack key="cardStage" style={stageStyle}>
        <stack key="cardGroup" style={cardGroupStyle} motion={cardMotion}>
          <Card id="resultCard" style={cardStyle}>
            <MouldedText
              id="resultTitle"
              content={tr(TITLES[card.result])}
              style="ui.result"
              tone={TONES[card.result]}
            />
            <row key="cardButtons" style={cardButtonsStyle}>
              <row key="cardAgainSlot" motion={buttonMotions[0]}>
                <ToyButton id="cardAgain" intent="again" tone="teal" label={tr("card.again")} />
              </row>
              <row key="cardHomeSlot" motion={buttonMotions[1]}>
                <ToyButton id="cardHome" intent="home" tone="peach" label={tr("card.home")} />
              </row>
            </row>
          </Card>
          <row key="cardTop" style={cardTopStyle} motion={topPieceMotion}>
            {card.result === "loss" ? undefined : (
              <image key="cardTopX" texture="match.piece-x" fit="fill" style={cardPieceStyle} />
            )}
            {card.result === "win" ? undefined : (
              <image key="cardTopO" texture="match.piece-o" fit="fill" style={cardPieceStyle} />
            )}
          </row>
        </stack>
      </stack>
    </screen>
  )
});
