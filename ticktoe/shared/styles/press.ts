/**
 * @file The one tap grammar of the design, as plain data: how a pressed thing looks.
 */

/**
 * How far a pressed thing dips and how small it gets: 4 px at 390 wide, and 95%. Every button of
 * the game, a tile of the tray and an option of the level picker take it as their pressed style,
 * so a press looks the same wherever it lands.
 */
export const PRESSED = { offsetY: 11, scale: 0.95 } as const;
