/**
 * Standalone copy of the data this simulation needs from
 * `assets/7.Scripts/Gameplay/Data.ts` and `assets/7.Scripts/Gameplay/BoxCreator.ts`.
 *
 * Kept separate from the game code on purpose: editor panels run in a Node/Chromium
 * context and cannot `import ... from 'cc'`, so the constants are duplicated here.
 */

export interface LevelDataLike {
    // [x, y, scaleX, scaleY] per box type. Only scaleX/scaleY (index 2, 3) are used for sizing.
    sizes: number[][];
    // amount of boxes to spawn per type, mirrors LevelData.sumBus
    sumBus: number[];
    // [humanColorId, amountForType0, amountForType1, amountForType2, ...], mirrors LevelData.sumHuman
    sumHuman: number[][];
}

// BoxCreator.Colors - base tint per box "type", before noise is applied.
export const TypeColors = [
    '#ffffff',
    '#ffffff',
    '#ffffff',
];

// Data.ts ColorType - readable names for the "human" (bus) color ids used by sumHuman.
export const ColorTypeNames = [
    "White",
    "Gray",
    "Black",
    "LightYellow",
    "Orange",
    "LightBrown",
    "Brown",
    "Red",
    "DarkRed",
    "LightPink",
    "Pink",
    "LightBlue",
    "Blue",
    "LightPurple",
    "Purple",
    "Lemon",
    "Green",
    "DarkGreen",
    "Skin",
    "Cyan",
    "LightCyan",
    "Yellow",
];

// Data.ts Colors - full palette indexed by ColorType, used to tag which "human" group a box belongs to.
export const HumanColors = [
  "#ffffff",
  "#898989",
  "#1b1b1b",
  "#fef1af",
  "#e97c20",
  "#7a4427",
  "#51220a",
  "#fa1313",
  "#64192a",
  "#fdc5cf",
  "#f43c88",
  "#1e76d9",
  "#191570",
  "#ca71fa",
  "#7100bd",
  "#b1ff3e",
  "#25c242",
  "#0d5b48",
  "#fdd8b2",
  "#81d7fd",
  "#71fefe",
  "#fdeb3b",
];

// Data.ts LevelData - default values used until the user pastes custom data in the panel.
export const DefaultLevelData: LevelDataLike = {
    sizes: [
        [0, 0, 0.4, 1],
        [0, 0, 0.4, 0.8],
        [0, 0, 0.35, 0.75],
    ],
    sumHuman: [
        [1, 21, 0, 1],
        [3, 10, 0, 0],
        [5, 5, 0, 0],
        [6, 17, 0, 0],
        [7, 1, 1, 0],
        [8, 11, 0, 0],
        [9, 2, 0, 0],
        [10, 1, 1, 0],
        [13, 20, 0, 1],
    ],
    sumBus: [88, 2, 2],
};
