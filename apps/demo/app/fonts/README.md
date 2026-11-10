# Fonts

`Figtree-Variable.woff2` is [Figtree](https://github.com/erikdkennedy/figtree) under the SIL Open
Font License (`Figtree-OFL.txt`). It's served from here, through `next/font/local` in
`app/layout.tsx`, so builds don't download it from Google Fonts.

It was made from Google Fonts' `ofl/figtree/Figtree[wght].ttf` with
[fontTools](https://github.com/fonttools/fonttools): the weight axis cut to 400–700, then
subset to Google's Latin and Latin Extended ranges.

```sh
fonttools varLib.instancer 'Figtree[wght].ttf' wght=400:700 -o Figtree-400-700.ttf
pyftsubset Figtree-400-700.ttf --layout-features='*' --flavor=woff2 \
  --output-file=Figtree-Variable.woff2 \
  --unicodes='U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD,U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF'
```
