'use client';
// React wrappers of the chart kit: each draws its D3 module into a ChartFrame (title, plot, source line, "Show as
// table" and CSV). Data in, no fetching: pass arrays from the data files (series, nodes, flows, chains, checks).
import { useEffect, useRef, type ReactNode } from 'react';
import { checkPairTable, drawCheckPair, type CheckPairHandle, type CheckPairOptions } from '../charts/checkpair';
import { drawShares, sharesTable, type SharesHandle, type SharesOptions } from '../charts/shares';
import { drawSlope, slopeTable, type SlopeHandle, type SlopeOptions } from '../charts/slope';
import { drawStrip, stripTable, type StripHandle, type StripOptions } from '../charts/strip';
import { ChartFrame } from './ChartFrame';

interface FrameProps {
  /** A heading over the chart (the chart's own label is its aria-label). */
  title?: ReactNode;
  /** The source line under the chart, with period, flow rule, HS version and lens. */
  source?: ReactNode;
  /** CSV file name (default: the chart kind). */
  csvName?: string;
  /** Hide the "Show as table" and CSV buttons (the table is still built for screen readers via the aria-label). */
  noTable?: boolean;
  className?: string;
  children?: ReactNode;
}

function useChart<O, H extends { update(o: O): void; destroy(): void }>(draw: (el: HTMLElement, o: O) => H, o: O) {
  const ref = useRef<HTMLDivElement>(null);
  const handle = useRef<H | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    handle.current = draw(ref.current, o);
    return () => { handle.current?.destroy(); handle.current = null; };
    // the chart is created once; later props go through update()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { handle.current?.update(o); });
  return ref;
}

export type StripChartProps = StripOptions & FrameProps;

/** Chart kit 1 · Strip: one metric over all periods (bars under a map, lines in cards). */
export function StripChart(props: StripChartProps) {
  const { title, source, csvName, noTable, className, children, ...o } = props;
  const ref = useChart<StripOptions, StripHandle>(drawStrip, o);
  return (
    <ChartFrame lang={o.lang} title={title} source={source} csvName={csvName ?? 'strip'} plotRef={ref} className={className}
      table={noTable ? undefined : stripTable(o)} height={o.height ?? (o.mark === 'bar' ? 52 : 140)}>{children}</ChartFrame>
  );
}

export type SharesChartProps = SharesOptions & FrameProps;

/** Chart kit 2 · Shares: top-five partner shares in fixed slots viz-1 … viz-5, Other in viz-context. */
export function SharesChart(props: SharesChartProps) {
  const { title, source, csvName, noTable, className, children, ...o } = props;
  const ref = useChart<SharesOptions, SharesHandle>(drawShares, o);
  return (
    <ChartFrame lang={o.lang} title={title} source={source} csvName={csvName ?? 'shares'} plotRef={ref} className={className}
      table={noTable ? undefined : sharesTable(o)} height={o.height ?? 180}>{children}</ChartFrame>
  );
}

export type SlopeChartProps = SlopeOptions & FrameProps;

/** Chart kit 3 · Slope: rank or share at the base and now, ten economies at most, movers in viz-focus. */
export function SlopeChart(props: SlopeChartProps) {
  const { title, source, csvName, noTable, className, children, ...o } = props;
  const ref = useChart<SlopeOptions, SlopeHandle>(drawSlope, o);
  return (
    <ChartFrame lang={o.lang} title={title} source={source} csvName={csvName ?? 'slope'} plotRef={ref} className={className}
      table={noTable ? undefined : slopeTable(o)} height={o.height}>{children}</ChartFrame>
  );
}

export type CheckPairChartProps = CheckPairOptions & FrameProps;

/** Chart kit 6 · Check pair: two indexed lines (= 100 at the base) on one axis, with the status word and icon. */
export function CheckPairChart(props: CheckPairChartProps) {
  const { title, source, csvName, noTable, className, children, ...o } = props;
  const ref = useChart<CheckPairOptions, CheckPairHandle>(drawCheckPair, o);
  return (
    <ChartFrame lang={o.lang} title={title} status={o.status} source={source} csvName={csvName ?? 'check'} plotRef={ref}
      className={className} table={noTable ? undefined : checkPairTable(o)} height={o.height ?? 150}>{children}</ChartFrame>
  );
}
