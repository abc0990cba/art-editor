export interface StageTheme {
  checkerA: string
  checkerB: string
  gridLine: string
  pixelLine: string
  /** Emphasized major lines ("graph paper"), stronger than pixelLine */
  gridMajor: string
  /** Dashed metaball threshold-contour line (diffusion guides overlay) */
  fieldContour: string
  guide: string
  hover: string
  /** Dark outline drawn under the hover stroke so it reads on any cell color */
  hoverHalo: string
  frame: string
}

export const STAGE_THEMES: Record<
  'dark' | 'paper' | 'oled' | 'nord' | 'tokyo-night' | 'vscode' | 'catppuccin',
  StageTheme
> = {
  dark: {
    fieldContour: 'rgba(251,146,60,0.60)',
    checkerA: '#26262b',
    checkerB: '#1e1e23',
    gridLine: 'rgba(255,255,255,0.07)',
    pixelLine: 'rgba(255,255,255,0.14)',
    gridMajor: 'rgba(255,255,255,0.24)',
    guide: 'rgba(129,140,248,0.55)',
    hover: 'rgba(255,255,255,0.95)',
    hoverHalo: 'rgba(0,0,0,0.65)',
    frame: 'rgba(255,255,255,0.15)',
  },
  oled: {
    fieldContour: 'rgba(251,146,60,0.55)',
    checkerA: '#0c0c0e',
    checkerB: '#050506',
    gridLine: 'rgba(255,255,255,0.05)',
    pixelLine: 'rgba(255,255,255,0.10)',
    gridMajor: 'rgba(255,255,255,0.18)',
    guide: 'rgba(129,140,248,0.55)',
    hover: 'rgba(255,255,255,0.95)',
    hoverHalo: 'rgba(0,0,0,0.65)',
    frame: 'rgba(255,255,255,0.12)',
  },
  nord: {
    fieldContour: 'rgba(235,203,139,0.60)',
    checkerA: '#3b4252',
    checkerB: '#333a47',
    gridLine: 'rgba(236,239,244,0.08)',
    pixelLine: 'rgba(236,239,244,0.16)',
    gridMajor: 'rgba(236,239,244,0.26)',
    guide: 'rgba(136,192,208,0.60)',
    hover: 'rgba(236,239,244,0.95)',
    hoverHalo: 'rgba(46,52,64,0.70)',
    frame: 'rgba(236,239,244,0.15)',
  },
  paper: {
    fieldContour: 'rgba(196,88,42,0.60)',
    // Paper Notebook Light (Flexoki-paper): warm paper, ink lines — soft on the eyes
    checkerA: '#f1ecdd',
    checkerB: '#e7e2d1',
    gridLine: 'rgba(60, 55, 40, 0.1)',
    pixelLine: 'rgba(60, 55, 40, 0.2)',
    gridMajor: 'rgba(60, 55, 40, 0.32)',
    guide: 'rgba(32, 93, 149, 0.55)',
    hover: 'rgba(255, 255, 255, 0.95)',
    hoverHalo: 'rgba(40, 36, 28, 0.7)',
    frame: 'rgba(60, 55, 40, 0.2)',
  },
  'tokyo-night': {
    fieldContour: 'rgba(222,105,51,0.55)',
    // Tokyo Night Light: cool misty blue-gray with the Tokyo Night blue as the guide
    checkerA: '#d9dbe3',
    checkerB: '#cfd2db',
    gridLine: 'rgba(55, 60, 85, 0.1)',
    pixelLine: 'rgba(55, 60, 85, 0.2)',
    gridMajor: 'rgba(55, 60, 85, 0.32)',
    guide: 'rgba(46, 125, 233, 0.55)',
    hover: 'rgba(255, 255, 255, 0.95)',
    hoverHalo: 'rgba(27, 27, 41, 0.7)',
    frame: 'rgba(55, 60, 85, 0.2)',
  },
  vscode: {
    fieldContour: 'rgba(206,145,120,0.70)',
    // VS Code Dark Modern
    checkerA: '#242424',
    checkerB: '#1c1c1c',
    gridLine: 'rgba(255,255,255,0.07)',
    pixelLine: 'rgba(255,255,255,0.14)',
    gridMajor: 'rgba(255,255,255,0.24)',
    guide: 'rgba(38,141,252,0.55)',
    hover: 'rgba(255,255,255,0.95)',
    hoverHalo: 'rgba(0,0,0,0.65)',
    frame: 'rgba(255,255,255,0.14)',
  },
  catppuccin: {
    fieldContour: 'rgba(250,179,135,0.65)',
    // Catppuccin Mocha
    checkerA: '#26263b',
    checkerB: '#202033',
    gridLine: 'rgba(205,214,244,0.07)',
    pixelLine: 'rgba(205,214,244,0.14)',
    gridMajor: 'rgba(205,214,244,0.22)',
    guide: 'rgba(180,190,254,0.55)',
    hover: 'rgba(205,214,244,0.95)',
    hoverHalo: 'rgba(17,17,27,0.70)',
    frame: 'rgba(205,214,244,0.14)',
  },
}
