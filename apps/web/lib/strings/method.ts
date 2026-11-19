import type { StringTable } from './types';

// The method page (/[lang]/method) and the checks page (/[lang]/method/checks). Use as t(lang, 'method.<key>', vars).
// Prose strings may carry a small inline markup, rendered by components/method/Rich.tsx: **bold**, `code` (a code
// chip: HS codes, address keys) and [text](href); {lang} in an href is filled by the caller.
// Korean prose in 해라체; table labels and UI words as written in the Larch glossary.
export const method = {
  // Check statuses: always a word with an icon, never colour alone.
  'status.pass': { en: 'Pass', ko: '통과' },
  'status.watch': { en: 'Watch', ko: '주의' },
  'status.fail': { en: 'Fail', ko: '실패' },
  'status.info': { en: 'Info', ko: '참고' },
  'status.not run': { en: 'Not run', ko: '미실행' },

  // ---------------------------------------------------------------------------------------------------------------
  // Method page
  kicker: { en: 'Method', ko: '방법론' },
  title: {
    en: 'Every flow is the importer’s report where the importer filed, else the exporter’s',
    ko: '교역 흐름은 수입국 신고를 우선하고, 없으면 수출국 신고를 쓴다',
  },
  dek: {
    en: 'How the numbers on this site are made: the data, the flow rules, coverage, HS versions, how months are read, the chains, the checks, the licence and how to cite.',
    ko: '이 사이트의 수치를 만드는 방법입니다. 자료와 교역 흐름 규칙, 수록 범위, HS 버전, 월별 자료 읽는 법을 다룹니다. 공급망 사슬, 검증, 이용 조건, 인용 방법도 다룹니다.',
  },
  contents: { en: 'On this page', ko: '이 페이지의 내용' },

  // 1. The data
  // the standing rule of the flow sites
  'std.h': { en: 'The standard: consistent with itself', ko: '기준: 내부 일관성' },
  'std.p1': {
    en: 'This site’s numbers may differ from national statistics because of how they are aggregated; that is accepted. What is not accepted is a quantity computed by two rules, two quantities joined across different periods or scopes, one name used for two different things, or a rule the reader cannot see. trade-flow, money-flow, global-network, the datasteg API and the articles desk follow five rules:',
    ko: '이 사이트의 수치는 집계 방식 때문에 국가 통계와 다를 수 있으며, 이는 허용합니다. 허용하지 않는 것은 네 가지입니다. 한 수량을 두 규칙으로 산출하는 것, 기간이나 범위가 다른 두 수량을 잇는 것, 한 이름을 서로 다른 두 대상에 쓰는 것, 독자가 볼 수 없는 규칙을 쓰는 것입니다. trade-flow, money-flow, global-network, datasteg API, 기사 데스크는 다음 다섯 가지 규칙을 따릅니다.',
  },
  'std.c1': { en: '**C1 One quantity, one definition.** A named quantity is computed by one rule wherever it appears: every page, the API, the desk, both languages (here: the annual mirror rule for years, the one monthly rule for months).', ko: '**C1 한 수량, 한 정의.** 이름이 붙은 수량은 어디에 나오든 한 가지 규칙으로 산출합니다. 모든 페이지와 API, 데스크, 두 언어에 똑같이 적용합니다(이 사이트에서는 연도에 연간 거울 규칙, 월에 하나의 월별 규칙을 씁니다).' },
  'std.c2': { en: '**C2 One period rule for joins.** A stock is taken at a quarter end; a flow is the 12-month window ending in that quarter’s last month (up to six months earlier, marked partial).', ko: '**C2 결합에는 한 가지 기간 규칙.** 저량은 분기 말 값을 씁니다. 유량은 그 분기 마지막 달에 끝나는 12개월 창으로 잡습니다(최대 여섯 달 앞선 창까지 쓰며, 이때는 부분 자료로 표시합니다).' },
  'std.c3': { en: '**C3 Like with like.** Two series are added, compared or put in a ratio only when their scope is the same, or when the difference is the point of the measure and is stated.', ko: '**C3 같은 것끼리.** 두 시계열은 범위가 같을 때만 더하거나 비교하거나 비율로 나타냅니다. 범위 차이 자체가 지표의 요점이고 그 차이를 밝힌 경우는 예외입니다.' },
  'std.c4': { en: '**C4 Every number carries its rule.** Its period, window and basis are next to it, in a caption, a note or a field.', ko: '**C4 모든 수치에 규칙을 붙입니다.** 수치의 기간, 창, 기준을 캡션이나 주석, 필드로 바로 옆에 표시합니다.' },
  'std.c5': { en: '**C5 Checks, not hopes.** Each rule has a check that runs in the build and fails it (here: K1 growth bases, K4 no retired monthly files, K5 no reported zeros).', ko: '**C5 기대가 아니라 검사.** 규칙마다 검사가 있습니다. 검사는 빌드 중에 실행되며, 규칙을 어기면 빌드가 실패합니다(여기서는 K1 증가율 기준값, K4 폐기된 월간 파일 사용 금지, K5 보고된 0 값 금지).' },
  'data.h': { en: 'The data', ko: '자료' },
  'data.p1': {
    en: 'Every number on this site comes from **UN Comtrade**, the United Nations’ database of customs records, in its **Final** data set, standardised by the UN Statistics Division. Goods are classified in the Harmonized System (**HS**) and, before HS, in the Standard International Trade Classification (**SITC**). The annual data run from {a0} to {a1}, the monthly data from {m0} to {m1}.',
    ko: '이 사이트의 모든 수치는 유엔의 통관자료 데이터베이스인 **UN Comtrade**의 **확정치**(Final)에서 나옵니다. 확정치는 유엔 통계처가 표준화한 자료입니다. 상품은 HS(통일상품분류체계)로, HS 이전에는 SITC(표준국제무역분류)로 분류합니다. 연간 자료는 {a0}–{a1}년, 월별 자료는 {m0}–{m1} 기간을 포괄합니다.',
  },
  'data.p2': {
    en: 'A record says that one economy, the **reporter**, exported a product (a code) to one **partner**, or imported it from one, in a period (a year or a month), with a value in US dollars and often a net weight in kilograms. Exports are valued **FOB**, at the exporter’s border; imports **CIF**, with cost, insurance and freight to the importer’s border, so the same shipment is worth a few per cent more in the importer’s books. Imports are booked by country of origin, exports by country of last known destination.',
    ko: '자료 한 건은 한 경제권(**신고국**)이 한 **상대국**과 거래한 상품(코드)의 수출 또는 수입입니다. 기간은 연 또는 월입니다. 금액은 미국 달러이고, 흔히 킬로그램 단위 순중량도 함께 기록합니다. 수출은 수출국 국경 기준인 **FOB**로 평가합니다. 수입은 수입국 국경까지의 운임과 보험료를 더한 **CIF**로 평가합니다. 그래서 같은 화물도 수입국 장부에서 몇 퍼센트 더 큽니다. 수입은 원산지 기준, 수출은 최종 목적지로 알려진 나라 기준으로 기록합니다.',
  },
  'data.p3': {
    en: 'The records are folded into a **network layer** on the machine that holds the Comtrade store. Reporters and partners become economies by ISO3 code ({nodes} in all, historical areas such as the USSR and East Germany among them); groups, “areas n.e.s.”, bunkers and free zones drop out of the flows. The annual layer was built on {builtA}, the monthly layer on {builtM}, and the files this site reads on {built}.',
    ko: '자료는 Comtrade 저장소가 있는 컴퓨터에서 **네트워크 레이어**로 정리합니다. 신고국과 상대국은 ISO3 코드로 경제권을 나타냅니다(모두 {nodes}개국, 소련과 동독 같은 옛 경제권 포함). 국가군, ‘달리 분류되지 않은 지역’, 선박 연료, 자유무역지대는 교역 흐름에서 제외합니다. 연간 레이어는 {builtA}, 월별 레이어는 {builtM}에 구축했습니다. 이 사이트가 읽는 파일은 {built}에 만들었습니다.',
  },
  'data.p5': {
    en: 'One economy is read from a second source where UN Comtrade lacks its months. Korea files its monthly records with UN Comtrade once a year, four to five months after the year ends, and Comtrade’s monthly files hold Korea only from January 2013. For {name}, {when}, the site reads the **{src}** ([source]({url}), fetched {fetched}). The records are summed to the same codes, in the HS edition Korea used at the time, and folded into the same partners as Korea’s Comtrade file; on the months both hold, partner totals agree to within 0.1%. The customs service’s item statistics leave out a few cells that Korea’s Comtrade file carries, about 0.04% of trade, among them Korea’s imports of lithium carbonate from Argentina. {prelim} The customs service revises its latest months, so they are fetched again every month after its mid-month release; each fetch is dated, revisions between fetches are logged, and when Comtrade’s file for a year arrives it replaces those months and the gap between the two is published with the checks. The customs records leave out Korea’s phosphate rock (2510.10) entirely, and a few other cells, about 0.04% of trade, among them its imports of lithium carbonate from Argentina; the stages concerned say so. Every chart and table that uses these months names the source.',
    ko: '한 경제권은 UN Comtrade에 없는 달을 다른 자료로 보완합니다. 한국은 월별 통관자료를 1년에 한 번 UN Comtrade에 제출합니다. 제출 시점은 해가 끝나고 4~5개월 뒤입니다. Comtrade 월별 파일에는 한국 자료가 2013년 1월부터만 있습니다. {name}의 {when} 자료는 **{src}**에서 읽습니다([출처]({url}), {fetched} 수집). 코드는 그때 한국이 쓴 HS 판으로 같은 단위에 맞춥니다. 상대국 묶음은 한국의 Comtrade 파일과 같게 했습니다. 두 자료가 모두 있는 달에는 상대국별 합계가 0.1% 안에서 같습니다. 관세청 품목별 통계에는 한국의 Comtrade 파일에 있는 일부 칸이 빠져 있습니다. 빠져 있는 칸은 교역의 약 0.04%이며, 아르헨티나산 탄산리튬 수입이 여기에 듭니다. {prelim} 관세청은 최근 달을 수정해 발표합니다. 그래서 매달 중순 발표 뒤 다시 수집하고, 수집일과 수정된 값을 기록합니다. 한 해의 Comtrade 파일이 도착하면 그 달들은 Comtrade 자료로 대체합니다. 두 자료의 차이는 검증 결과와 함께 공개합니다. 관세청 통관자료에는 한국의 인광석(2510.10)이 통째로 빠져 있습니다. 그 밖에 교역의 약 0.04%에 해당하는 몇 칸도 빠져 있습니다. 아르헨티나산 탄산리튬 수입이 그 예입니다. 해당 단계에는 이를 적어 둡니다. 이 자료를 쓴 그래프와 표에는 모두 출처를 적습니다.',
  },
  'data.p5prelim': { en: 'The last months, {months}, are preliminary: they are drawn dashed and cited as such.', ko: '마지막 {months}은 잠정치입니다. 점선으로 그리고 출처에도 잠정치라고 적습니다.' },
  'data.p4': {
    en: 'The site carries {products} products: all goods, the {chapters} HS chapters, {baskets} baskets of codes that events turn on (chips, crude oil, vaccines and others) and the {stages} stages of the ten chains. Products start in 1995, when HS was in full use; all goods go back to 1962 through SITC. Monthly data start in 2006 for all goods and in 2014 for baskets and chain stages.',
    ko: '사이트에는 품목 {products}개가 있습니다. 전체 상품, HS {chapters}개 류, 경제 사건이 걸린 코드 묶음 {baskets}개(반도체, 원유, 백신 등), 열 개 공급망 사슬의 단계 {stages}개입니다. 품목 자료는 HS가 널리 쓰인 1995년부터, 전체 상품은 SITC를 통해 1962년부터입니다. 월별 자료는 전체 상품이 2006년부터, 코드 묶음과 사슬 단계가 2014년부터입니다.',
  },

  // 2. Mirror rule
  'mirror.h': { en: 'The mirror rule and the flow rules', ko: '상대국 통계 규칙과 교역 흐름 규칙' },
  'mirror.p1': {
    en: 'Every flow between two reporters is in the data twice: in the exporter’s file and in the importer’s. They rarely agree. A CIF margin of a few per cent is expected (the IMF’s Direction of Trade Statistics uses a factor of 1.06); larger gaps come from re-exports and transit, with goods booked by origin on one side and by consignment on the other (Hong Kong, Singapore, the Netherlands, Belgium), from timing, confidential lines and misclassification. In 2017 at HS6 only 46% of records found their mirror; 32% were imports with no matching export and 22% exports with no matching import (Mitikj and Kaushik 2024).',
    ko: '신고국 둘 사이의 교역 흐름은 자료에 두 번 나옵니다. 수출국 파일에 한 번, 수입국 파일에 한 번입니다. 두 값이 일치하는 경우는 드뭅니다. 몇 퍼센트의 CIF 차이는 예상된 차이입니다(IMF 무역방향통계는 1.06배를 씁니다). 더 큰 차이는 재수출과 경유에서 생깁니다. 한쪽은 원산지 기준, 다른 쪽은 선적지 기준으로 기록하기 때문입니다(홍콩, 싱가포르, 네덜란드, 벨기에). 시차, 비공개 품목, 분류 차이도 원인입니다. 2017년 HS 6단위에서 짝을 찾은 자료는 46%에 그쳤습니다. 32%는 짝이 되는 수출이 없는 수입이었습니다. 22%는 짝이 되는 수입이 없는 수출이었습니다(Mitikj and Kaushik 2024).',
  },
  'mirror.p2': {
    en: '**Mirror rule.** Annual views take the importer’s report where the importer reported that year (in HS, for products) and otherwise the exporter’s report times 1.06, the CIF/FOB factor of the IMF’s Direction of Trade Statistics, so that every flow is valued as an importer records it (CIF), after Feenstra et al. (2005): importers report more completely and value goods at the border they cross. The monthly windows use the same factor wherever an exporter’s report stands in for the importer’s. In {year}, {imp} of world trade in all goods came from importers’ own reports.',
    ko: '**거울 규칙.** 연간 화면은 수입국이 그해 보고했으면 수입국 보고를 씁니다(품목은 HS 기준으로 보고한 경우). 보고하지 않았으면 수출국 보고에 1.06을 곱합니다. 1.06은 IMF 무역방향통계(Direction of Trade Statistics)의 CIF/FOB 환산계수입니다. 이렇게 하면 모든 교역 흐름이 수입국이 기록하는 방식(CIF)으로 평가됩니다. 이 방식은 Feenstra et al.(2005)을 따른 것입니다. 수입국이 더 빠짐없이 보고하고, 상품이 통과하는 국경에서 가치를 평가하기 때문입니다. 월간 창도 수출국 보고가 수입국 보고를 대신하는 곳에서는 같은 계수를 씁니다. {year}년 전체 상품 세계 교역 가운데 {imp|이} 수입국 자체 보고에서 나왔습니다.',
  },
  'mirror.p3': {
    en: '**Importer-reported and exporter-reported.** The explorer can draw either side alone (`m=importer`, `m=exporter`). A flow card shows both reports and their ratio, the **mirror ratio** (importer’s report ÷ exporter’s); a ratio outside 0.8–1.25 gets a note.',
    ko: '**수입국 신고와 수출국 신고.** 탐색 화면은 한쪽 신고만으로도 그릴 수 있습니다(`m=importer`, `m=exporter`). 교역 흐름 카드에는 두 신고와 그 비율인 **미러 비율**(수입국 신고 ÷ 수출국 신고)을 표시합니다. 비율이 0.8–1.25를 벗어나면 주석을 붙입니다.',
  },
  'mirror.p4': {
    en: '**One monthly rule.** Every monthly number on the site, in the monthly explorer, the chain pages’ monthly strips, the event maps and strips, the event and case measures and the API, is a window of the monthly explorer (see Monthly explore below): each flow is the importer’s report for every month it filed; a month it did not file is the exporter’s report spliced to the importer’s level, benchmarked to the importer’s annual file, or times 1.06; and a flow counts in a window only when it is positive in every month. Monthly mirror data are noisy (US-reported imports of Chinese chips were 0.75 of China’s reported exports over 2023–24 on average, but the monthly ratio swung from 0.33 to 1.04), so the two reports are never added month by month. The annual views keep the annual mirror rule above; the two rules are the only ones, and each chart’s source line names its rule.',
    ko: '**단일 월간 규칙.** 사이트의 모든 월간 수치는 월간 탐색기의 창입니다(아래 \'월간 탐색\' 참조). 월간 탐색기, 사슬 페이지의 월간 띠, 사건 지도와 띠, 사건·사례 지표, API가 모두 그렇습니다. 각 흐름은 수입국이 보고한 달에는 수입국 보고를 씁니다. 보고하지 않은 달에는 수출국 보고를 수입국 수준에 접합하거나, 수입국 연간 자료에 맞춰 조정하거나, 1.06을 곱해 씁니다. 한 흐름은 창의 모든 달에서 양수일 때만 그 창에 포함됩니다. 월간 거울 자료는 잡음이 큽니다. 미국이 보고한 중국산 칩 수입은 2023–24년 평균으로 중국이 보고한 수출의 0.75였지만, 월간 비율은 0.33에서 1.04까지 오르내렸습니다. 그래서 두 보고를 달마다 더하지 않습니다. 연간 화면은 위의 연간 거울 규칙을 그대로 따릅니다. 규칙은 이 두 가지뿐이며, 각 차트의 출처 줄에 어느 규칙을 따랐는지 밝힙니다.',
  },
  'mirror.p5': {
    en: '**Non-reporters** are seen only through their partners. Comtrade’s partner code 490, “Other Asia, not elsewhere specified”, is shown under the name **Asia, not elsewhere specified**, never as Taiwan. Taiwan does not report to UN Comtrade, so most importers book their trade with Taiwan there; Gulf exporters book unnamed Asian destinations there (Saudi Arabia most of its crude). It is a partner like any other in shares, rankings and concentration (HHI), so the network keeps that trade, but it is not an economy: it has no place on the map, no economy page, and it is never matched to a bank lender. The EU and ASEAN file as reporters too, but they are groups and stay out of the network, so nothing counts twice. Historical areas (the USSR, Czechoslovakia, Yugoslavia, East Germany) are economies of their own.',
    ko: '**미보고국**은 상대국 보고로만 파악합니다. Comtrade의 상대국 코드 490 \'기타 아시아(달리 분류되지 않음)\'는 **아시아(달리 분류되지 않음)**이라는 이름으로 표시하며, 대만으로 표시하지 않습니다. 대만은 UN Comtrade에 보고하지 않기 때문에 대부분의 수입국이 대만과의 교역을 이 코드에 기록합니다. 걸프 지역 수출국도 이름을 밝히지 않은 아시아 행선지를 이 코드에 기록합니다(사우디아라비아는 원유 수출의 대부분). 비중, 순위, 집중도(HHI)에서는 다른 상대국과 똑같이 다루므로 그 교역은 네트워크에 남습니다. 그러나 하나의 경제는 아니므로 지도에 자리가 없고 경제 페이지도 없으며, 은행 대출국과 연결하지도 않습니다. EU와 ASEAN도 보고국으로 자료를 내지만 국가 집단이므로 네트워크에서 제외합니다. 그래서 어떤 교역도 두 번 집계되지 않습니다. 옛 지역(소련, 체코슬로바키아, 유고슬라비아, 동독)은 각각 하나의 경제로 다룹니다.',
  },

  // 3. Coverage
  'cov.h': { en: 'Coverage, reporting and partial periods', ko: '수록 범위, 신고, 집계 중인 기간' },
  'cov.p1': {
    en: 'Not every economy files, and many file a year or more late, so the latest periods look smaller than they are. {r1} economies filed an annual file for {y1}, {r2} for {y2} and so far {r3} for {y3}.',
    ko: '모든 경제권이 신고하지는 않고, 많은 경제권이 1년 넘게 늦게 신고합니다. 그래서 최근 기간은 실제보다 작아 보입니다. 연간 파일을 낸 경제권은 {y1}년 {r1}개국, {y2}년 {r2}개국이고, {y3}년은 지금까지 {r3}개국입니다.',
  },
  'cov.p2': {
    en: '**Complete** has one definition: the last period in which the ten largest traders all reported and coverage reached 98%. That is {cA} for years and {cM} for months, when China’s monthly files end. Later periods are **partial**: their views carry a band and the share filed.',
    ko: '**완결**의 정의는 하나입니다. 10대 교역국이 모두 신고하고 수록률이 98%에 이른 마지막 기간입니다. 연간은 {cA}년, 월별은 중국의 월별 파일이 끝나는 {cM}입니다. 그 뒤의 기간은 **집계 중**이며, 화면에 음영 띠와 신고 비중이 붙습니다.',
  },
  'cov.p3': {
    en: '**Coverage** is the share of 2024 world exports (each economy’s exports to the world) held by the economies that filed the period; for months, of the economies that file monthly.',
    ko: '**수록률**은 해당 기간을 신고한 경제권이 2024년 세계 수출(각 경제권의 대세계 수출)에서 차지하는 비중입니다. 월별 수치는 월별 자료를 공표하는 경제권 가운데서 산출합니다.',
  },
  'cov.p4': {
    en: '**Missing is not zero.** A pair absent from both reports may have traded unrecorded. When a large reporter is missing, its imports fall back to its partners’ export reports, which can look like a change in the network. Economies revise their files for years, so cite the build date.',
    ko: '**없는 것은 0이 아닙니다.** 두 신고 모두에 없는 짝도 기록되지 않은 교역을 했을 수 있습니다. 큰 신고국이 빠지면 그 나라의 수입은 상대국의 수출 신고로 대신 채워집니다. 이 때문에 네트워크가 변한 것처럼 보일 수 있습니다. 경제권은 몇 년에 걸쳐 파일을 수정하므로 구축 날짜를 함께 인용해야 합니다.',
  },
  'cov.p6': {
    en: '**Incomplete periods.** A recent period can hold an economy only in part: its own report is missing and some of its partners have not filed either, so their flows with it drop out of the period, and of every window that contains it. The site measures, for each economy and period, the share of its usual trade that is present: the value a year earlier of the flows still there, over the value of all its flows a year earlier (if that year was itself thin, the year before). A fall in trade does not lower the share; a missing partner does. Under 90%, the economy’s line stops, its card says how much is there and the table marks the period. The period picker ends at the last month in which at least 85% of world trade is present ({shown}).',
    ko: '**불완전한 시점.** 최근 시점에는 한 경제권이 일부만 집계될 수 있습니다. 자기 신고가 아직 없고 상대국 일부도 신고하지 않은 경우입니다. 그러면 그 상대국과의 흐름이 그 시점에서 빠지고, 그 달이 포함된 모든 기간 합계에서도 빠집니다. 사이트는 경제권과 시점마다 평소 교역 가운데 집계된 비중을 측정합니다. 이 비중은 지금도 있는 흐름의 1년 전 금액을 1년 전 모든 흐름의 금액으로 나눈 값입니다(1년 전 자료도 부족하면 그 전해와 비교). 교역이 줄어도 이 비중은 낮아지지 않고, 상대국이 빠져야 낮아집니다. 90% 미만이면 그 경제권의 선은 멈춥니다. 카드에는 집계된 금액을 적고, 표에는 그 시점을 표시합니다. 시점 선택은 세계 교역의 85% 이상이 집계된 마지막 달({shown})에서 끝납니다.',
  },
  'cov.p5': {
    en: '**Unit errors.** A few files are off by orders of magnitude: Zimbabwe’s June 2006 monthly file reports $18 trillion of imports. The layer sets aside any file whose world total is more than ten times the median of the reporter’s neighbouring periods, and its partners’ reports stand in for it.',
    ko: '**단위 오류.** 자릿수가 틀린 파일이 몇 개 있습니다. 짐바브웨의 2006년 6월 월별 파일은 수입을 18조 달러로 신고했습니다. 레이어는 대세계 합계가 그 신고국의 앞뒤 기간 중앙값의 10배를 넘는 파일을 제외합니다. 그 자리는 상대국 신고로 대신합니다.',
  },

  // The coverage chart (method and checks pages)
  'chart.title': { en: 'Coverage of the monthly layer, {from} to {to}', ko: '월별 레이어의 수록률, {from}–{to}' },
  'chart.unit': { en: 'Share of 2024 world exports filed, %', ko: '신고된 2024년 세계 수출 비중(%)' },
  'chart.partial': { en: 'partial', ko: '집계 중' },
  'chart.complete': { en: '{m} · {c} · {n} economies', ko: '{m} · {c} · {n}개국' },
  'chart.end': { en: '{m} · {c} · {n}', ko: '{m} · {c} · {n}개국' },
  'chart.aria': {
    en: 'Line chart of monthly coverage from {from} to {to}: {c1} in {m1}, the last complete month; {c2} in {m2}. The table below has every month.',
    ko: '{from}–{to} 월별 수록률 선 그래프입니다. 마지막 완결 월인 {m1}의 수록률은 {c1}, {m2}의 수록률은 {c2}입니다. 아래 표에 모든 달이 있습니다.',
  },
  'chart.caption': {
    en: 'Complete through {cm} ({cc}, {cn} economies); {list}. Coverage: the share of 2024 world exports held by the economies that have filed the month, of those that file monthly. Source: UN Comtrade, monthly, all goods; layer built {built}.',
    ko: '{cm}까지 완결({cc}, {cn}개국). {list}. 수록률은 그 달을 신고한 경제권이 2024년 세계 수출에서 차지하는 비중입니다(월별 신고 경제권 기준). 자료: UN Comtrade 월별 자료(전체 상품), 레이어 구축 {built}.',
  },
  'chart.item': { en: '{c} in {m}', ko: '{m} {c}' },
  'chart.table': { en: 'Show the months as a table', ko: '달별 수치를 표로 보기' },
  'chart.col.month': { en: 'Month', ko: '월' },
  'chart.col.cov': { en: 'Coverage, %', ko: '수록률(%)' },
  'chart.col.rep': { en: 'Reporters', ko: '보고 경제권' },
  'chart.col.src': { en: 'Source flag', ko: '출처 표시' },
  'chart.comtrade': { en: 'Comtrade files', ko: 'Comtrade 파일' },
  'chart.fill': { en: '{name}: {src} fill', ko: '{name}: {src} 보완' },
  'chart.fillNote': {
    en: 'In months flagged “{name}: {src} fill”, {name} counts as a reporter, in the share and in the count, through its customs service’s records, not a Comtrade file.',
    ko: '‘{name}: {src} 보완’으로 표시한 달에는 {name}이 Comtrade 파일이 아니라 관세청 통관자료로 신고 경제권에 들어갑니다. 비중과 개수 모두에 반영됩니다.',
  },

  // 4. HS versions
  'hs.h': { en: 'HS versions and the breaks of 2017 and 2022', ko: 'HS 버전과 2017·2022년의 단절' },
  'hs.p1': {
    en: 'The HS is revised every five years or so: H0 (1988/92), H1 (1996), H2 (2002), H3 (2007), H4 (2012), H5 (2017) and H6 (2022). Each reporter files a year in the version it used then, so in one year the same six digits can mean different goods in different economies’ files: in 2017, 60 reporters still filed in H4 and 106 in H5.',
    ko: 'HS는 약 5년마다 개정됩니다. 개정 버전은 H0(1988/92), H1(1996), H2(2002), H3(2007), H4(2012), H5(2017), H6(2022)입니다. 신고국은 그해 쓰던 버전으로 신고합니다. 따라서 같은 해에도 같은 6자리 코드가 경제권마다 다른 상품을 뜻할 수 있습니다. 2017년에는 60개 신고국이 아직 H4로, 106개 신고국이 H5로 신고했습니다.',
  },
  'hs.p2': {
    en: 'Codes are taken in HS2022. Where a code was split in 2022, the stage carries its older code too: solar modules are `8541.43` in HS2022 and sat with cells and LEDs in `8541.40` before; smartphones left `8517.12`. Chapters and headings change less than six-digit codes, and long six-digit series need a concordance: Pierce and Schott (2012) found that revised codes covered 59% of US import value by 2004.',
    ko: '코드는 HS2022 기준입니다. 2022년에 나뉜 코드는 그 단계에 옛 코드도 함께 둡니다. 태양광 모듈은 HS2022에서 `8541.43`이고, 그 전에는 셀, LED와 함께 `8541.40`에 있었습니다. 스마트폰은 `8517.12`에서 분리됐습니다. 류(2자리)와 호(4자리)는 6자리 코드보다 덜 바뀝니다. 긴 6자리 시계열에는 연계표가 필요합니다. Pierce and Schott(2012)에 따르면 2004년까지 개정된 코드가 미국 수입액의 59%를 차지했습니다.',
  },
  'hs.p3': {
    en: 'All goods go back to 1962 through SITC files; HS products start in 1995. Tier 0 of the checks looks for jumps in world trade at the 2017 and 2022 breaks, and flags a product when the jump is more than three times its usual yearly change and above 15%. In the last run, {pass} products passed and {watch} were flagged.',
    ko: '전체 상품은 SITC 파일로 1962년까지 거슬러 올라가고, HS 품목은 1995년부터입니다. 검증 0단계는 2017년과 2022년 단절 시점의 세계 교역 급변을 점검합니다. 변화가 평소 연간 변화의 3배를 넘고 15%를 넘으면 표시합니다. 최근 실행에서 {pass}개 품목이 통과했고 {watch}개가 표시됐습니다.',
  },

  // 5. Months: the two explorers and the two monthly readings (2 Nov 2026: the explorer draws years only)
  'lens.h': { en: 'How months are read', ko: '월별 자료를 읽는 법' },
  'lens.p1': {
    en: 'Monthly is the working frequency for anything with a date in it; annual is the frame. Seasonality is large, so it is named, not adjusted away: as an index of each year’s monthly mean over 2017–19 and 2022–24, China’s chip exports (`8542`, its own reports) run at 79 in February and 113 in September. We do not seasonally adjust bilateral flows, because thousands of short series with HS breaks would give factors no reader can reproduce. Every monthly chart says instead which sum it draws, in its caption and in the address.',
    ko: '날짜가 포함된 분석은 월별 자료로 하고, 연간 자료는 틀로 씁니다. 계절성이 크므로 조정하지 않고 밝힙니다. 2017~19년과 2022~24년의 연평균 월 수출을 100으로 한 지수로 보면, 중국의 반도체(`8542`, 중국 자신의 신고) 수출은 2월 79, 9월 113입니다. 양자 간 교역 흐름은 계절 조정하지 않습니다. HS 단절이 있는 짧은 시계열 수천 개에서 나온 계절 요인은 독자가 재현할 수 없기 때문입니다. 대신 모든 월별 그래프는 어떤 합계를 그렸는지 설명문과 주소에 적습니다.',
  },
  'lens.pages': {
    en: '**Two explorers.** [The explorer](/{lang}/explore) draws years only (decision D6, 2 November 2026): the mirror rule, every network measure and every product back to 1995, all goods to 1962. [Monthly](/{lang}/explore-monthly) draws months as rolling sums of 3, 6 or 12 months, with the months an importer has not filed estimated and flagged; it is the one place on the site to play the network month by month. Neither page draws a single month.',
    ko: '**탐색 화면은 둘입니다.** [탐색](/{lang}/explore)은 연간 자료만 그립니다(2026년 11월 2일, 결정 D6). 미러 규칙과 모든 네트워크 지표를 쓰고, 품목은 1995년, 전체 상품은 1962년까지 거슬러 올라갑니다. [월별](/{lang}/explore-monthly)은 3·6·12개월 이동 합계로 달마다 그리고, 수입국이 신고하지 않은 달은 추정해 표시합니다. 네트워크를 달마다 재생하는 곳은 이 페이지뿐입니다. 두 페이지 모두 한 달 값은 그리지 않습니다.',
  },
  'lens.col.lens': { en: 'Reading', ko: '읽기' },
  'lens.col.shows': { en: 'What it shows', ko: '나타내는 것' },
  'lens.col.removes': { en: 'What it removes', ko: '없애는 것' },
  'lens.col.costs': { en: 'What it costs', ko: '대가' },
  'lens.col.default': { en: 'Where it is used', ko: '쓰는 곳' },
  'lens.L': { en: 'Level · 12-month sum', ko: '수준 · 12개월 합계' },
  'lens.L.shows': { en: 'The 12-month sum, plotted every month', ko: '매달 그린 12개월 합계' },
  'lens.L.removes': { en: 'Seasonality; noise in single files', ko: '계절성, 개별 파일의 잡음' },
  'lens.L.costs': {
    en: 'A one-month shock enters at one-twelfth and the turn shows about six months late',
    ko: '한 달짜리 충격이 12분의 1로 들어가고, 전환점이 약 6개월 늦게 나타납니다',
  },
  'lens.L.default': {
    en: 'Monthly explorer at 12 months; the chain pages’ monthly strips; event and case charts',
    ko: '12개월 합계의 월별 탐색, 사슬 페이지의 월별 띠그래프, 경제 사건과 사례 연구 그래프',
  },
  'lens.M': { en: 'Momentum · 3-month sum', ko: '증가세 · 3개월 합계' },
  'lens.M.shows': { en: 'The 3-month sum against the same three months a year earlier, %', ko: '3개월 합계의 전년비(%)' },
  'lens.M.removes': { en: 'Seasonality, the New Year included; timing noise', ko: '설 연휴를 포함한 계절성, 시점 잡음' },
  'lens.M.costs': { en: 'Base effects; price moves', ko: '기저 효과, 가격 변동' },
  'lens.M.default': {
    en: 'Monthly explorer at 3 months (change colours are year on year); event strips and “what changed” numbers',
    ko: '3개월 합계의 월별 탐색(변화 색은 전년비), 경제 사건 띠그래프와 ‘무엇이 바뀌었나’ 수치',
  },
  'lens.caption': {
    en: 'The two monthly readings. The case studies’ partner shares are the one place a single month enters: a month’s shares against the same month a year earlier, January and February as one period stored at February, shares only.',
    ko: '월별 자료를 읽는 두 가지 방법입니다. 한 달 값이 들어가는 곳은 사례 연구의 상대국 비중뿐입니다. 그달의 비중을 전년동월과 비교합니다. 1월과 2월은 한 기간으로 2월에 저장하고 비중만 씁니다.',
  },
  'lens.example.h': { en: 'One month, two readings', ko: '한 달, 두 가지 읽기' },
  'lens.example.p': {
    en: 'China’s chip exports in February 2023, against the window ending 12 months earlier, under the one monthly rule (the monthly explorer’s windows): the three months to February read {m} and the twelve months to February {l}. The same month is a fall in one reading and flat in the other; the reading is the story, so the caption always says which one is on screen.',
    ko: '2023년 2월 중국의 칩 수출을 12개월 앞서 끝나는 창과 비교한 결과입니다(단일 월간 규칙, 곧 월간 탐색기의 창 기준). 2월까지 3개월은 {m}, 2월까지 12개월은 {l}입니다. 같은 달이 한 기준으로는 감소이고 다른 기준으로는 보합입니다. 어느 기준으로 읽느냐에 따라 이야기가 달라지므로, 설명문에는 화면에 나온 기준을 늘 밝힙니다.',
  },
  'lens.ex.col.lens': { en: 'Change on a year earlier, Feb 2023', ko: '2023년 2월 전년비' },
  'lens.ex.col.site': { en: 'This site’s layer', ko: '이 사이트 레이어' },
  'lens.ex.M': { en: '3-month sum', ko: '3개월 합계' },
  'lens.ex.L': { en: '12-month sum', ko: '12개월 합계' },
  'lens.ex.na': { en: 'not stored', ko: '저장 안 함' },
  'lens.ex.caption': {
    en: 'China → world, integrated circuits (`8542`). Source: nodes/W/B-chips_ic, the monthly explorer’s 3- and 12-month windows (the importer’s report where it filed, else the exporter’s spliced, benchmarked or times 1.06). No single-month value is stored for an economy or a flow.',
    ko: '중국 → 세계, 집적회로(`8542`). 자료: nodes/W/B-chips_ic, 월간 탐색기의 3개월·12개월 창(수입국이 보고한 달은 수입국 보고, 그 밖의 달은 수출국 보고를 접합하거나 연간 자료에 맞춰 조정하거나 1.06을 곱한 값). 경제별·흐름별 단월 값은 저장하지 않습니다.',
  },
  'lens.p2': {
    en: '**January and February together.** The Lunar New Year moves between January and February. China’s chip exports were $8.6bn in January and $9.7bn in February 2023 (holiday on 22 January) but $12.3bn and $10.1bn in 2024 (holiday on 10 February): single months read +43% and +5%, while the two months together grew 23%. Since 31 October 2026 no explorer draws a single month (decision D14), and no single-month value of a flow or an economy is published; the case studies’ partner shares keep January and February as one period, stored at February.',
    ko: '**1월과 2월은 함께 봅니다.** 설 연휴는 1월과 2월 사이를 오갑니다. 중국의 반도체 수출은 2023년(연휴 1월 22일) 1월 86억 달러, 2월 97억 달러였습니다. 2024년(연휴 2월 10일)에는 각각 123억 달러와 101억 달러였습니다. 한 달씩 보면 +43%와 +5%지만 두 달을 합치면 23% 늘었습니다. 2026년 10월 31일부터 어느 탐색 화면도 한 달 지도를 그리지 않습니다(결정 D14). 흐름이나 경제권의 한 달 값도 공개하지 않습니다. 사례 연구의 상대국 비중은 1월과 2월을 하나의 기간으로 2월에 저장합니다.',
  },
  'lens.p3': {
    en: '**Base effects** are shown, not hidden: a month that fell sharply makes the same month a year later read high. Strips offer “against two years earlier” for 2021–22 and “against 2019” for the pandemic.',
    ko: '**기저 효과**는 감추지 않고 드러냅니다. 크게 떨어진 달 뒤에는 이듬해 같은 달이 높게 나타납니다. 띠그래프는 2021~22년에는 ‘2년 전 대비’를, 팬데믹 기간에는 ‘2019년 대비’를 제공합니다.',
  },
  'lens.p4': {
    en: '**Prices and the dollar.** Values are current US dollars, so a price swing or a weaker euro or yen moves them. Where net weight covers at least 80% of value, a stage carries a unit value ($/kg) and a volume series; a change is called price-driven when the unit value explains more than half of it.',
    ko: '**가격과 달러.** 금액은 경상 미국 달러 기준이므로 가격 변동이나 유로·엔 약세가 금액을 움직입니다. 순중량 자료가 있는 교역이 금액의 80% 이상인 단계에는 단가($/kg)와 물량 시계열을 붙입니다. 단가가 변화의 절반 넘게 설명하면 가격 요인으로 봅니다.',
  },

  // 6. Chains
  'chains.h': { en: 'How the chains are built', ko: '공급망 사슬을 만드는 방법' },
  'chains.p1': {
    en: 'The Harmonized System sorts goods by material and, within a material, by how far it has been worked, so within one material the code order is already a ladder: copper concentrate (`2603.00`), refined cathode (`7403.11`), wire (`7408`), cable (`8544`). Across materials the code list says nothing: no HS rule says that lithium-ion cells (`8507.60`) are made from cathode powder (`2841.90`) and graphite (`3801.10`). Those links are written down once, from how the product is made, in `config/chains.yaml`.',
    ko: 'HS는 상품을 재료별로, 같은 재료 안에서는 가공 정도별로 나눕니다. 따라서 한 재료 안에서는 코드 순서가 이미 사다리입니다. 구리 정광(`2603.00`), 정제 음극동(`7403.11`), 선(`7408`), 케이블(`8544`)이 그 예입니다. 재료가 바뀌면 코드 목록만으로는 연결을 알 수 없습니다. 리튬이온 셀(`8507.60`)이 양극재(`2841.90`)와 흑연(`3801.10`)으로 만들어진다는 규칙은 HS에 없습니다. 이런 연결은 제조 방식에 따라 `config/chains.yaml`에 한 번씩 적어 둡니다.',
  },
  'chains.p2': {
    en: '**Ladders.** Each chain has its own ladder of stages: the traded forms a material takes between the ground and the shop, in the order they are made, one rung per step that customs records can see. Ladders differ in length because the processes do: clothing has four rungs (raw fibre, yarn, fabric, clothing), steel six, chips eight (quartz, silicon metal, polysilicon, wafers, chips, boards, modules and parts, devices). Several products can share a rung, and a chain need not trade every form: potash goes from mine to fertiliser inside one plant. Stage numbers (S1, S2 …) count rungs from the ground within one chain, so they do not compare across chains.',
    ko: '**사다리.** 사슬마다 고유한 단계 사다리가 있습니다. 사다리는 재료가 땅에서 상점까지 거치며 교역되는 형태를 만들어지는 순서대로 늘어놓은 것입니다. 통관자료로 확인할 수 있는 공정 하나가 한 층위입니다. 공정이 다르니 사다리 길이도 다릅니다. 의류는 네 층위(원섬유, 원사, 직물, 의류), 철강은 여섯 층위입니다. 반도체는 여덟 층위(석영, 금속 실리콘, 폴리실리콘, 웨이퍼, 칩, 기판, 모듈·부품, 기기)입니다. 한 층위에 여러 품목이 놓일 수 있고, 모든 형태가 교역되는 것은 아닙니다. 칼륨은 한 공장 안에서 광산에서 비료가 됩니다. 단계 번호(1단계, 2단계 …)는 한 사슬 안에서 땅에서부터 매긴 층위 번호입니다. 그래서 사슬끼리 비교하지 않습니다.',
  },
  'chains.p3': {
    en: '**Chokepoint.** The stage worth at least $1bn with the highest exporter concentration (HHI, the sum of squared exporter shares), when that HHI is above 0.25; a chain may have none. An HHI above 0.15 is moderate and above 0.25 high.',
    ko: '**병목.** 세계 교역이 10억 달러 이상인 단계 가운데 수출국 집중도가 가장 높은 단계입니다. 집중도는 HHI(수출국 비중 제곱의 합)로 측정합니다. HHI가 0.25를 넘을 때만 병목으로 정합니다. 병목이 없는 사슬도 있습니다. HHI 0.15 초과는 보통, 0.25 초과는 높은 집중입니다.',
  },
  'chains.p4': {
    en: '**Shared stages.** A stage that two chains share with the same codes is one product, named after the first chain: wafers in chips and solar, PTA and ethylene glycol in plastics and clothing. No value step crosses a shared code.',
    ko: '**공유 단계.** 두 사슬이 같은 코드로 공유하는 단계는 하나의 품목이며, 먼저 나오는 사슬의 이름을 씁니다. 반도체와 태양광의 웨이퍼, 플라스틱과 의류의 PTA·에틸렌글리콜이 그 예입니다. 공유 코드를 가로지르는 금액 계산은 하지 않습니다.',
  },
  'chains.p5': {
    en: '**Feedstocks and use shares.** A customs record says what crossed the border, not what it was for. About one barrel of crude in eight becomes petrochemical feedstock (IEA, The Future of Petrochemicals, 2018: about 12% of oil demand), and about two-thirds of nickel goes to stainless steel, not to cathodes. So a chain starts at its first chain-specific product; crude, gas and LPG join as side inputs; and every shared stage carries a use share from a named, dated source outside trade. The share scales the trail and the scenarios but never the map: the map always shows the whole flow, because that is what crossed the border. Where a shared stage has no source, the share reads “unknown” and a scenario stops there. A stage that feeds only its own chain carries no use share: there a scenario passes the whole shortfall down, an explicit upper bound labelled as such (100% pass-through). A scenario’s exposure upstream is the share of an economy’s imports from the closed supplier, not of all it uses, so it overstates the risk where most of the input is made at home.',
    ko: '**원료와 사용 비중.** 통관자료는 무엇이 국경을 넘었는지만 기록합니다. 무엇에 쓰였는지는 기록하지 않습니다. 원유는 여덟 배럴에 한 배럴꼴로 석유화학 원료가 됩니다. IEA(The Future of Petrochemicals, 2018)는 이를 석유 수요의 약 12%로 집계했습니다. 니켈은 약 3분의 2가 양극재가 아니라 스테인리스강으로 갑니다. 그래서 사슬은 그 사슬에 고유한 첫 품목에서 시작합니다. 원유·가스·LPG는 보조 투입으로 붙습니다. 공유 단계마다 교역 밖의 출처와 연도를 밝힌 사용 비중을 붙입니다. 이 비중은 흐름도와 시나리오의 크기를 조정하지만 지도에는 쓰지 않습니다. 국경을 넘은 것은 흐름 전체이므로 지도는 늘 흐름 전체를 그립니다. 공유 단계에 출처가 없으면 ‘알 수 없음’으로 적고, 시나리오는 그 단계에서 멈춥니다. 자기 사슬에만 쓰이는 단계에는 사용 비중이 없습니다. 이때 시나리오는 부족분 전부를 아래로 넘깁니다. 이는 상한(100% 전가)이라고 밝혀 적습니다. 시나리오의 상류 노출도는 닫힌 공급국에서 수입한 비중입니다. 쓰는 양 전체에서의 비중이 아닙니다. 그래서 투입물 대부분을 국내에서 생산하는 경제에서는 위험이 과대평가됩니다.',
  },
  'chains.p6': {
    en: 'World trade of a stage is the sum of its flows under the mirror rule. Unit values are shown only where net weight covers at least 80% of value. [The ten chains](/{lang}/chains) have a page each.',
    ko: '단계의 세계 교역은 미러 규칙에 따른 교역 흐름의 합입니다. 단가는 순중량 자료가 있는 교역이 금액의 80% 이상일 때만 표시합니다. [열 개의 사슬](/{lang}/chains)은 각각 페이지가 있습니다.',
  },

  // 7. What trade cannot see
  'blind.h': { en: 'What trade cannot see', ko: '교역 통계가 포착하지 못하는 것' },
  'blind.home': {
    en: '**Production used at home.** Germany (34%) and the US (30%) lead polysilicon exports while China, the largest producer, is third (12%). Tracing origin needs production data for the first three stages (USGS, IEA, worldsteel).',
    ko: '**국내에서 쓰는 생산.** 폴리실리콘 수출은 독일(34%)과 미국(30%)이 앞서고, 최대 생산국인 중국은 3위(12%)입니다. 원산지를 추적하려면 앞의 세 단계에 생산 자료(USGS, IEA, worldsteel)가 필요합니다.',
  },
  'blind.owner': {
    en: '**Ownership.** Trade records location, not ownership: cells made in a plant in Poland or Hungary count as Polish or Hungarian exports, whoever owns the plant.',
    ko: '**소유.** 교역은 소유가 아니라 위치를 기록합니다. 폴란드나 헝가리 공장에서 만든 셀은 공장의 소유주가 누구든 폴란드나 헝가리의 수출로 집계합니다.',
  },
  'blind.va': {
    en: '**Value added.** A flow counts the full value of the good, not what the exporter added. Value-added questions need input-output tables (OECD TiVA and ICIO).',
    ko: '**부가가치.** 교역 흐름은 수출국이 더한 가치가 아니라 상품의 전체 가치를 집계합니다. 부가가치를 분석하려면 산업연관표(OECD TiVA, ICIO)가 필요합니다.',
  },
  'blind.hubs': {
    en: '**Re-exports and hubs.** Hong Kong, Singapore, the Netherlands, Belgium and the UAE inflate hub roles; 118 reporters have never reported re-exports separately (Mitikj and Kaushik 2024).',
    ko: '**재수출과 중계지.** 홍콩, 싱가포르, 네덜란드, 벨기에, 아랍에미리트는 중계지 역할이 실제보다 크게 나타납니다. 118개 신고국은 재수출을 따로 신고한 적이 없습니다(Mitikj and Kaushik 2024).',
  },
  'blind.codes': {
    en: '**One code, several things.** Residual “n.e.c.” codes (lithium and rare-earth ore in `2530.90`); codes that join two chains (coking and thermal coal in `2701.12`, naphtha with gasoline in `2710.12`); and a chip that crosses borders as `8542` several times on its way to the board.',
    ko: '**한 코드, 여러 상품.** ‘달리 분류되지 않은’ 잔여 코드(리튬·희토류 광석이 함께 담긴 `2530.90`), 두 사슬을 잇는 코드(원료탄과 연료탄이 함께 담긴 `2701.12`, 나프타와 휘발유가 함께 담긴 `2710.12`), 그리고 기판에 이르기까지 `8542`로 국경을 여러 번 넘는 반도체가 있습니다.',
  },
  'blind.cause': {
    en: '**Cause.** An event window shows before and after, not why. Event pages say what else changed; causal claims come only from the papers the case studies quote.',
    ko: '**인과.** 사건 전후 비교는 전과 후를 나타낼 뿐 이유를 설명하지 않습니다. 경제 사건 페이지는 그 밖에 무엇이 바뀌었는지 적습니다. 인과에 대한 주장은 사례 연구가 인용하는 논문에서만 가져옵니다.',
  },

  // 8. Network measures
  'net.h': { en: 'From flows to a network', ko: '교역 흐름에서 네트워크로' },
  'net.p1': {
    en: 'Economies become nodes and flows become directed, weighted edges, exporter → importer, weighted by value. The all-goods network is dense: in {year}, {edges} flows linked {nodes} economies, {density} of all possible pairs. A picture of every edge is a hairball, so the views draw a **backbone**: each economy’s top destinations and top suppliers (`k`), above a share of world trade (`min`). Measures are always computed on the full graph.',
    ko: '경제권은 노드가, 교역 흐름은 수출국 → 수입국 방향에 금액을 가중치로 한 간선이 됩니다. 전체 상품 네트워크는 촘촘합니다. {year}년에는 교역 흐름 {edges}개가 {nodes}개국을 이었고, 가능한 짝의 {density|이} 교역했습니다. 모든 간선을 그리면 엉킨 실타래가 되므로, 화면은 **골격**만 그립니다. 골격은 각 경제권의 상위 수출 대상국과 상위 공급국(`k`) 가운데 세계 교역의 일정 비중(`min`)을 넘는 흐름입니다. 지표는 언제나 전체 그래프에서 계산합니다.',
  },
  'net.col.measure': { en: 'Measure', ko: '지표' },
  'net.col.def': { en: 'Definition', ko: '정의' },
  'net.col.reading': { en: 'Reading', ko: '읽는 법' },
  'net.m1': { en: 'Exports, imports', ko: '수출, 수입' },
  'net.m1.def': { en: 'The sum of an economy’s outgoing or incoming flows', ko: '경제권에서 나가거나 들어오는 흐름의 합' },
  'net.m1.read': { en: 'Size in this product’s trade', ko: '이 품목 교역에서의 크기' },
  'net.m2': { en: 'Partners', ko: '상대국 수' },
  'net.m2.def': { en: 'The number of destinations and suppliers', ko: '수출 대상국과 공급국의 수' },
  'net.m2.read': { en: 'The extensive margin', ko: '외연적 한계' },
  'net.m3': { en: 'Supplier concentration', ko: '공급국 집중도' },
  'net.m3.def': { en: 'HHI of an economy’s imports by supplier, and the top supplier’s share', ko: '공급국별 수입의 HHI와 최대 공급국 비중' },
  'net.m3.read': { en: 'Import dependence; above 0.25 is highly concentrated', ko: '수입의존도, 0.25 초과면 높은 집중' },
  'net.m4': { en: 'Exporter concentration', ko: '수출국 집중도' },
  'net.m4.def': { en: 'HHI of world exports of the product by exporter', ko: '품목 세계 수출의 수출국별 HHI' },
  'net.m4.read': { en: 'Global chokepoints', ko: '세계적 병목' },
  'net.m5': { en: 'Supplier PageRank', ko: '공급자 PageRank' },
  'net.m5.def': { en: 'PageRank (damping 0.85) on importer → exporter links weighted by value', ko: '금액 가중 수입국 → 수출국 연결의 PageRank(감쇠 0.85)' },
  'net.m5.read': { en: 'Central if central importers buy from you', ko: '중심적인 수입국에 많이 수출할수록 중심성이 높습니다' },
  'net.m6': { en: 'Buyer PageRank', ko: '구매자 PageRank' },
  'net.m6.def': { en: 'PageRank on exporter → importer links', ko: '수출국 → 수입국 연결의 PageRank' },
  'net.m6.read': { en: 'Central if central exporters sell to you', ko: '중심적인 수출국에서 많이 수입할수록 중심성이 높습니다' },
  'net.m7': { en: 'Betweenness', ko: '매개 중심성' },
  'net.m7.def': {
    en: 'Share of shortest paths through a node, on the backbone, with distance −ln(share of the exporter’s exports)',
    ko: '골격에서 한 노드를 지나는 최단 경로의 비중, 거리는 −ln(수출국 수출 중 비중)',
  },
  'net.m7.read': { en: 'Brokers and hubs between parts of the network', ko: '네트워크의 부분들을 잇는 중개자와 중계지' },
  'net.m8': { en: 'Communities', ko: '커뮤니티' },
  'net.m8.def': { en: 'Louvain on the two-way trade graph (seed 7), named after the largest member', ko: '양방향 교역 그래프의 Louvain 분할(시드 7), 가장 큰 구성원의 이름' },
  'net.m8.read': { en: 'Blocs that emerge from the data rather than from treaties', ko: '조약이 아니라 자료에서 드러나는 블록' },

  // 9. Checks summary
  'ladder.h': { en: 'The ladder of checks', ko: '검증 사다리' },
  'ladder.p1': {
    en: 'Every series passes a ladder of checks before it is published, and the results are published with it: economists want to see the check, not a badge. No commercial data are used: every series and every check on this site comes from a public source. A check that could not run says “not run”, never “pass”.',
    ko: '모든 시계열은 공개 전에 검증 사다리를 거치며, 검증 결과도 함께 공개합니다. 경제학자는 배지가 아니라 검증 자체를 보고 싶어 하기 때문입니다. 상업 자료는 쓰지 않습니다. 이 사이트의 모든 시계열과 검증은 공개 자료에서 나옵니다. 실행하지 못한 검증은 ‘통과’가 아니라 ‘미실행’으로 적습니다.',
  },
  'ladder.col.tier': { en: 'Tier', ko: '단계' },
  'ladder.col.check': { en: 'Check', ko: '검증' },
  'ladder.col.against': { en: 'Against', ko: '비교 대상' },
  'ladder.col.cadence': { en: 'Cadence', ko: '주기' },
  'ladder.t0': { en: 'Comtrade against itself: monthly files against the annual file, the monthly mirror ratio, jumps at the HS breaks', ko: 'Comtrade 자체 비교: 월별 파일과 연간 파일, 월별 미러 비율, HS 단절 시점의 급변' },
  'ladder.t0.against': { en: 'The annual layer and the reporting table', ko: '연간 레이어와 신고 현황표' },
  'ladder.t0.cadence': { en: 'weekly, with the build', ko: '매주, 구축과 함께' },
  'ladder.t1': { en: 'National customs, timelier and processed independently', ko: '더 빠르고 독립적으로 처리된 각국 통관통계' },
  'ladder.t1.against': { en: 'Bank of Korea export value index (ECOS); US imports by origin (Census, via FRED)', ko: '한국은행 수출금액지수(ECOS), 미국 원산지별 수입(센서스국, FRED 경유)' },
  'ladder.t1.cadence': { en: 'monthly', ko: '매월' },
  'ladder.t2': { en: 'Production and prices, independent of trade', ko: '교역과 독립된 생산과 가격' },
  'ladder.t2.against': { en: 'IMF commodity prices, US industrial production, exchange rates (FRED)', ko: 'IMF 원자재 가격, 미국 산업생산, 환율(FRED)' },
  'ladder.t2.cadence': { en: 'monthly', ko: '매월' },
  'ladder.t3': { en: 'Firms: Korean chain companies’ segment revenue', ko: '기업: 한국 공급망 기업의 부문별 매출' },
  'ladder.t3.against': { en: 'DART filings (public)', ko: 'DART 공시(공개)' },
  'ladder.t3.cadence': { en: 'quarterly; not built yet', ko: '분기, 아직 구축 전' },
  'ladder.t4': { en: 'Physical balances: production against traded tonnage', ko: '물량 수지: 생산량과 교역 물량' },
  'ladder.t4.against': { en: 'USGS Mineral Commodity Summaries, IEA balances', ko: 'USGS 광물 요약, IEA 수급표' },
  'ladder.t4.cadence': { en: 'annual; not built yet', ko: '연간, 아직 구축 전' },
  'ladder.t5': { en: 'Papers: the numbers the case studies quote', ko: '논문: 사례 연구가 인용하는 수치' },
  'ladder.t5.against': { en: 'The paper text in the jejualps archive', ko: 'jejualps 문헌 보관소의 논문 본문' },
  'ladder.t5.cadence': { en: 'per case', ko: '사례마다' },
  'ladder.p2': {
    en: 'The last run, on {date}, covered {n} products: {summary}. [Every check and its result](/{lang}/method/checks).',
    ko: '{date}의 최근 실행은 품목 {n}개를 다뤘습니다. {summary}. [모든 검증과 결과](/{lang}/method/checks).',
  },
  'ladder.summary.item': { en: '{n} {status}', ko: '{status} {n}건' },

  // 10. Licence and the record count
  'lic.h': { en: 'Licence and the record count', ko: '이용 조건과 원자료 건수' },
  'lic.p1': {
    en: 'UN Comtrade’s terms of use draw a line at 100,000 records: a free visualisation holding fewer than 100,000 original records needs no licence. Transformed data (new indicators, indices, aggregations) are not copyrighted, while rounding or reformatting is not a transformation. The line counts what a product stores, not what one query returns.',
    ko: 'UN Comtrade 이용 조건은 10만 건을 기준으로 합니다. 원자료가 10만 건 미만인 무료 시각화에는 이용 허가가 필요 없습니다. 변환된 자료(새 지표, 지수, 집계)에는 저작권이 없지만, 반올림이나 형식 변경은 변환이 아닙니다. 이 기준은 한 번의 조회로 받는 양이 아니라 서비스가 저장한 양입니다.',
  },
  'lic.p2': {
    en: '**The bundle stores derived records (shares, ranks, ratios) and {originals} original records (budget {budget}; UN Comtrade’s line is {line}).** A flow is stored as its share of the product’s world trade, its ranks among the exporter’s destinations and the importer’s suppliers, and its mirror ratio; each product and period carries one world total. Values on screen are share × total. HHI, PageRank, group shares and the strip series are indicators.',
    ko: '**사이트 자료 묶음은 파생 기록(비중, 순위, 비율)을 저장하고 원자료는 {originals}건입니다(예산 {budget}건, UN Comtrade의 선은 {line}건).** 교역 흐름은 비중, 순위, 미러 비율로 저장합니다. 비중은 품목 세계 교역에서의 비중입니다. 순위는 수출국의 수출 대상국 중 순위와 수입국의 공급국 중 순위입니다. 품목과 기간마다 세계 합계를 하나 둡니다. 화면의 금액은 비중 × 합계입니다. HHI, PageRank, 국가군 비중, 띠그래프 시계열은 지표입니다.',
  },
  'lic.p3': {
    en: 'There is no bulk path. Downloads carry only what a chart shows, and the API at api.datasteg.com and its MCP server return, one call at a time, only what a chart shows: derived shares, ranks and ratios, no original records, with no listing of the data folder and no bulk download. Readers who want the records should go to UN Comtrade (comtradeplus.un.org).',
    ko: '일괄 내려받기는 제공하지 않습니다. 내려받기와 API(api.datasteg.com), MCP 서버는 모두 차트가 표시하는 값만 제공합니다. API와 MCP 서버는 한 호출마다 값을 반환하며, 반환하는 값은 파생된 비중, 순위, 비율입니다. 원자료와 자료 폴더 목록은 포함하지 않습니다. 원자료가 필요하면 UN Comtrade(comtradeplus.un.org)를 이용합니다.',
  },
  'lic.p5': {
    en: 'Korea’s months that UN Comtrade lacks come from the Korea Customs Service through the public data portal (data.go.kr), which allows reuse with credit to the source. The site credits the Korea Customs Service wherever those months are used, and stores only derived values from them, as for Comtrade.',
    ko: 'UN Comtrade에 없는 한국의 달은 공공데이터포털(data.go.kr)의 관세청 자료를 씁니다. 포털은 출처를 밝히면 재이용을 허용합니다. 사이트는 이 달을 쓴 곳마다 관세청을 출처로 적고, Comtrade 자료와 마찬가지로 파생 값만 저장합니다.',
  },
  'lic.p6': {
    en: '**Conclusion, read against these terms (decision D6, 2026-10-24).** The bundle stores derived records only, shares, ranks and ratios, with {originals} original records against a budget of {budget}, and offers no bulk download: no listing of the data folder, downloads limited to what a chart shows, and an API (api.datasteg.com, with its MCP server) that returns, one call at a time, only what a chart shows, derived shares, ranks and ratios and no original records. Read this way, as an interpretation of the terms rather than a ruling, the site stays below the record limit in UN Comtrade’s terms and needs no licence; the records themselves are at comtradeplus.un.org.',
    ko: '**결론(이 조건에 대한 해석, 결정 D6, 2026-10-24).** 사이트 자료 묶음은 파생 기록(비중, 순위, 비율)만 저장합니다. 원자료는 {originals}건이며 예산은 {budget}건입니다. 일괄 내려받기는 제공하지 않습니다. 자료 폴더 목록을 표시하지 않고, 내려받기는 각 차트가 표시하는 데이터로 제한합니다. API(api.datasteg.com, MCP 서버 포함)도 한 번의 호출마다 차트가 표시하는 데이터와 파생 비중·순위·비율만 반환하며 원자료는 반환하지 않습니다. 이렇게 해석하면(법적 판단이 아닌 조건 해석), 사이트는 UN Comtrade 약정의 기록 한도를 넘지 않으므로 이용 허가가 필요 없습니다. 원자료는 comtradeplus.un.org에 있습니다.',
  },
  'ck.metaRun': { en: 'Last run {run}.', ko: '최근 실행 {run}.' },
  'lic.p4': {
    en: 'Fonts are under the SIL Open Font License 1.1, icons are Lucide (ISC) and the map layout starts from a Natural Earth projection (public domain).',
    ko: '글꼴은 SIL Open Font License 1.1, 아이콘은 Lucide(ISC)를 따릅니다. 지도 배치는 Natural Earth(퍼블릭 도메인) 투영에서 출발합니다.',
  },

  // 11. The explorer's address
  'hash.h': { en: 'The explorer’s address', ko: '탐색 화면의 주소' },
  'hash.p1': {
    en: 'The explorer keeps its state in the address after `#`, so a view can be shared exactly and an article can link into it. Keys with default values are left out. For example:',
    ko: '탐색 화면은 상태를 주소의 `#` 뒤에 담습니다. 그래서 보고 있는 화면을 그대로 공유할 수 있고, 기사가 특정 화면으로 연결할 수 있습니다. 기본값인 키는 생략합니다. 예를 들면 다음과 같습니다.',
  },
  'hash.col.key': { en: 'Key', ko: '키' },
  'hash.col.meaning': { en: 'Meaning', ko: '뜻' },
  'hash.col.default': { en: 'Default', ko: '기본값' },
  'hash.t': { en: 'Period shown: YYYY (explorer) or YYYYMM (monthly explorer)', ko: '표시 기간: YYYY(탐색) 또는 YYYYMM(월별 탐색)' },
  'hash.t.d': { en: 'last complete period', ko: '마지막 완결 기간' },
  'hash.base': { en: 'Base period for change colouring', ko: '변화 색칠의 기준 시점' },
  'hash.base.d': { en: '2017 (years), t − 12 (months)', ko: '2017(연), t − 12(월)' },
  'hash.p': { en: 'Product: `TOTAL`, `HS:<2/4/6 digits>`, `B:<basket>`, `C:<chain>:<stage>`', ko: '품목: `TOTAL`, `HS:<2/4/6자리>`, `B:<묶음>`, `C:<사슬>:<단계>`' },
  'hash.m': { en: 'Flow rule: `mirror`, `importer`, `exporter`', ko: '교역 흐름 규칙: `mirror`, `importer`, `exporter`' },
  'hash.l': { en: 'Layout: `map`, `force`', ko: '배치: `map`(지도), `force`(힘 배치)' },
  'hash.c': { en: 'Colour: `region`, `bloc`, `club`, `custom`, `change`, `concentration`, `reporting`, `stage`, `community`', ko: '색: `region`, `bloc`, `club`, `custom`, `change`, `concentration`, `reporting`, `stage`, `community`' },
  'hash.s': { en: 'Size measure: `total`, `split` (imports | exports), `exports`, `imports`, `pagerank`, `betweenness`, `degree`', ko: '크기 지표: `total`, `split`(수입 | 수출), `exports`, `imports`, `pagerank`, `betweenness`, `degree`' },
  'hash.sc': { en: 'Size scale: `fixed` across periods or per `period`', ko: '크기 척도: 기간 공통 `fixed` 또는 기간별 `period`' },
  'hash.blocs': { en: 'Trade blocs coloured, in order: `EU`, `ASEAN`, `USMCA`, `MERCOSUR`, `GCC`, `EAEU`, `AFCFTA`', ko: '색칠할 무역 블록(순서대로): `EU`, `ASEAN`, `USMCA`, `MERCOSUR`, `GCC`, `EAEU`, `AFCFTA`' },
  'hash.club': { en: 'Club highlighted: `G7`, `G20`, `OECD`, `BRICS`', ko: '강조할 국가 그룹: `G7`, `G20`, `OECD`, `BRICS`' },
  'hash.custom': { en: 'Own list of economies: ISO3 codes, comma-separated', ko: '직접 고른 경제권(쉼표로 구분한 ISO3 코드)' },
  'hash.mt': { en: 'Today’s membership for blocs and clubs: `1`', ko: '블록과 국가 그룹을 현재 회원국으로: `1`' },
  'hash.p2': {
    en: 'Chain pages take `?focus=ISO3` to show one economy’s place at every stage (the explorer reads it too); no economy is shown by default.',
    ko: '사슬 페이지는 `?focus=ISO3`로 한 경제권의 단계별 위치를 표시합니다(탐색 화면도 이를 읽습니다). 기본으로는 어떤 경제권도 따로 표시하지 않습니다.',
  },
  'hash.k': { en: 'Flows drawn per economy', ko: '경제권마다 그리는 교역 흐름 수' },
  'hash.min': { en: 'Share floor: the smallest flow drawn, as a share of world trade', ko: '비중 하한: 그리는 가장 작은 흐름(세계 교역 대비)' },
  'hash.lab': { en: 'Number of labels on the map', ko: '지도의 이름표 수' },
  'hash.focus': { en: 'Selected economy (ISO3)', ko: '선택한 경제권(ISO3)' },
  'hash.flow': { en: 'Selected flow, as `CHN>USA`', ko: '선택한 교역 흐름(`CHN>USA` 형식)' },
  'hash.w': { en: 'Monthly explorer only: window length in months, `3`, `6` or `12`', ko: '월별 탐색 전용. 합계 기간(개월), `3`, `6`, `12`' },
  'hash.cmp': { en: 'Monthly explorer only: compare with `yoy` (the same window a year earlier) or `base` (the chosen base)', ko: '월별 탐색 전용. 비교 기준은 `yoy`(전년동기) 또는 `base`(선택한 기준 시점)입니다.' },
  'hash.cmp.d': { en: '`yoy` below 12 months, `base` at 12', ko: '12개월 미만은 `yoy`, 12개월은 `base`' },
  'hash.est': { en: 'Monthly explorer only: `0` hides the estimated flows', ko: '월별 탐색 전용. `0`이면 추정한 흐름을 숨깁니다' },
  'hash.strip': { en: 'Metric on the time strip: `world`, `momentum`, `top1`, `hhi`, `edges`, `reporters`', ko: '시간 띠그래프의 지표는 `world`, `momentum`, `top1`, `hhi`, `edges`, `reporters`입니다.' },
  'hash.tbl': { en: 'Table view open: `1`', ko: '표 보기 열림: `1`' },
  'hash.tab': { en: 'Drawer tab: `main` or `checks`', ko: '서랍 탭: `main` 또는 `checks`' },
  'hash.none': { en: 'none', ko: '없음' },

  // Two-way trade
  'tw.h': { en: 'Two-way trade and the two reports of a flow', ko: '양방향 교역과 한 흐름의 두 신고' },
  'tw.p1': {
    en: 'An economy can import and export the same stage. The **Grubel–Lloyd index** measures how balanced the two are: GL = 1 − |X − M| / (X + M), for the economy’s exports X and imports M of the stage; 1 means equal, 0 one-way. A chain page marks an economy **↔ two-way** when its GL is at least 0.3 and its exports and its imports are each at least 2% of the stage’s world trade (one constant in the builder, `TWO_WAY`).',
    ko: '한 경제권이 같은 단계를 수입하면서 수출할 수도 있습니다. **그루벨–로이드 지수**는 두 흐름이 얼마나 균형을 이루는지 측정합니다. GL = 1 − |X − M| / (X + M)이며, X와 M은 그 경제권의 그 단계 수출과 수입입니다. 1이면 수출과 수입이 같고, 0이면 한쪽 방향만 있습니다. 사슬 페이지는 GL이 0.3 이상인 경제권에 **↔ 양방향** 표시를 붙입니다. 수출과 수입이 각각 그 단계 세계 교역의 2% 이상이어야 합니다(구축 스크립트의 상수 `TWO_WAY`).',
  },
  'tw.p2': {
    en: 'Under a stage whose five largest exporters or importers include a two-way trader, one sentence gives the largest one’s imports and exports, the unit value of each side where net weight covers at least 80% of the value, and its three largest suppliers and buyers. The sentence states numbers only; a cause is named only in a hand-written note with a source.',
    ko: '상위 5대 수출국이나 수입국에 양방향 교역국이 있는 단계 아래에는 문장 하나를 붙입니다. 이 문장에는 그 가운데 가장 큰 경제권의 수입과 수출, 양쪽의 단가, 3대 공급국과 3대 구매국을 적습니다. 단가는 순중량 자료가 있는 교역이 금액의 80% 이상일 때만 적습니다. 문장에는 수치만 적습니다. 원인은 출처를 밝힌 별도 설명에만 적습니다.',
  },
  'tw.p3': {
    en: 'Two-way trade is rarely an error. Four ordinary reasons: one six-digit code can hold goods of very different value (2506.10 holds quartzite lumps and high-purity quartz); goods are imported, refined or assembled and exported again; firms or regions in one economy buy and sell for their own reasons; and under the mirror rule one side can come from the economy’s own reports and the other from its partners’, where origin and consignment, re-exports and misclassification can make one side larger.',
    ko: '양방향 교역은 대개 오류가 아닙니다. 흔한 이유는 네 가지입니다. 첫째, 6단위 코드 하나에 가치가 크게 다른 물품이 들어갈 수 있습니다. 2506.10에는 규암 덩어리와 고순도 석영이 함께 있습니다. 둘째, 물품이 수입돼 정제·조립된 뒤 다시 수출됩니다. 셋째, 한 경제권 안에서도 기업이나 지역마다 수출입하는 이유가 다릅니다. 넷째, 미러 규칙에서는 한쪽은 자기 신고로, 다른 쪽은 상대국 신고로 기록될 수 있습니다. 이 경우 원산지와 선적지의 차이, 재수출, 품목 분류 차이가 한쪽 금액을 키울 수 있습니다.',
  },
  'tw.p4': {
    en: '**Reports disagree.** A flow has up to two reports, the importer’s and the exporter’s. The site draws one of them (the mirror rule) and keeps their ratio. Their gap is |importer’s − exporter’s| / the larger; a flow of at least 1% of the product’s world trade whose gap is above 0.5 carries “⚠ reports disagree” in tables and tooltips, never on the map. Imports are valued with freight and insurance and exports without, so gaps of a few per cent are normal.',
    ko: '**신고 불일치.** 한 흐름에는 수입국 신고와 수출국 신고가 최대 둘 있습니다. 사이트는 그 가운데 하나를 그리고(미러 규칙) 둘의 비율을 남깁니다. 둘의 차이는 |수입국 신고 − 수출국 신고| / 더 큰 쪽입니다. 품목 세계 교역의 1% 이상인 흐름의 차이가 0.5를 넘으면 표와 툴팁에 “⚠ 신고 불일치”를 붙입니다. 지도에는 붙이지 않습니다. 수입은 운임과 보험료를 포함하고 수출은 포함하지 않으므로 몇 퍼센트의 차이는 흔합니다.',
  },
  'tw.p5': {
    en: '**Split nodes.** On chain pages each economy is two half-discs on one scale, imports on the left in teal and exports on the right in gold, each with the area of its value, so the two halves together have the area of total trade. Big exporters, big importers and two-way traders read apart without another legend. The explorer offers the same split as a size.',
    ko: '**분할 원.** 사슬 페이지는 경제권마다 같은 척도의 반원 두 개를 그립니다. 왼쪽 청록색은 수입, 오른쪽 금색은 수출입니다. 넓이는 각각의 금액에 비례하므로 두 반원을 합친 넓이는 총교역입니다. 큰 수출국, 큰 수입국, 양방향 교역국은 다른 범례 없이 구별됩니다. 탐색 화면은 같은 분할을 크기 옵션으로 제공합니다.',
  },

  // Groupings
  'groups.h': { en: 'Groupings on the maps', ko: '지도의 국가 묶음' },
  'groups.p1': {
    en: 'Maps are coloured by predefined groupings rather than by communities computed from the data, which change from year to year (communities remain an advanced option in the explorer). Flows inside one group take its colour; flows between groups are grey. Each group keeps one colour on every page and in every year.',
    ko: '지도는 자료로 계산한 커뮤니티 대신 미리 정한 묶음으로 색칠합니다. 커뮤니티는 해마다 바뀌기 때문입니다(탐색 화면의 고급 옵션으로 남습니다). 한 묶음 안의 흐름은 그 묶음의 색으로, 묶음 사이의 흐름은 회색으로 표시합니다. 묶음마다 모든 페이지와 모든 연도에서 같은 색을 씁니다.',
  },
  'groups.p2': {
    en: '**Regions**, the default, are the UN M49 subregions of the Comtrade economy list in eight regions: North America; Latin America and the Caribbean; Europe; the Middle East and North Africa (Northern Africa and Western Asia); Sub-Saharan Africa; Central and South Asia; East and Southeast Asia; Oceania.',
    ko: '기본값인 **지역**은 Comtrade 경제권 목록의 UN M49 하위 지역을 여덟 개로 묶었습니다. 여덟 지역은 북미, 중남미·카리브, 유럽, 중동·북아프리카(북아프리카와 서아시아), 사하라 이남 아프리카, 중앙·남아시아, 동·동남아시아, 오세아니아입니다.',
  },
  'groups.p3': {
    en: '**Trade blocs** and **clubs** have dated memberships: an economy belongs from the day its membership took effect to its last day as a member. A map shows membership on the last day of the period on screen (31 December for a year, the month’s last day for a month), or today’s when the reader asks. Several blocs can be coloured at once; an economy in two of them takes the first in the reader’s order. Clubs overlap, so they are highlighted one at a time. Readers can also colour their own list of economies.',
    ko: '**무역 블록**과 **국가 그룹**은 회원 기간이 있습니다. 경제권은 가입이 효력을 얻은 날부터 회원이었던 마지막 날까지 해당 그룹에 속합니다. 지도는 화면에 보이는 기간의 마지막 날 기준 회원국을 표시합니다(연도는 12월 31일, 월은 그달 마지막 날). 독자가 원하면 현재 회원국을 표시합니다. 블록은 여럿을 함께 색칠할 수 있습니다. 두 블록에 속한 경제권은 독자가 고른 순서에서 앞 블록의 색을 씁니다. 국가 그룹은 서로 겹치므로 한 번에 하나만 강조합니다. 독자가 직접 고른 경제권 목록도 색칠할 수 있습니다.',
  },
  'groups.p4': {
    en: 'The table lists every bloc and club with its members on {date} and the sources of the dates.',
    ko: '표는 블록과 국가 그룹마다 {date} 기준 회원국 수와 날짜의 출처를 싣습니다.',
  },
  'groups.col.group': { en: 'Group', ko: '묶음' },
  'groups.col.kind': { en: 'Kind', ko: '종류' },
  'groups.col.members': { en: 'Members', ko: '회원국' },
  'groups.col.note': { en: 'Note', ko: '비고' },
  'groups.col.sources': { en: 'Sources of the dates', ko: '날짜 출처' },
  'groups.kind.bloc': { en: 'Trade bloc', ko: '무역 블록' },
  'groups.kind.club': { en: 'Club', ko: '국가 그룹' },
  'groups.source': { en: 'Source {n}', ko: '자료 {n}' },
  'groups.pending': { en: 'Dates not yet loaded', ko: '날짜 자료 없음' },

  // 12. Citing
  'cite.h': { en: 'How to cite', ko: '인용 방법' },

  // Monthly explore
  'mx.h': { en: 'Monthly explore: windows, gap filling, divergence flags', ko: '월별 탐색: 합계 기간, 빈칸 채우기, 신고 이탈 표시' },
  'mx.p1': {
    en: '[Explore (monthly)](/{lang}/explore-monthly) draws the network month by month on rolling sums of **3, 6 or 12 months** (`w`), precomputed on the server. A window shows the turn of a series about (w − 1) / 2 months late: 1 month at 3, 2.5 at 6, 5.5 at 12. No window splits January from February, so no window ends in January, a 3-month window does not end in April and a 6-month window does not end in July. The 12-month sum is the default and equals lens L. Shorter windows move with the season, so their levels carry a warning and their change colours compare with the same window a year earlier (`cmp=yoy`). PageRank, betweenness and communities are computed on 12-month sums only; on 3 and 6 months the map shows sizes, flows and change colours.',
    ko: '[탐색 (월별)](/{lang}/explore-monthly)은 **3·6·12개월** 이동 합계(`w`)로 달마다 네트워크를 그립니다. 합계는 서버에서 미리 계산합니다. 합계 기간이 w개월이면 전환점이 약 (w − 1) / 2개월 늦게 나타납니다. 3개월은 1개월, 6개월은 2.5개월, 12개월은 5.5개월입니다. 어느 합계도 1월과 2월을 가르지 않습니다. 그래서 1월에 끝나는 합계는 없고, 3개월 합계는 4월에, 6개월 합계는 7월에 끝나지 않습니다. 기본값은 12개월 합계이며 L 렌즈와 같습니다. 짧은 합계는 계절에 따라 움직입니다. 그래서 수준에는 경고를 붙이고, 변화 색은 전년동기와 비교합니다(`cmp=yoy`). 페이지랭크, 매개 중심성, 커뮤니티는 12개월 합계에서만 계산합니다. 3·6개월 합계 지도는 크기, 흐름, 변화 색만 표시합니다.',
  },
  'mx.p2': {
    en: '**Gap filling, after IMF DOTS.** A flow is drawn from the importer’s report. Where the importer did not file a month and the exporter did, the month is estimated by the year-on-year splice of the IMF’s Direction of Trade Statistics (Marini, Dippelsman and Stanger 2018): est(m) = κ(m) × partner(m), where κ(m) is own ÷ partner over the 12 months ending a year earlier (both sides filed every month). Over a window this is own(t − 12) × partner(t) ÷ partner(t − 12) with the anchor taken on 12 months, which absorbs both the level gap between the two reports (CIF and FOB, re-exports) and the season. D14’s form anchors on the window itself; it gives a month a different weight in each window, and the published windows would then pin single months, so the page anchors month by month. The backtest scores both on [the checks page](/{lang}/method/checks): for all goods their median errors differ by less than a percentage point.',
    ko: '**빈칸 채우기, IMF DOTS 방식.** 흐름은 수입국 신고로 그립니다. 수입국이 어느 달을 신고하지 않았고 수출국은 신고한 경우가 있습니다. 그 달은 IMF 무역방향통계(DOTS)의 전년동월 연계 방식으로 추정합니다. 방법은 Marini, Dippelsman, Stanger(2018)를 따릅니다. 식은 est(m) = κ(m) × partner(m)입니다. κ(m)은 1년 전까지 12개월 동안의 own ÷ partner 비율입니다(양쪽 모두 매달 신고한 경우). 합계 기간 전체로 보면 own(t − 12) × partner(t) ÷ partner(t − 12)입니다. 기준은 12개월로 정합니다. 두 신고의 수준 차이(CIF·FOB, 재수출)와 계절을 함께 흡수합니다. D14 원안은 합계 기간 자체에 기준을 둡니다. 그러면 한 달이 합계마다 다른 가중치를 받고, 공개한 합계에서 단월 값이 풀립니다. 그래서 달마다 기준을 둡니다. 두 방식의 역검증 결과는 [검증 페이지](/{lang}/method/checks)에 있습니다. 전체 상품에서 오차 중앙값의 차이는 1%p 미만입니다.',
  },
  'mx.p3': {
    en: 'If the 12 months a year earlier were not fully filed, the latest fully filed 12 months within 24 months anchor the ratio. An importer that stopped filing (China, whose last monthly file is for December 2024) keeps the last 12 months it filed as the anchor however old, and the estimate is named by that year (“spliced on 2024”), so nothing steps when the anchor passes 24 months. Where there is no anchor at all, or where a spliced month would exceed five times the importer’s own average month in the anchor year (a partner report that was near zero then), the month is the exporter’s report times 1.06 for CIF/FOB, flagged **partner-only**; the factor is the same for every importer and the same as in the annual mirror rule. Once the importer’s annual file covers a year that holds estimates, only the estimated months are moved so that the year sums to the annual figure (**benchmarked**, proportional Denton; we found no maintained Python implementation of Cholette–Dagum, which Statistics Canada maintains in R as G-Series); this includes the partner-only months of economies that file annually but never monthly (the United Arab Emirates, Iran, Iraq). Reported months are never changed. A reporter that filed a month but sent no row of a product (Japan’s April 2026 file holds no chapter 84 or 85) has not filed that product that month: its zero is not read as a report, and the month is estimated from the partners.',
    ko: '1년 전 12개월이 모두 보고되지 않았으면, 24개월 안에서 가장 최근에 모두 보고된 12개월을 비율의 기준으로 삼습니다. 보고를 멈춘 수입국은 마지막으로 보고한 12개월을 아무리 오래되어도 계속 기준으로 삼습니다. 마지막 월간 자료가 2024년 12월인 중국이 그 예입니다. 이때 추정치에는 그 연도를 붙여 \'2024년 기준 접합\'으로 부릅니다. 그래서 기준이 24개월을 넘겨도 수치가 끊기지 않습니다. 기준이 아예 없거나, 접합한 달이 기준 연도 수입국 자체 월평균의 5배를 넘으면 그 달은 수출국 보고에 CIF/FOB 환산계수 1.06을 곱한 값으로 하고 **상대국 보고만**으로 표시합니다. 5배를 넘는 경우는 당시 상대국 보고가 0에 가까웠던 경우입니다. 이 계수는 모든 수입국에 같고, 연간 거울 규칙의 계수와도 같습니다. 수입국의 연간 자료가 추정치가 있는 해를 포괄하게 되면, 추정한 달만 조정해 그해 합계를 연간 수치에 맞춥니다(**연간 조정**, 비례 Denton 방식). Cholette–Dagum 방식은 관리되는 Python 구현을 찾지 못했습니다. 캐나다 통계청은 이 방식을 R의 G-Series로 관리합니다. 연간으로만 보고하고 월간으로는 보고하지 않는 경제(아랍에미리트, 이란, 이라크)의 상대국 보고만 쓴 달도 여기에 포함됩니다. 보고된 달은 바꾸지 않습니다. 보고국이 어떤 달 자료를 내고도 특정 품목의 행을 보내지 않았다면, 그 달 그 품목은 보고하지 않은 것으로 봅니다. 일본의 2026년 4월 자료에는 84류와 85류 행이 없습니다. 이런 0은 보고로 읽지 않고, 그 달은 상대국 보고로 추정합니다.',
  },
  'mx.p4': {
    en: 'Every flow and economy carries its estimate code, **reported**, **benchmarked**, **spliced** (named by its anchor year), **partner-only** or **interpolated** (a month the reporter filed without a row of the product, the average of the months around it). Estimated flows are drawn dashed and can be hidden (`est=0`); the caption gives the share of world trade that is estimated in the window on screen.',
    ko: '모든 흐름과 경제에는 추정 코드가 붙습니다. **보고**, **연간 조정**, **접합**(기준 연도 표기), **상대국 보고만**, **보간**(보고국이 자료를 냈지만 그 품목의 행이 없는 달에 앞뒤 달의 평균을 쓴 값)입니다. 추정한 흐름은 점선으로 그리며 숨길 수 있습니다(`est=0`). 설명문에는 화면에 나온 창에서 추정치가 세계 교역에서 차지하는 비중을 밝힙니다.',
  },
  'mx.p5': {
    en: '**Divergence flags: detect, never correct.** For each pair, the 12-month mirror ratio (importer’s report ÷ exporter’s, both filed every month) is flagged when it lies outside the median ± 3 MAD of the 36 months before, the band at least ±10% of the median wide: for all goods, and for chain stages at their HS2 chapters. The flag shows in the table and the tooltip, not on the map, and links to an event page when the event’s product and an economy of the pair match. It never changes a value; it says that the relationship between the two reports has broken. US imports of chips (`8542`) from China are the case in point: the yearly ratio (US report ÷ China’s) was 1.14 in 2022, 0.79 in 2023 and 0.66 in 2024.',
    ko: '**신고 이탈 표시는 찾기만 하고 고치지 않습니다.** 교역 짝마다 12개월 미러 비율(수입국 신고 ÷ 수출국 신고, 양쪽 모두 매달 신고)을 계산합니다. 이 비율이 직전 36개월 중앙값 ± 3 MAD 밖이면 표시합니다. 범위의 폭은 중앙값의 ±10% 이상으로 둡니다. 전체 상품에서 계산하고, 공급망 단계는 해당 HS 2단위(류)에서 계산합니다. 표시는 지도가 아니라 표와 툴팁에 나타납니다. 경제 사건의 품목과 짝의 경제권이 맞으면 사건 페이지로 이어집니다. 값은 고치지 않습니다. 이 표시는 두 신고의 관계가 깨졌음을 알릴 뿐입니다. 미국의 중국산 반도체(`8542`) 수입이 그런 예입니다. 연간 비율(미국 신고 ÷ 중국 신고)은 2022년 1.14에서 2023년 0.79, 2024년 0.66으로 하락했습니다.',
  },
  'mx.p6': {
    en: '**Licence.** Like every file on the site, the monthly explorer stores derived records only: shares of world trade, ranks, ratios, estimate codes and one world total per window, with no original record. No single-month value of a flow or an economy is stored or can be computed: a flow enters a window only when it is positive in every month of it, the mirror ratio only when both reports are, and the build tests the largest flows’ windows for a single month in their span and refuses to finish if it finds one.',
    ko: '**이용 조건.** 사이트의 다른 파일처럼 월별 탐색도 파생 기록만 저장합니다. 파생 기록은 세계 교역 비중, 순위, 비율, 추정 표시, 합계 기간마다 세계 합계 하나입니다. 원자료 기록은 없습니다. 흐름이나 경제권의 한 달 값은 저장하지 않고 계산해 낼 수도 없습니다. 흐름은 합계 기간의 모든 달이 0보다 클 때만 들어가고, 미러 비율은 두 신고가 모두 그럴 때만 들어갑니다. 구축 단계에서 상위 흐름의 합계로 단월 값이 풀리는지 검사하고, 풀리면 구축을 멈춥니다.',
  },
  'mx.p7': {
    en: '**What the page cannot do.** Timing noise at product level remains: a 3-month window removes only part of it (see the timing share on the checks page), and chain stages swing more than all goods. Estimates are not reported data; they say what the importer would probably have reported, and they move once it files. The flags find a broken relationship; they do not say which report is right.',
    ko: '**이 페이지가 하지 못하는 것.** 품목 단위의 시점 잡음은 남습니다. 3개월 합계는 그 일부만 없앱니다(검증 페이지의 시점 몫 참조). 공급망 단계는 전체 상품보다 더 흔들립니다. 추정치는 신고된 자료가 아닙니다. 수입국이 신고했을 법한 값을 나타낼 뿐이고, 수입국이 신고하면 바뀝니다. 이탈 표시는 관계가 깨진 것을 찾을 뿐, 어느 신고가 맞는지는 말하지 않습니다.',
  },
  'mx.ref': {
    en: 'Source of the method: Marini, M., R. Dippelsman and M. Stanger (2018), [“New Estimates for Direction of Trade Statistics”](https://www.imf.org/en/Publications/WP/Issues/2018/01/24/New-Estimates-for-Direction-of-Trade-Statistics-45582), IMF Working Paper WP/18/16. Decision D14 of the build plan.',
    ko: '참고문헌: Marini, M., R. Dippelsman, M. Stanger (2018), [“New Estimates for Direction of Trade Statistics”](https://www.imf.org/en/Publications/WP/Issues/2018/01/24/New-Estimates-for-Direction-of-Trade-Statistics-45582), IMF 워킹페이퍼 WP/18/16. 구축 계획의 결정 D14.',
  },
  'cite.p1': { en: 'Cite the data with the build date of the files you used:', ko: '자료는 사용한 파일의 구축 날짜와 함께 인용합니다.' },
  'cite.text': {
    en: 'United Nations (2026), UN Comtrade Database, Final data, comtradeplus.un.org; derived by trade-flow, trade-flow.datasteg.com, files built {built}.',
    ko: 'United Nations (2026), UN Comtrade Database, Final data, comtradeplus.un.org; trade-flow(trade-flow.datasteg.com) 가공, 파일 구축 {built}.',
  },
  'cite.p2': {
    en: 'To cite a view, give its full address, the part after `#` included, and the date you saw it. The sources quoted on this page are Feenstra et al. (2005) for the mirror rule, Mitikj and Kaushik (2024) for mirror matching, Pierce and Schott (2012) for HS revisions and the IEA (2018) for the use share of crude.',
    ko: '화면을 인용할 때는 `#` 뒤까지 포함한 전체 주소와 본 날짜를 적습니다. 이 페이지가 인용한 출처는 다음과 같습니다. 미러 규칙은 Feenstra et al.(2005), 미러 짝 맞추기는 Mitikj and Kaushik(2024)입니다. HS 개정은 Pierce and Schott(2012), 원유 사용 비중은 IEA(2018)입니다.',
  },
  'source.line': {
    en: 'Source: UN Comtrade, Final data, annual and monthly; mirror rule. Files built {built}.',
    ko: '자료: UN Comtrade 확정치(연간·월별), 미러 규칙. 파일 구축 {built}.',
  },

  // ---------------------------------------------------------------------------------------------------------------
  // Checks page
  'ck.kicker': { en: 'Method · Checks', ko: '방법론 · 검증' },
  'ck.title': {
    en: 'In {fail} of {n} products, one year’s monthly files miss the annual files by over 5%',
    ko: '품목 {n}개 중 {fail}개는 어느 한 해의 월별 합계가 연간 값과 5% 넘게 어긋났다',
  },
  'ck.title.clean': {
    en: 'Every product’s monthly files match the annual total within 5%',
    ko: '모든 품목의 월별 합계가 연간 값과 5% 안에서 맞는다',
  },
  'ck.dek': {
    en: 'Every check in the ladder, its threshold, its last run and its result, for every product on the site. A check that could not run says “not run”, never “pass”.',
    ko: '사이트의 모든 품목을 검증 사다리의 모든 검증으로 점검한 결과입니다. 검증마다 기준치, 최근 실행, 결과를 싣습니다. 실행하지 못한 검증은 ‘통과’가 아니라 ‘미실행’으로 적습니다.',
  },
  'ck.tile.products': { en: 'Products checked', ko: '검증한 품목' },
  'ck.tile.products.meta': { en: 'all goods, chapters, baskets and chain stages', ko: '전체 상품, 류, 코드 묶음, 사슬 단계' },
  'ck.tile.run': { en: 'Last run', ko: '최근 실행' },
  'ck.tile.run.meta': { en: 'scripts/checks.py, after the snapshot build', ko: 'scripts/checks.py, 스냅숏 구축 뒤' },
  'ck.tile.val.meta': { en: 'series fetched and validated for tiers 1 and 2', ko: '1·2단계용으로 내려받아 확인한 시계열' },
  'ck.total': { en: 'All product checks, tiers 0–4', ko: '품목별 검증 합계(0–4단계)' },
  'ck.tile.records': { en: 'Original records in the bundle', ko: '자료 묶음의 원자료' },
  'ck.tile.records.meta': { en: 'budget {budget}; UN Comtrade’s line is {line}', ko: '예산 {budget}건, UN Comtrade의 선은 {line}건' },

  'ck.all.h': { en: 'Every check', ko: '모든 검증' },
  'ck.all.lede': {
    en: 'One row per check, with the number of products in each status. Tier 5 counts quoted numbers rather than products.',
    ko: '검증마다 한 줄이며, 상태별 품목 수를 집계합니다. 5단계는 품목이 아니라 인용 수치를 집계합니다.',
  },
  'ck.col.tier': { en: 'Tier', ko: '단계' },
  'ck.col.check': { en: 'Check', ko: '검증' },
  'ck.col.threshold': { en: 'Threshold', ko: '기준' },
  'ck.col.run': { en: 'Last run', ko: '최근 실행' },
  'ck.papers': { en: 'Papers: the numbers the case studies quote, found in the paper text', ko: '논문: 사례 연구가 인용한 수치를 논문 본문에서 확인' },
  'ck.papers.threshold': { en: 'pass when the quotation is found in the paper', ko: '인용문이 논문에 있으면 통과' },
  'ck.all.caption': {
    en: 'Counts: products (tiers 0–4) or quotations (tier 5) in each status. Thresholds as set in scripts/checks.py. Source: data/checks/index.json, run {run}.',
    ko: '건수는 상태별 품목 수(0–4단계) 또는 인용 수(5단계)입니다. 기준치는 scripts/checks.py에 정한 값입니다. 자료는 data/checks/index.json이며, 실행은 {run}입니다.',
  },

  'ck.prod.h': { en: 'By product', ko: '품목별' },
  'ck.prod.lede': {
    en: 'Tier 0 for every product and tier 1 where a national series exists. The monthly-sum status comes from the worst year, 2017 to {year}, of the value-weighted gap of the ten largest exporters and Korea (the sum of |twelve monthly files − annual file| ÷ the sum of the annual files); “Worst gap” is the largest single reporter’s gap (monthly sum ÷ annual − 1). Open a product to see its check pairs in the explorer.',
    ko: '모든 품목의 0단계와, 각국 시계열이 있는 품목의 1단계입니다. 월별 합계 판정은 10대 수출국과 한국의 금액 가중 차이(|월별 파일 12개 합계 − 연간 파일|의 합 ÷ 연간 파일의 합)가 2017–{year}년 가운데 가장 큰 해로 정합니다. ‘최대 차이’는 한 신고국의 가장 큰 차이(월별 합계 ÷ 연간 − 1)입니다. 품목을 열면 탐색 화면에서 검증 쌍을 볼 수 있습니다.',
  },
  'ck.col.product': { en: 'Product', ko: '품목' },
  'ck.col.kind': { en: 'Kind', ko: '종류' },
  'ck.col.sum': { en: 'Monthly sum', ko: '월별 합계' },
  'ck.col.gap': { en: 'Worst gap', ko: '최대 차이' },
  'ck.col.mirror': { en: 'Monthly mirror, 5 largest flows', ko: '월별 상대국 통계, 상위 5개 흐름' },
  'ck.col.t1': { en: 'Tier 1: national series', ko: '1단계: 각국 시계열' },
  'ck.col.open': { en: 'Explorer', ko: '탐색' },
  'ck.open': { en: 'Checks', ko: '검증 보기' },
  'ck.open.aria': { en: 'Open the checks of {name} in the explorer', ko: '{name} 검증을 탐색 화면에서 열기' },
  'ck.kind.total': { en: 'All goods', ko: '전체 상품' },
  'ck.kind.chapter': { en: 'HS chapter', ko: 'HS 류' },
  'ck.kind.basket': { en: 'Basket', ko: '코드 묶음' },
  'ck.kind.stage': { en: '{chain}, S{n}', ko: '{chain}, {n}단계' },
  'ck.mirror.out': { en: '{o} of {n} outside 0.8–1.25', ko: '{n}개 중 {o}개가 0.8–1.25 밖' },
  'ck.mirror.none': { en: 'no flow filed by both sides', ko: '양쪽 신고가 모두 있는 흐름 없음' },
  'ck.t1.korea': { en: 'Bank of Korea index', ko: '한국은행 지수' },
  'ck.t1.us': { en: 'US Census, {n} partners', ko: '미국 센서스, 상대국 {n}개국' },
  'ck.gap.at': { en: '{gap} · {iso} {year}', ko: '{gap} · {iso} {year}' },
  'ck.prod.caption': {
    en: 'Monthly sum: watch above 1%, fail above 5%. Mirror: the five largest flows filed by both sides, {p0} to {p1}; mean monthly ratio of the importer’s report to the exporter’s. Source: data/checks/<product>.json, run {run}.',
    ko: '월별 합계: 1% 초과 주의, 5% 초과 실패. 미러: 양쪽이 모두 신고한 상위 5개 흐름, {p0}–{p1}, 수입국 신고 ÷ 수출국 신고의 월평균. 자료: data/checks/<품목>.json, {run} 실행.',
  },

  'ck.val.h': { en: 'Validators', ko: '검증용 시계열' },
  'ck.val.lede': {
    en: 'The national and market series that tiers 1 and 2 compare against, fetched and validated through the articles pipeline’s tools.',
    ko: '1·2단계가 비교하는 각국·시장 시계열입니다. 기사 파이프라인의 도구로 내려받고 확인했습니다.',
  },
  'ck.val.col.id': { en: 'Series', ko: '시계열' },
  'ck.val.col.what': { en: 'What', ko: '내용' },
  'ck.val.col.last': { en: 'Last month fetched', ko: '마지막 수록 월' },
  'ck.val.col.status': { en: 'Fetched', ko: '수집' },
  'ck.val.yes': { en: 'fetched', ko: '수집함' },
  'ck.val.no': { en: 'not fetched', ko: '미수집' },
  'ck.val.caption': {
    en: 'ECOS: Bank of Korea. FRED: Federal Reserve Bank of St. Louis (Census imports, IMF commodity prices, Federal Reserve industrial production and H.10 exchange rates). Source: data/checks/index.json, run {run}.',
    ko: 'ECOS: 한국은행. FRED: 세인트루이스 연방준비은행(센서스국 수입, IMF 원자재 가격, 연준 산업생산과 H.10 환율). 자료: data/checks/index.json, {run} 실행.',
  },

  'ck.cov.h': { en: 'The coverage line', ko: '수록률' },
  'ck.rec.h': { en: 'The record count and the build', ko: '원자료 건수와 구축' },
  'ck.w.h': { en: 'The monthly explorer: timing, the splice and the single-month guard', ko: '월별 탐색: 시점 잡음, 추정, 단월 보호' },
  'ck.w.timing': {
    en: 'Timing. Where both sides filed every month ({p0} to {p1}), the importer’s and the exporter’s reports of the same flow drift apart from month to month because goods ship in one month and arrive in the next. For all goods ({n} flows), {v3} of the single-month variance of the log mirror ratio is gone at 3-month sums and {v12} at 12-month sums. The median timing share over {products} products is {med}. This is why the page shows no single month.',
    ko: '시점 잡음. 양쪽이 모든 달을 신고한 흐름({p0}~{p1})에서도 같은 흐름의 수입국 신고와 수출국 신고는 달마다 어긋납니다. 물품이 한 달에 선적되어 다음 달에 도착하기 때문입니다. 전체 상품({n}개 흐름)에서 로그 미러 비율의 단월 분산 가운데 {v3|이} 3개월 합계에서, {v12|이} 12개월 합계에서 사라집니다. 품목 {products}개의 중앙값은 {med}입니다. 이 페이지가 단월 값을 싣지 않는 이유입니다.',
  },
  'ck.w.backtest.lede': {
    en: 'The splice backtest hides windows that the importer did report, estimates them from the exporter’s report, and compares the estimate with the report. The table gives the median absolute error and, in brackets, the 90th percentile. “As built” is the splice the page uses (each month’s ratio from the 12 months ending a year earlier); “D14 form” is own(t − 12) × partner(t) ÷ partner(t − 12) on the window; “partner as is” is the exporter’s report with no splice, as the retired monthly lenses read it.',
    ko: '접합 백테스트는 수입국이 실제로 보고한 창을 가린 뒤 수출국 보고로 추정하고, 그 추정치를 실제 보고와 비교합니다. 표에는 절대오차의 중앙값을 적고, 괄호 안에 90번째 백분위수를 적었습니다. \'현행\'은 이 페이지가 쓰는 접합 방식입니다(각 달의 비율을 1년 전에 끝나는 12개월에서 산출). \'D14 방식\'은 창에 own(t − 12) × partner(t) ÷ partner(t − 12)를 적용한 것입니다. \'상대국 보고 그대로\'는 접합 없이 수출국 보고를 그대로 쓴 것으로, 폐기된 월간 렌즈가 읽던 방식입니다.',
  },
  'ck.w.backtest.caption': {
    en: 'Splice backtest, all goods, windows ending {p0} to {p1}: median absolute error (90th percentile). Importer size by 2024 imports in the monthly layer.',
    ko: '추정 역검증, 전체 상품, {p0}~{p1}에 끝나는 기간. 절대 오차율 중앙값(90분위). 수입국 규모는 월별 자료의 2024년 수입 기준.',
  },
  'ck.w.col.w': { en: 'Window', ko: '합계 기간' },
  'ck.w.col.size': { en: 'Importer size', ko: '수입국 규모' },
  'ck.w.col.n': { en: 'Windows tested', ko: '검사한 기간 수' },
  'ck.w.col.splice': { en: 'As built', ko: '적용 방식' },
  'ck.w.col.window': { en: 'D14 form', ko: 'D14 원안' },
  'ck.w.col.partner': { en: 'Partner as is', ko: '상대국 그대로' },
  'ck.w.size.all': { en: 'All', ko: '전체' },
  'ck.w.size.q1': { en: 'Smallest quarter (below {a})', ko: '하위 4분의 1({a} 미만)' },
  'ck.w.size.q2': { en: 'Second quarter ({a} to {b})', ko: '둘째 4분의 1({a}~{b})' },
  'ck.w.size.q3': { en: 'Third quarter ({b} to {c})', ko: '셋째 4분의 1({b}~{c})' },
  'ck.w.size.q4': { en: 'Largest quarter (above {c})', ko: '상위 4분의 1({c} 초과)' },
  'ck.w.median': {
    en: 'Over {products} products, the median of the products’ median errors is {s3} for the splice against {p3} for the partner’s report at 3 months, and {s12} against {p12} at 12 months.',
    ko: '품목 {products}개에서 품목별 오차 중앙값의 중앙값은 3개월 합계에서 추정 {s3}, 상대국 신고 그대로 {p3|입니다}. 12개월 합계에서는 각각 {s12}와 {p12|입니다}.',
  },
  'ck.w.guard': {
    en: 'The single-month guard. A flow enters a window only when its value is positive in every month of it, so every published window is a sum of three-month blocks of one series; the builder tests {n} flows for a single month in the span of their windows and found {k}. The rule leaves out {d12} of world value from 12-month windows and {d3} from 3-month windows on average, most of it in months not yet filed. {b} flow-years were benchmarked to annual files.',
    ko: '단월 보호. 한 흐름은 합계 기간의 모든 달 값이 0보다 클 때만 그 기간에 들어갑니다. 그래서 공개한 합계는 모두 한 계열의 3개월 묶음 합입니다. 구축 단계에서 흐름 {n}개를 검사했고, 단월 값이 풀리는 흐름은 {k}개였습니다. 이 규칙으로 빠지는 세계 교역은 평균 12개월 합계에서 {d12}, 3개월 합계에서 {d3}입니다. 대부분은 아직 신고되지 않은 달입니다. 연간 신고에 맞춘 흐름·연도는 {b}개입니다.',
  },
  'ck.rec.p': {
    en: 'The bundle stores derived records (shares, ranks, ratios) and **{originals}** original records (budget {budget}; UN Comtrade’s line is {line}). [Why and how](/{lang}/method#licence).',
    ko: '사이트 자료 묶음은 파생 기록(비중, 순위, 비율)을 저장하고, 원자료는 **{originals}**건입니다(예산 {budget}건, UN Comtrade의 선은 {line}건). [이유와 방법](/{lang}/method#licence).',
  },
  'ck.build.p': {
    en: 'The last build wrote {files} files ({size}) in {min} minutes, finishing on {built}.',
    ko: '최근 구축은 {built}에 끝났고, 파일 {files}개({size})를 {min}분에 썼습니다.',
  },

  // Korean names of the validators (English comes with the data).
  'val.ecos-403y001-aa-m': { en: 'Korea export value index, all goods', ko: '한국 수출금액지수, 전체' },
  'val.ecos-403y001-3091aa-m': { en: 'Korea export value index, semiconductors', ko: '한국 수출금액지수, 반도체' },
  'val.ecos-403y001-31211aa-m': { en: 'Korea export value index, motor vehicles', ko: '한국 수출금액지수, 자동차' },
  'val.ecos-403y001-3071aa-m': { en: 'Korea export value index, primary steel products', ko: '한국 수출금액지수, 1차 철강 제품' },
  'val.fred-us-imports-china-m': { en: 'US goods imports from China, customs basis', ko: '미국의 중국산 상품 수입(통관 기준)' },
  'val.fred-us-imports-mexico-m': { en: 'US goods imports from Mexico, customs basis', ko: '미국의 멕시코산 상품 수입(통관 기준)' },
  'val.fred-us-imports-korea-m': { en: 'US goods imports from Korea, customs basis', ko: '미국의 한국산 상품 수입(통관 기준)' },
  'val.fred-us-imports-japan-m': { en: 'US goods imports from Japan, customs basis', ko: '미국의 일본산 상품 수입(통관 기준)' },
  'val.fred-us-imports-vietnam-m': { en: 'US goods imports from Vietnam, customs basis', ko: '미국의 베트남산 상품 수입(통관 기준)' },
  'val.fred-us-imports-taiwan-m': { en: 'US goods imports from Taiwan, customs basis', ko: '미국의 대만산 상품 수입(통관 기준)' },
  'val.fred-us-imports-eu-m': { en: 'US goods imports from the European Union, customs basis', ko: '미국의 유럽연합산 상품 수입(통관 기준)' },
  'val.fred-nickel-price-m': { en: 'Global price of nickel (IMF)', ko: '니켈 국제 가격(IMF)' },
  'val.fred-copper-price-m': { en: 'Global price of copper (IMF)', ko: '구리 국제 가격(IMF)' },
  'val.fred-aluminium-price-m': { en: 'Global price of aluminium (IMF)', ko: '알루미늄 국제 가격(IMF)' },
  'val.fred-iron-ore-price-m': { en: 'Global price of iron ore (IMF)', ko: '철광석 국제 가격(IMF)' },
  'val.fred-brent-price-m': { en: 'Global price of Brent crude (IMF)', ko: '브렌트유 국제 가격(IMF)' },
  'val.fred-eu-gas-price-m': { en: 'Global price of natural gas, EU (IMF)', ko: '유럽 천연가스 국제 가격(IMF)' },
  'val.fred-us-ip-semiconductors-m': { en: 'US industrial production: semiconductors and components', ko: '미국 산업생산: 반도체와 부품' },
  'val.fred-us-ip-motor-vehicles-m': { en: 'US industrial production: motor vehicles and parts', ko: '미국 산업생산: 자동차와 부품' },
  'val.fred-us-ip-chemicals-m': { en: 'US industrial production: chemicals', ko: '미국 산업생산: 화학' },
  'val.fred-us-ip-primary-metals-m': { en: 'US industrial production: primary metals', ko: '미국 산업생산: 1차 금속' },
  'val.fred-krw-per-usd-m': { en: 'Won per US dollar, monthly average', ko: '원/달러 환율, 월평균' },
  'val.fred-jpy-per-usd-m': { en: 'Yen per US dollar, monthly average', ko: '엔/달러 환율, 월평균' },
  'val.fred-usd-per-eur-m': { en: 'US dollars per euro, monthly average', ko: '달러/유로 환율, 월평균' },
  'val.fred-cny-per-usd-m': { en: 'Yuan per US dollar, monthly average', ko: '위안/달러 환율, 월평균' },
} satisfies StringTable;
