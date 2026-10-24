// Vector data for the Squint icon mark, lifted from Squint-original.svg.
// Coordinates are the original artboard's; MARK_VIEWBOX crops to the mark.

export const BODY_PATH =
  "M447.00,685.04 C439.57,682.37 423.56,676.40 411.40,671.77 L389.31,663.35 377.90,665.66 C347.86,671.75 322.20,673.40 257.00,673.46 C210.86,673.49 203.35,673.29 195.00,671.73 C166.07,666.33 143.23,654.47 123.44,634.57 C107.35,618.40 95.81,597.04 89.79,572.27 C87.75,563.91 87.64,560.65 87.27,502.57 C86.94,449.67 87.10,440.25 88.53,431.07 C98.06,369.83 143.66,327.43 206.86,321.05 C220.27,319.69 348.50,319.68 364.50,321.04 C418.39,325.60 462.20,358.02 478.44,405.37 C486.10,427.71 487.35,442.74 486.71,504.80 C486.26,548.21 486.03,553.39 484.13,562.44 C480.02,581.96 473.98,596.53 463.19,612.92 L457.64,621.35 469.94,645.74 C480.52,666.75 482.23,670.79 482.23,674.89 C482.23,681.19 479.84,685.53 475.02,687.99 C468.65,691.24 462.47,690.59 447.00,685.04 Z";

export const EYE_LEFT_PATH =
  "M198.70,569.40 C195.49,567.66 193.65,563.70 194.61,560.62 C194.97,559.45 197.41,556.02 200.02,553.00 C204.00,548.38 212.00,535.57 212.00,533.81 C212.00,533.52 206.26,533.05 199.25,532.76 C180.72,531.98 170.56,528.15 162.71,518.97 C158.13,513.63 156.13,509.36 154.77,502.05 C152.06,487.47 160.89,470.20 174.64,463.18 C184.10,458.36 188.40,457.83 215.27,458.17 L240.50,458.50 248.25,462.20 C275.75,475.33 280.52,506.87 259.50,536.50 C248.66,551.77 227.21,566.00 209.19,569.87 C202.59,571.28 202.13,571.26 198.70,569.40 Z";

export const EYE_RIGHT_PATH =
  "M347.08,568.41 C342.22,564.33 342.77,560.39 349.27,552.72 C354.66,546.35 359.21,539.24 360.44,535.25 C361.12,533.04 360.98,533.00 352.82,532.98 C323.98,532.91 307.31,522.27 304.06,501.88 C301.08,483.21 312.53,465.93 331.81,459.98 C337.42,458.25 341.08,458.00 361.36,458.02 C374.08,458.04 386.47,458.50 388.89,459.06 C400.95,461.84 412.36,470.79 417.50,481.50 C423.15,493.27 421.82,512.54 414.35,527.31 C409.19,537.50 398.20,549.69 387.67,556.90 C378.55,563.14 358.86,571.00 352.33,571.00 C351.13,571.00 348.77,569.83 347.08,568.41 Z";

/** Tight square crop around the mark (use for static exports, favicons, avatars). */
export const MARK_VIEWBOX = "77 295 420 420";

/** Mascot stage: the mark plus headroom for hops and mood props (thought bubbles, Zs, sparkles). */
export const STAGE_VIEWBOX = "50 245 474 474";

export const BRAND = {
  body: "#435DE6",
  eye: "#FFFFFF",
  ink: "#17213C",
  success: "#1FA971",
} as const;

/** Confetti colors for the Resolved celebration. */
export const CONFETTI_COLORS = ["#435DE6", "#2BC48A", "#FFC845", "#FF7AA8"] as const;

/** Where the mark touches the "ground"; squash and the drop shadow anchor here. */
export const GROUND_Y = 690;
export const CENTER_X = 287;

/**
 * The magnifier accessory, held over the right eye. The lens centers on that
 * eye and is wider than it, so the eye shows whole, `zoom` times larger,
 * with body color around it through the glass.
 */
export const LENS = {
  cx: 362,
  cy: 514,
  r: 82,
  ring: 12,
  zoom: 1.12,
  /** The glass tint and glint: white, over whatever the body color is. */
  glass: "#FFFFFF",
} as const;
/** Handle, from the rim down and out at 45 degrees. */
export const LENS_HANDLE_PATH = "M424 576L472 624";
/** The glint on the glass, a short arc at the top left. */
export const LENS_GLINT_PATH = "M303.7 492.8A62 62 0 0 1 340.8 455.7";
