// Larch components for React: the markup of design/larch.css (.lr-* classes) as typed components. Server-safe
// components unless the file says 'use client' (LanguageSwitch, ThemeToggle, SegmentedControl, DataTable).
// Components that write words of their own take `lang`. Colours are token names ("viz-1"), never values.
export * from './format';
export * from './strings';
export * from './util';
export * from './marker';
export * from './shell';
export * from './controls';
export * from './editorial';
export * from './data';
export * from './chains';
export * from './Family';
export { LanguageSwitch, swapLanguage } from './LanguageSwitch';
export { ThemeToggle } from './ThemeToggle';
export { SegmentedControl, type Segment } from './SegmentedControl';
export { DataTable, type DataColumn, type DataRow } from './DataTable';
