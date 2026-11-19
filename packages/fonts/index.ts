// Larch fonts, self-hosted from npm (all SIL OFL 1.1). Every face ships as unicode-range slices, so a page downloads
// only the glyphs it sets: an English page fetches no Hangul files, and Gowun Batang's 95 Korean slices load only
// where Korean text is set in the serif (Korean pages). font-display: swap is set by each package.
// Import this module once, in the root layout, after @larch/design/tokens.css.
import '@fontsource/fira-sans/400.css'; // "Fira Sans": text
import '@fontsource/fira-sans/400-italic.css';
import '@fontsource/fira-sans/500.css'; // labels, buttons
import '@fontsource/fira-sans/600.css'; // figures, kickers, Signposts
import '@fontsource/fira-sans-condensed/500.css'; // "Fira Sans Condensed": map labels
import '@fontsource/fira-sans-condensed/600.css';
import '@fontsource/fira-mono/400.css'; // "Fira Mono": HS and ISO codes
import '@fontsource/fira-mono/500.css';
import '@fontsource-variable/literata/opsz.css'; // "Literata Variable": wght 200–900 and optical size 7–72
import '@fontsource-variable/literata/opsz-italic.css';
import '@fontsource/gowun-batang/400.css'; // "Gowun Batang": Korean reading and titles
import '@fontsource/gowun-batang/700.css';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'; // "Pretendard Variable": Hangul in the sans
import './fonts.css';
